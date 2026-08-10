import {
  DEFAULT_AT_BOTTOM_THRESHOLD,
  DEFAULT_AT_TOP_THRESHOLD,
  DEFAULT_ITEM_HEIGHT,
  EMPTY_SCROLL_LOCATION,
  normalizeLocation,
} from "./list-math";
import { OffsetTree } from "./offset-tree";
import { createPendingScroll } from "./pending-scroll";
import type { PendingResolution } from "./pending-scroll";
import { approximatelyEqual } from "./utils/approximatelyEqual";
import type {
  ItemLocation,
  ListScrollLocation,
  ScrollBehavior,
  ShortSizeAlign,
  VisibleItem,
} from "../types";

const HEIGHT_EPSILON = 0.01;

export interface ListEngineConfig<Data> {
  itemIdentity: (item: Data) => unknown;
  shortSizeAlign: ShortSizeAlign;
  increaseViewportBy: number;
  atBottomThreshold: number;
  atTopThreshold: number;
  defaultItemHeight: number;
}

export interface EngineChromeHeights {
  header: number;
  stickyHeader: number;
  footer: number;
  stickyFooter: number;
}

export interface EngineSnapshot<Data> {
  data: readonly Data[];
  visibleItems: readonly VisibleItem<Data>[];
  renderedData: readonly Data[];
  totalListHeight: number;
  shortListOffset: number;
  listStartOffset: number;
  listEndOffset: number;
  scrollHeight: number;
  viewportHeight: number;
  location: ListScrollLocation;
}

export interface ScrollTarget {
  top: number;
  behavior: ScrollBehavior;
  done?: () => void;
}

export interface ResolvedPendingScroll extends ScrollTarget {
  kind: "scroll-to" | "anchor" | "follow-bottom";
  /** Present for scroll-to resolutions so callers can retarget live. */
  location?: ItemLocation;
}

export interface SetDataOptions {
  purgeSizes?: boolean;
  /**
   * Suppress follow-bottom arming from the measurements caused by this data
   * change (honors `replace`'s `suppressItemMeasure`). Cleared on the next
   * flush.
   */
  suppressMeasureReactions?: boolean;
}

/**
 * Framework-agnostic core of the virtual list.
 *
 * Owns the canonical mutable state — data, per-item measured sizes, geometry,
 * pending scroll repairs, and the current scroll location — and exposes an
 * immutable snapshot for React via subscribe/getSnapshot
 * (useSyncExternalStore). All handlers read live engine fields, which removes
 * the stale-closure class of bugs entirely: there is exactly one copy of the
 * state and it is never captured by a render.
 *
 * Sizes are cached by item identity (`itemIdentity`), not by array index, so
 * prepend/insert/delete keep every measured height attached to the right
 * item. The Fenwick offset tree gives O(log n) scroll math.
 */
export interface ListEngine<Data> {
  // --- subscription (React binding) ---
  subscribe(listener: () => void): () => void;
  getSnapshot(): EngineSnapshot<Data>;
  getServerSnapshot(): EngineSnapshot<Data>;

  // --- configuration & geometry inputs ---
  configure(config: Partial<ListEngineConfig<Data>>): void;
  setViewportHeight(height: number): void;
  setChromeHeight(part: keyof EngineChromeHeights, height: number): void;
  updateScrollTop(scrollTop: number): void;

  // --- data ---
  getData(): Data[];
  setData(next: readonly Data[], options?: SetDataOptions): void;
  /** Batch several mutations into one notification. */
  transaction(run: () => void): void;

  // --- measurement ---
  /**
   * Record a measured item height. Returns true when the recorded height
   * actually changed. While the user is at the bottom, growth arms the
   * follow-bottom flag (never clobbering an anchor).
   */
  measureItem(index: number, height: number): boolean;

  // --- pending scroll intents ---
  /**
   * Anchor the current viewport to an item so an upcoming structural change
   * keeps it visually in place. Defaults to the first visible item.
   */
  captureAnchor(index?: number): void;
  requestScrollTo(location: ItemLocation): void;
  armFollowBottom(behavior?: ScrollBehavior): void;
  clearPendingScroll(): void;
  /**
   * Accumulated scrollTop correction for above-viewport height changes.
   * Returns the pending delta and resets it — callers apply it to the
   * scroller before resolving other pending intents.
   */
  takeScrollAdjustment(): number;
  hasPendingScroll(): boolean;
  /** Kind of the highest-priority pending intent, without consuming it. */
  pendingKind(): "scroll-to" | "anchor" | "follow-bottom" | null;
  /**
   * Resolve the highest-priority pending intent into an absolute scroller
   * target using current (post-measurement) geometry. Consumes the intent.
   */
  resolvePendingScroll(): ResolvedPendingScroll | null;

  // --- queries ---
  getLocation(): ListScrollLocation;
  /** Scroller-coordinate offset of an item's top (chrome included). */
  scrollerOffsetOf(index: number): number;
  heightOf(index: number): number;
  totalListHeight(): number;
  /** Full scroller content height, chrome and short-list filler included. */
  scrollHeight(): number;
  listStartOffset(): number;
  listEndOffset(): number;
  shortListOffset(): number;
  chromeHeights(): EngineChromeHeights;
  /** Absolute scroller target for an item location (align resolved). */
  scrollTargetFor(location: ItemLocation): ScrollTarget;
  bottomScrollTop(): number;
  indexOfIdentity(identityKey: unknown): number;
}

export function createListEngine<Data>(
  initial?: Partial<ListEngineConfig<Data>>,
): ListEngine<Data> {
  const config: ListEngineConfig<Data> = {
    itemIdentity: (item: Data) => item,
    shortSizeAlign: "top",
    increaseViewportBy: 0,
    atBottomThreshold: DEFAULT_AT_BOTTOM_THRESHOLD,
    atTopThreshold: DEFAULT_AT_TOP_THRESHOLD,
    defaultItemHeight: DEFAULT_ITEM_HEIGHT,
    ...initial,
  };

  let data: Data[] = [];
  const tree = new OffsetTree();
  const sizeCache = new Map<unknown, number>();
  // Heights currently assigned in the tree, by identity. Unmeasured items
  // keep the estimate they were first assigned across rebuilds — if rebuilds
  // re-estimated existing items, anchor deltas would absorb estimation noise
  // instead of reflecting only inserted/removed content.
  let assignedHeights = new Map<unknown, number>();
  // Running mean of measured heights: a far better estimate for unmeasured
  // items than a fixed constant, which stabilizes prepend anchoring.
  let measuredSum = 0;
  let measuredCount = 0;

  const chrome: EngineChromeHeights = {
    header: 0,
    stickyHeader: 0,
    footer: 0,
    stickyFooter: 0,
  };
  let viewportHeight = 0;
  let scrollTop = 0;

  const pending = createPendingScroll();

  let location: ListScrollLocation = EMPTY_SCROLL_LOCATION;
  let suppressMeasureReactions = false;
  // Accumulated scrollTop correction for height changes that happened
  // entirely above the viewport (window resize re-wrapping rows, unmeasured
  // rows measuring in as the user scrolls up). Without it the content shifts
  // under the reader — and can spuriously drift into the at-top zone.
  let scrollAdjustment = 0;
  let snapshot: EngineSnapshot<Data> | null = null;
  let snapshotDirty = true;
  const listeners = new Set<() => void>();
  let txDepth = 0;
  let txNotify = false;

  const estimateHeight = () =>
    measuredCount > 0 ? measuredSum / measuredCount : config.defaultItemHeight;

  const listStartOffset = () => chrome.header + chrome.stickyHeader;
  const listEndOffset = () => chrome.footer + chrome.stickyFooter;

  const shortListOffset = () => {
    if (config.shortSizeAlign === "top") return 0;

    return Math.max(
      0,
      viewportHeight - listStartOffset() - listEndOffset() - tree.total(),
    );
  };

  const scrollHeight = () =>
    listStartOffset() + shortListOffset() + tree.total() + listEndOffset();

  /** Viewport height available to list content (sticky footer excluded). */
  const listViewportHeight = () =>
    Math.max(0, viewportHeight - listEndOffset());

  /** Scroll top translated into list-content coordinates. */
  const listScrollTop = () =>
    Math.max(0, scrollTop - listStartOffset() - shortListOffset());

  const computeLocation = (): ListScrollLocation => {
    const itemCount = data.length;
    const total = tree.total();
    const viewport = listViewportHeight();
    const top = listScrollTop();
    const viewportBottom = top + viewport;
    const bottomOffset = Math.max(0, total - top - viewport);

    let firstVisibleItemIndex = 0;
    let lastVisibleItemIndex = 0;
    let lastItemBottomOffset = 0;

    if (itemCount > 0) {
      firstVisibleItemIndex = tree.indexAtOffset(top);

      // Last item whose bottom edge is fully inside the viewport.
      let last = tree.indexAtOffset(viewportBottom);
      while (last > 0 && tree.prefixSum(last + 1) > viewportBottom) {
        last -= 1;
      }

      const lastBottom = tree.prefixSum(last + 1);
      if (lastBottom <= viewportBottom) {
        lastVisibleItemIndex = last;
        lastItemBottomOffset = viewportBottom - lastBottom;
      }
    }

    return {
      listOffset: -top,
      visibleListHeight: viewport,
      scrollHeight: total,
      bottomOffset,
      isAtBottom: bottomOffset <= config.atBottomThreshold,
      isAtTop: top <= config.atTopThreshold,
      firstVisibleItemIndex,
      lastVisibleItemIndex,
      lastItemBottomOffset,
    };
  };

  const locationsEqual = (a: ListScrollLocation, b: ListScrollLocation) =>
    a.listOffset === b.listOffset &&
    a.visibleListHeight === b.visibleListHeight &&
    a.scrollHeight === b.scrollHeight &&
    a.bottomOffset === b.bottomOffset &&
    a.isAtBottom === b.isAtBottom &&
    a.isAtTop === b.isAtTop &&
    a.firstVisibleItemIndex === b.firstVisibleItemIndex &&
    a.lastVisibleItemIndex === b.lastVisibleItemIndex &&
    a.lastItemBottomOffset === b.lastItemBottomOffset;

  const refreshLocation = () => {
    const next = computeLocation();

    if (!locationsEqual(location, next)) {
      location = next;

      return true;
    }

    return false;
  };

  const notify = () => {
    if (txDepth > 0) {
      txNotify = true;

      return;
    }

    for (const listener of listeners) {
      listener();
    }
  };

  const markDirty = () => {
    snapshotDirty = true;
    refreshLocation();
    notify();
  };

  const buildVisibleItems = (): VisibleItem<Data>[] => {
    const itemCount = data.length;
    if (itemCount === 0 || listViewportHeight() <= 0) return [];

    const minVisible = Math.max(0, listScrollTop() - config.increaseViewportBy);
    const maxVisible =
      listScrollTop() + listViewportHeight() + config.increaseViewportBy;

    const start = tree.indexAtOffset(minVisible);
    const end = Math.min(itemCount - 1, tree.indexAtOffset(maxVisible));

    const items: VisibleItem<Data>[] = [];
    let offset = tree.prefixSum(start);

    for (let index = start; index <= end; index += 1) {
      const height = tree.heightAt(index);

      items.push({
        data: data[index] as Data,
        prevData: index > 0 ? (data[index - 1] as Data) : null,
        nextData: index < itemCount - 1 ? (data[index + 1] as Data) : null,
        index,
        offset,
        height,
      });

      offset += height;
    }

    return items;
  };

  const visibleItemsEqual = (
    a: readonly VisibleItem<Data>[],
    b: readonly VisibleItem<Data>[],
  ) => {
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i += 1) {
      const left = a[i];
      const right = b[i];

      if (
        left.data !== right.data ||
        left.prevData !== right.prevData ||
        left.nextData !== right.nextData ||
        left.index !== right.index ||
        left.offset !== right.offset ||
        left.height !== right.height
      ) {
        return false;
      }
    }

    return true;
  };

  const emptySnapshot: EngineSnapshot<Data> = {
    data: [],
    visibleItems: [],
    renderedData: [],
    totalListHeight: 0,
    shortListOffset: 0,
    listStartOffset: 0,
    listEndOffset: 0,
    scrollHeight: 0,
    viewportHeight: 0,
    location: EMPTY_SCROLL_LOCATION,
  };

  const rebuildSnapshot = (): EngineSnapshot<Data> => {
    const previous = snapshot;
    const nextVisibleItems = buildVisibleItems();
    const visibleItems =
      previous && visibleItemsEqual(previous.visibleItems, nextVisibleItems)
        ? previous.visibleItems
        : nextVisibleItems;
    const renderedData =
      previous && previous.visibleItems === visibleItems
        ? previous.renderedData
        : visibleItems.map((item) => item.data);

    const next: EngineSnapshot<Data> = {
      data,
      visibleItems,
      renderedData,
      totalListHeight: tree.total(),
      shortListOffset: shortListOffset(),
      listStartOffset: listStartOffset(),
      listEndOffset: listEndOffset(),
      scrollHeight: scrollHeight(),
      viewportHeight,
      location,
    };

    if (
      previous &&
      previous.data === next.data &&
      previous.visibleItems === next.visibleItems &&
      previous.totalListHeight === next.totalListHeight &&
      previous.shortListOffset === next.shortListOffset &&
      previous.listStartOffset === next.listStartOffset &&
      previous.listEndOffset === next.listEndOffset &&
      previous.scrollHeight === next.scrollHeight &&
      previous.viewportHeight === next.viewportHeight &&
      previous.location === next.location
    ) {
      return previous;
    }

    return next;
  };

  const rebuildHeights = () => {
    const estimate = estimateHeight();
    const nextAssigned = new Map<unknown, number>();
    const heights = data.map((item) => {
      const identityKey = config.itemIdentity(item);
      const height =
        sizeCache.get(identityKey) ??
        assignedHeights.get(identityKey) ??
        estimate;

      nextAssigned.set(identityKey, height);

      return height;
    });

    assignedHeights = nextAssigned;
    tree.build(heights);
  };

  const scrollTargetFor = (targetLocation: ItemLocation): ScrollTarget => {
    const itemCount = data.length;
    const normalized = normalizeLocation(targetLocation, itemCount - 1);
    const base = listStartOffset() + shortListOffset();
    const itemTop = base + tree.prefixSum(normalized.index);
    const itemHeight = tree.heightAt(normalized.index);
    const viewport = listViewportHeight();

    let top = itemTop;

    if (normalized.align === "end") {
      top = itemTop - viewport + itemHeight;
    } else if (normalized.align === "center") {
      top = itemTop - viewport / 2 + itemHeight / 2;
    } else if (normalized.align === "start-no-overflow") {
      if (itemTop < scrollTop) {
        top = itemTop;
      } else if (itemTop + itemHeight > scrollTop + viewport) {
        top = itemTop - viewport + itemHeight;
      } else {
        top = scrollTop;
      }
    }

    top += normalized.offset;

    const maxTop = Math.max(0, scrollHeight() - viewportHeight);

    return {
      top: Math.max(0, Math.min(top, maxTop)),
      behavior: normalized.behavior,
      done: normalized.done,
    };
  };

  const indexOfIdentity = (identityKey: unknown) => {
    for (let index = 0; index < data.length; index += 1) {
      if (config.itemIdentity(data[index] as Data) === identityKey) {
        return index;
      }
    }

    return -1;
  };

  const engine: ListEngine<Data> = {
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      if (snapshotDirty || snapshot === null) {
        snapshot = rebuildSnapshot();
        snapshotDirty = false;
      }

      return snapshot;
    },
    getServerSnapshot() {
      return emptySnapshot;
    },

    configure(next) {
      // Function-valued config (itemIdentity) is swapped silently — a new
      // function identity per render must not invalidate the snapshot.
      // Value-typed config only marks dirty when something actually changed,
      // so this is safe to call on every commit.
      let changed = false;

      for (const key of Object.keys(next) as (keyof ListEngineConfig<Data>)[]) {
        const value = next[key];
        if (value === undefined || config[key] === value) continue;

        (config as unknown as Record<string, unknown>)[key] = value;

        if (typeof value !== "function") {
          changed = true;
        }
      }

      if (changed) {
        markDirty();
      }
    },
    setViewportHeight(height) {
      if (height === viewportHeight) return;

      viewportHeight = height;
      markDirty();
    },
    setChromeHeight(part, height) {
      if (approximatelyEqual(chrome[part], height, HEIGHT_EPSILON)) return;

      chrome[part] = height;
      markDirty();
    },
    updateScrollTop(nextScrollTop) {
      if (nextScrollTop === scrollTop) return;

      scrollTop = nextScrollTop;
      markDirty();
    },

    getData() {
      return data.slice();
    },
    setData(next, options) {
      if (options?.purgeSizes) {
        sizeCache.clear();
        assignedHeights.clear();
        measuredSum = 0;
        measuredCount = 0;
      }

      if (options?.suppressMeasureReactions) {
        suppressMeasureReactions = true;
      }

      data = next.slice();
      rebuildHeights();
      markDirty();
    },
    transaction(run) {
      txDepth += 1;

      try {
        run();
      } finally {
        txDepth -= 1;

        if (txDepth === 0 && txNotify) {
          txNotify = false;
          notify();
        }
      }
    },

    measureItem(index, height) {
      if (index < 0 || index >= data.length) return false;

      const identityKey = config.itemIdentity(data[index] as Data);
      const previous = sizeCache.get(identityKey);

      if (
        previous !== undefined &&
        approximatelyEqual(previous, height, HEIGHT_EPSILON)
      ) {
        return false;
      }

      if (previous === undefined) {
        measuredSum += height;
        measuredCount += 1;
      } else {
        measuredSum += height - previous;
      }

      // The delta relative to what the tree currently holds (measured or
      // estimated), and whether the item sits entirely above the viewport —
      // both read BEFORE the tree is updated.
      const treeDelta = height - tree.heightAt(index);
      const entirelyAbove = tree.prefixSum(index + 1) <= listScrollTop();

      sizeCache.set(identityKey, height);
      tree.set(index, height);

      if (!suppressMeasureReactions) {
        if (location.isAtBottom) {
          // Growth while pinned to the bottom keeps following the bottom.
          // This is a flag, not an action: it can never clobber a pending
          // anchor.
          pending.armFollowBottom("auto");
        } else if (entirelyAbove && !pending.hasPending()) {
          // Keep the viewport still when content above it changes size. When
          // an anchor or explicit target is pending, that repair already
          // accounts for this measurement — adding it here would double-count.
          scrollAdjustment += treeDelta;
        }
      }

      markDirty();

      return true;
    },

    captureAnchor(index) {
      if (data.length === 0) return;

      const anchorIndex = Math.min(
        Math.max(index ?? location.firstVisibleItemIndex, 0),
        data.length - 1,
      );

      pending.captureAnchor(
        config.itemIdentity(data[anchorIndex] as Data),
        listStartOffset() + shortListOffset() + tree.prefixSum(anchorIndex),
      );
    },
    requestScrollTo(targetLocation) {
      pending.requestScrollTo(targetLocation);
    },
    armFollowBottom(behavior) {
      pending.armFollowBottom(behavior);
    },
    clearPendingScroll() {
      pending.clear();
      scrollAdjustment = 0;
    },
    takeScrollAdjustment() {
      const adjustment = scrollAdjustment;
      scrollAdjustment = 0;

      return adjustment;
    },
    hasPendingScroll() {
      return pending.hasPending();
    },
    pendingKind() {
      return pending.peek()?.kind ?? null;
    },
    resolvePendingScroll() {
      // The flush at the end of a commit cycle re-enables measure reactions.
      suppressMeasureReactions = false;

      const resolution: PendingResolution | null = pending.consume();
      if (!resolution) return null;

      if (resolution.kind === "scroll-to") {
        return {
          ...scrollTargetFor(resolution.location),
          kind: "scroll-to",
          location: resolution.location,
        };
      }

      if (resolution.kind === "anchor") {
        const index = indexOfIdentity(resolution.identityKey);
        // Anchor item is gone (e.g. trimmed); nothing to repair against.
        if (index === -1) return null;

        const nextOffset =
          listStartOffset() + shortListOffset() + tree.prefixSum(index);
        const delta = nextOffset - resolution.prevOffset;

        if (delta === 0) return null;

        return {
          top: Math.max(0, scrollTop + delta),
          behavior: "instant",
          kind: "anchor",
        };
      }

      return {
        top: engine.bottomScrollTop(),
        behavior: resolution.behavior,
        kind: "follow-bottom",
      };
    },

    getLocation() {
      return location;
    },
    scrollerOffsetOf(index) {
      return listStartOffset() + shortListOffset() + tree.prefixSum(index);
    },
    heightOf(index) {
      return tree.heightAt(index);
    },
    totalListHeight() {
      return tree.total();
    },
    scrollHeight,
    listStartOffset,
    listEndOffset,
    shortListOffset,
    chromeHeights() {
      return { ...chrome };
    },
    scrollTargetFor,
    bottomScrollTop() {
      return Math.max(0, scrollHeight() - viewportHeight);
    },
    indexOfIdentity,
  };

  return engine;
}
