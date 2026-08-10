import React, {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";

import {
  LocationContext,
  MethodsContext,
  RenderedDataContext,
} from "./contexts";
import { createItemMeasurer } from "../engine/dom-adapter";
import type { ItemMeasurer } from "../engine/dom-adapter";
import { createListEngine } from "../engine/engine";
import type { ListEngine, ResolvedPendingScroll } from "../engine/engine";
import { normalizeLocation } from "../engine/list-math";
import { createSmoothScrollController } from "../engine/smooth-scroll";
import type { SmoothScrollController } from "../engine/smooth-scroll";
import { SognaVirtualListTestingContext } from "../testing/context";
import type {
  AutoscrollToBottom,
  ContextAwareComponent,
  DataWithScrollModifier,
  HeaderWrapperComponent,
  ItemContent,
  ItemLocation,
  ScrollBehavior,
  ScrollElementComponent,
  ScrollModifier,
  SognaVirtualListLicenseProps,
  SognaVirtualListMethods,
  SognaVirtualListProps,
} from "../types";

// Minimal ambient declaration so we can gate dev warnings on NODE_ENV without
// depending on @types/node. Bundlers typically inline the value.
declare const process:
  | { env?: { NODE_ENV?: string | undefined } | undefined }
  | undefined;

// useLayoutEffect warns during SSR; fall back to useEffect on the server.
const useIsomorphicLayoutEffect =
  typeof document !== "undefined" ? useLayoutEffect : useEffect;

const defaultItemContent: ItemContent<unknown, unknown> = ({ index }) => (
  <div>Item {index}</div>
);

const defaultComputeItemKey = <Data, Context>({
  index,
}: {
  data: Data;
  index: number;
  context: Context;
}) => index;

const identity = <Data,>(item: Data) => item;

const noCleanup = () => undefined;

const DefaultWrapper = forwardRef<
  HTMLDivElement,
  {
    style: React.CSSProperties;
    children: React.ReactNode;
  }
>(({ style, children }, ref) => (
  <div ref={ref} style={style}>
    {children}
  </div>
));

DefaultWrapper.displayName = "DefaultVirtualListWrapper";

const StickyHeaderWrapper = forwardRef<
  HTMLDivElement,
  {
    style: React.CSSProperties;
    children: React.ReactNode;
  }
>(({ style, children }, ref) => (
  <div
    ref={ref}
    style={{
      position: "sticky",
      top: 0,
      zIndex: 1,
      ...style,
    }}
  >
    {children}
  </div>
));

StickyHeaderWrapper.displayName = "StickyHeaderWrapper";

const StickyFooterWrapper = forwardRef<
  HTMLDivElement,
  {
    style: React.CSSProperties;
    children: React.ReactNode;
  }
>(({ style, children }, ref) => (
  <div
    ref={ref}
    style={{
      bottom: 0,
      position: "sticky",
      zIndex: 1,
      ...style,
    }}
  >
    {children}
  </div>
));

StickyFooterWrapper.displayName = "StickyFooterWrapper";

/** Compare scroll modifiers semantically so an inline-recreated but
 * equivalent modifier object does not count as a new instruction. */
function scrollModifiersEqual(a: ScrollModifier, b: ScrollModifier): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (typeof a === "string" || typeof b === "string") return a === b;
  if (a.type !== b.type) return false;

  if (a.type === "item-location" && b.type === "item-location") {
    return (
      a.location === b.location && a.purgeItemSizes === b.purgeItemSizes
    );
  }

  if (a.type === "auto-scroll-to-bottom" && b.type === "auto-scroll-to-bottom") {
    return a.autoScroll === b.autoScroll;
  }

  if (a.type === "items-change" && b.type === "items-change") {
    return a.behavior === b.behavior;
  }

  return false;
}

function SognaVirtualListInner<Data, Context>(
  props: SognaVirtualListProps<Data, Context>,
  ref: React.ForwardedRef<SognaVirtualListMethods<Data, Context>>,
) {
  const {
    initialData = [],
    computeItemKey = defaultComputeItemKey<Data, Context>,
    context = null as Context,
    initialLocation: initialLocationProp,
    messageFlow = "top-down",
    shortSizeAlign: shortSizeAlignProp,
    onScroll,
    onRenderedDataChange,
    ItemContent = defaultItemContent as ItemContent<Data, Context>,
    Header = null,
    StickyHeader = null,
    Footer = null,
    StickyFooter = null,
    EmptyPlaceholder = null,
    HeaderWrapper = DefaultWrapper as HeaderWrapperComponent,
    StickyHeaderWrapper:
      StickyHeaderWrapperProp = StickyHeaderWrapper as HeaderWrapperComponent,
    FooterWrapper = DefaultWrapper as HeaderWrapperComponent,
    StickyFooterWrapper:
      StickyFooterWrapperProp = StickyFooterWrapper as HeaderWrapperComponent,
    useWindowScroll = false,
    customScrollParent = null,
    ScrollElement = "div",
    increaseViewportBy = 0,
    onStartReached,
    onEndReached,
    atTopThreshold,
    atBottomThreshold,
    data: controlledData,
    itemIdentity = identity<Data>,
    enforceStickyFooterAtBottom = false,
    style,
    ...scrollerProps
  } = props;
  const testingContext = useContext(SognaVirtualListTestingContext);
  const shortSizeAlign =
    shortSizeAlignProp ?? (messageFlow === "bottom-up" ? "bottom" : "top");
  const initialLocation =
    initialLocationProp ??
    (messageFlow === "bottom-up"
      ? ({
          index: "LAST",
          align: "end",
          behavior: "auto",
        } as const)
      : null);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const stickyHeaderRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const stickyFooterRef = useRef<HTMLDivElement | null>(null);

  // Latest-value refs so stable callbacks never close over stale props.
  const contextRef = useRef(context);
  contextRef.current = context;
  const itemIdentityRef = useRef(itemIdentity);
  itemIdentityRef.current = itemIdentity;
  const testingContextRef = useRef(testingContext);
  testingContextRef.current = testingContext;
  const onScrollRef = useRef(onScroll);
  onScrollRef.current = onScroll;
  const onRenderedDataChangeRef = useRef(onRenderedDataChange);
  onRenderedDataChangeRef.current = onRenderedDataChange;
  const onStartReachedRef = useRef(onStartReached);
  onStartReachedRef.current = onStartReached;
  const onEndReachedRef = useRef(onEndReached);
  onEndReachedRef.current = onEndReached;
  const initialLocationRef = useRef(initialLocation);
  initialLocationRef.current = initialLocation;

  const initialLocationAppliedRef = useRef(false);
  const warnedUnsupportedScrollerRef = useRef(false);
  const scrollRafRef = useRef<number | null>(null);
  // Multi-pass settle state: a jump computed from estimated heights lands
  // wrong once real measurements arrive; the flush effect keeps re-applying
  // the live target (bounded) until the geometry stabilizes.
  const settleRef = useRef<{
    kind: "scroll-to" | "follow-bottom";
    getTarget: () => number;
    attempts: number;
  } | null>(null);
  const lastAppliedControlledDataRef = useRef<{
    data: Data[] | null | undefined;
    modifier: ScrollModifier;
  } | null>(null);

  // --- engine, smooth scroll, and item measurer: created exactly once ---
  const engineRef = useRef<ListEngine<Data> | null>(null);
  const smoothScrollRef = useRef<SmoothScrollController | null>(null);
  const measurerRef = useRef<ItemMeasurer | null>(null);

  if (engineRef.current === null) {
    const engine = createListEngine<Data>({
      itemIdentity,
      shortSizeAlign,
      increaseViewportBy,
    });

    if (testingContext) {
      engine.setViewportHeight(testingContext.viewportHeight);
    }

    const seed = controlledData?.data ?? initialData ?? [];
    if (seed.length > 0) {
      engine.setData(seed);
    }

    if (controlledData !== undefined) {
      lastAppliedControlledDataRef.current = {
        data: controlledData?.data,
        modifier: controlledData?.scrollModifier,
      };
    }

    engineRef.current = engine;
  }

  const engine = engineRef.current;

  if (smoothScrollRef.current === null) {
    smoothScrollRef.current = createSmoothScrollController(
      () => scrollerRef.current,
      (top) => engine.updateScrollTop(top),
    );
  }

  const smoothScroll = smoothScrollRef.current;

  /** Sync the list container's height/margin styles imperatively so a
   * scrollTop write that follows never clamps against stale geometry. */
  const syncListLayout = useCallback(() => {
    const list = listRef.current;
    if (!list) return;

    const heightPx = `${engine.totalListHeight()}px`;
    if (list.style.height !== heightPx) {
      list.style.height = heightPx;
    }

    const marginPx = `${engine.shortListOffset()}px`;
    if (list.style.marginTop !== marginPx) {
      list.style.marginTop = marginPx;
    }
  }, [engine]);

  /** Compensate for above-viewport height changes (window resize reflow,
   * late measurements while scrolling up) so content never shifts under the
   * reader. */
  const applyScrollAdjustment = useCallback(() => {
    const adjustment = engine.takeScrollAdjustment();
    if (adjustment === 0) return;

    const element = scrollerRef.current;
    if (!element) return;

    syncListLayout();
    element.scrollTop += adjustment;
    engine.updateScrollTop(element.scrollTop);
  }, [engine, syncListLayout]);

  const applyScrollTarget = useCallback(
    (target: ResolvedPendingScroll | null) => {
      if (!target) return;

      const element = scrollerRef.current;
      if (!element) return;

      // Live target getters: follow-bottom chases streaming growth and
      // scroll-to re-resolves as late measurements land during the animation.
      const getTarget =
        target.kind === "follow-bottom"
          ? () => engine.bottomScrollTop()
          : target.kind === "scroll-to" && target.location !== undefined
            ? () => engine.scrollTargetFor(target.location as ItemLocation).top
            : () => target.top;

      // Anchors are exact (both offsets come from the same tree); jumps and
      // bottom-follows may need extra passes as late measurements land.
      settleRef.current =
        target.kind === "anchor"
          ? null
          : { kind: target.kind, getTarget, attempts: 0 };

      const done = target.done;
      smoothScroll.scrollTo(
        getTarget,
        target.behavior,
        done ? (reason) => reason === "completed" && done() : undefined,
      );
    },
    [engine, smoothScroll],
  );

  if (measurerRef.current === null) {
    measurerRef.current = createItemMeasurer({
      onMeasure: (index, height) => {
        engine.measureItem(index, height);
      },
      onAfterResizeBatch: () => {
        // Streaming fast path: repair the scroll position inside the RO
        // callback (pre-paint of this frame) instead of waiting for a React
        // commit — one wrong frame per token is very visible.
        applyScrollAdjustment();

        if (engine.pendingKind() !== "follow-bottom") return;
        if (smoothScroll.scrolling()) {
          // An active smooth scroll already chases a live target.
          engine.clearPendingScroll();

          return;
        }

        syncListLayout();
        applyScrollTarget(engine.resolvePendingScroll());
      },
      getHeightOverride: (element, index) => {
        const testing = testingContextRef.current;
        if (!testing) return undefined;

        const item = engine.getData()[index];

        return testing.getItemHeight?.(item, index) ?? testing.itemHeight;
      },
    });
  }

  const measurer = measurerRef.current;

  // --- React binding ---
  const snapshot = useSyncExternalStore(
    engine.subscribe,
    engine.getSnapshot,
    engine.getServerSnapshot,
  );

  // Keep value-typed engine config in sync (no-ops when nothing changed).
  useIsomorphicLayoutEffect(() => {
    engine.configure({
      itemIdentity,
      shortSizeAlign,
      increaseViewportBy,
      atTopThreshold,
      atBottomThreshold,
    });
  }, [
    engine,
    itemIdentity,
    shortSizeAlign,
    increaseViewportBy,
    atTopThreshold,
    atBottomThreshold,
  ]);

  /** Pull the freshest scrollTop out of the DOM before making decisions —
   * scroll events are rAF-coalesced, so the engine can lag by a frame. */
  const syncScrollTop = useCallback(() => {
    const element = scrollerRef.current;
    if (element) {
      engine.updateScrollTop(element.scrollTop);
    }
  }, [engine]);

  const handleScroll = useCallback(() => {
    if (testingContextRef.current) {
      // Deterministic in tests: no rAF hop.
      syncScrollTop();

      return;
    }

    if (scrollRafRef.current !== null) return;

    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      syncScrollTop();
    });
  }, [syncScrollTop]);

  const resolveAutoScroll = useCallback(
    (
      changedData: Data[],
      scrollToBottomBehavior?: AutoscrollToBottom<Data, Context>,
    ): ItemLocation | ScrollBehavior | true | null => {
      if (
        scrollToBottomBehavior === false ||
        scrollToBottomBehavior === null ||
        scrollToBottomBehavior === undefined
      ) {
        return null;
      }

      syncScrollTop();
      const currentLocation = engine.getLocation();

      if (typeof scrollToBottomBehavior === "function") {
        const result = scrollToBottomBehavior({
          scrollLocation: currentLocation,
          scrollInProgress: smoothScroll.scrolling(),
          atBottom: currentLocation.isAtBottom,
          data: changedData,
          context: contextRef.current,
        });

        // Explicit checks so the valid item location `0` is not coerced away.
        if (result === false || result === null || result === undefined) {
          return null;
        }

        return result;
      }

      if (!currentLocation.isAtBottom) {
        return null;
      }

      return scrollToBottomBehavior === true ? true : scrollToBottomBehavior;
    },
    [engine, smoothScroll, syncScrollTop],
  );

  const scheduleAutoScroll = useCallback(
    (
      changedData: Data[],
      scrollToBottomBehavior?: AutoscrollToBottom<Data, Context>,
    ) => {
      const result = resolveAutoScroll(changedData, scrollToBottomBehavior);

      if (result === null) return;

      // Custom easing functions and behavior strings mean "follow the
      // bottom"; numbers and objects are explicit item locations.
      if (result !== true && (typeof result === "number" || typeof result === "object")) {
        engine.requestScrollTo(result);

        return;
      }

      engine.armFollowBottom(result === true ? "auto" : result);
    },
    [engine, resolveAutoScroll],
  );

  const scrollToLocation = useCallback(
    (location: ItemLocation) => {
      syncListLayout();

      const target = engine.scrollTargetFor(location);
      applyScrollTarget({ ...target, kind: "scroll-to", location });
    },
    [applyScrollTarget, engine, syncListLayout],
  );

  // --- imperative API (stable identity: everything reads live engine state) ---
  const methods = useMemo<SognaVirtualListMethods<Data, Context>>(
    () => ({
      data: {
        prepend: (data) => {
          if (data.length === 0) return;

          syncScrollTop();
          engine.captureAnchor();
          engine.setData([...data, ...engine.getData()]);
        },
        append: (data, autoscrollToBottom) => {
          if (data.length === 0) return;

          scheduleAutoScroll(data, autoscrollToBottom);
          engine.setData([...engine.getData(), ...data]);
        },
        map: (callbackfn, autoscrollToBottomBehavior) => {
          syncScrollTop();
          const shouldScroll = engine.getLocation().isAtBottom;

          engine.setData(engine.getData().map(callbackfn));

          if (shouldScroll && autoscrollToBottomBehavior) {
            engine.requestScrollTo(
              typeof autoscrollToBottomBehavior === "object"
                ? (autoscrollToBottomBehavior.location() ?? {
                    index: "LAST",
                    align: "end",
                  })
                : {
                    index: "LAST",
                    align: "end",
                    behavior: autoscrollToBottomBehavior,
                  },
            );
          }
        },
        mapWithAnchor: (callbackfn, anchorItemIndex) => {
          syncScrollTop();
          engine.captureAnchor(anchorItemIndex);
          engine.setData(engine.getData().map(callbackfn));
        },
        findAndDelete: (predicate) => {
          const current = engine.getData();
          const deleted = new Set<number>();

          current.forEach((item, index) => {
            if (predicate(item, index)) {
              deleted.add(index);
            }
          });

          if (deleted.size === 0) return;

          syncScrollTop();

          // Anchor the first visible item that survives the deletion.
          const firstVisible = engine.getLocation().firstVisibleItemIndex;
          let anchorIndex = firstVisible;
          while (anchorIndex < current.length && deleted.has(anchorIndex)) {
            anchorIndex += 1;
          }
          if (anchorIndex >= current.length) {
            anchorIndex = firstVisible;
            while (anchorIndex >= 0 && deleted.has(anchorIndex)) {
              anchorIndex -= 1;
            }
          }
          if (anchorIndex >= 0 && anchorIndex < current.length) {
            engine.captureAnchor(anchorIndex);
          }

          engine.setData(current.filter((_, index) => !deleted.has(index)));
        },
        findIndex: (predicate) => engine.getData().findIndex(predicate),
        find: (predicate) => engine.getData().find(predicate),
        replace: (data, options) => {
          if (options?.initialLocation) {
            engine.requestScrollTo(options.initialLocation);
          }

          engine.setData(data, {
            purgeSizes: options?.purgeItemSizes,
            suppressMeasureReactions: options?.suppressItemMeasure,
          });
        },
        insert: (data, offset, autoscrollToBottom) => {
          if (data.length === 0) return;

          syncScrollTop();
          const current = engine.getData();
          const normalizedOffset = Math.max(
            0,
            Math.min(offset, current.length),
          );

          if (
            normalizedOffset <= engine.getLocation().lastVisibleItemIndex
          ) {
            engine.captureAnchor();
          } else {
            scheduleAutoScroll(data, autoscrollToBottom);
          }

          engine.setData([
            ...current.slice(0, normalizedOffset),
            ...data,
            ...current.slice(normalizedOffset),
          ]);
        },
        deleteRange: (offset, count) => {
          if (count <= 0) return;

          syncScrollTop();
          const current = engine.getData();

          // Anchor the first visible item outside the deleted range.
          const firstVisible = engine.getLocation().firstVisibleItemIndex;
          let anchorIndex = firstVisible;
          if (anchorIndex >= offset && anchorIndex < offset + count) {
            anchorIndex =
              offset + count < current.length ? offset + count : offset - 1;
          }
          if (anchorIndex >= 0 && anchorIndex < current.length) {
            engine.captureAnchor(anchorIndex);
          }

          engine.setData([
            ...current.slice(0, offset),
            ...current.slice(offset + count),
          ]);
        },
        batch: (callback, autoscrollToBottom) => {
          engine.transaction(callback);

          if (autoscrollToBottom) {
            scheduleAutoScroll([], autoscrollToBottom);
          }
        },
        get: () => engine.getData(),
        getCurrentlyRendered: () => engine.getSnapshot().renderedData.slice(),
        removeFromStart: (count) => {
          if (count <= 0) return;

          syncScrollTop();
          const current = engine.getData();

          if (count < current.length) {
            // Anchor the first surviving visible item.
            engine.captureAnchor(
              Math.max(engine.getLocation().firstVisibleItemIndex, count),
            );
          }

          engine.setData(current.slice(count));
        },
      },
      scrollToItem: scrollToLocation,
      scrollIntoView: (location) => {
        const element = scrollerRef.current;
        if (!element) return;

        // normalizeLocation resolves "LAST" and negative indices and clamps.
        const normalized = normalizeLocation(
          location,
          engine.getData().length - 1,
        );
        const itemTop = engine.scrollerOffsetOf(normalized.index);
        const itemHeight = engine.heightOf(normalized.index);
        // Sticky chrome obscures parts of the viewport; in-flow header/footer
        // do not.
        const chrome = engine.chromeHeights();
        const viewportTop = element.scrollTop + chrome.stickyHeader;
        const viewportBottom =
          element.scrollTop + element.clientHeight - chrome.stickyFooter;

        if (itemTop < viewportTop || itemTop + itemHeight > viewportBottom) {
          scrollToLocation(location);
        }
      },
      scrollerElement: () => scrollerRef.current,
      getScrollLocation: () => {
        syncScrollTop();

        return engine.getLocation();
      },
      cancelSmoothScroll: () => smoothScroll.cancel(),
      height: (item) => {
        const index = engine.indexOfIdentity(itemIdentityRef.current(item));

        return index === -1 ? 0 : engine.heightOf(index);
      },
    }),
    [
      engine,
      scheduleAutoScroll,
      scrollToLocation,
      smoothScroll,
      syncScrollTop,
    ],
  );

  useImperativeHandle(ref, () => methods, [methods]);

  useEffect(() => {
    if (!useWindowScroll && !customScrollParent) return;
    if (warnedUnsupportedScrollerRef.current) return;

    warnedUnsupportedScrollerRef.current = true;

    if (
      typeof process === "undefined" ||
      process?.env?.NODE_ENV !== "production"
    ) {
      console.warn(
        "sogna-virtual-list: useWindowScroll/customScrollParent are not implemented yet; using the internal scroller.",
      );
    }
  }, [customScrollParent, useWindowScroll]);

  // --- controlled data ---
  const applyControlledData = useCallback(
    (next: DataWithScrollModifier<Data> | null | undefined) => {
      const nextData = next?.data ?? [];
      const modifier = next?.scrollModifier;

      syncScrollTop();

      if (!modifier) {
        engine.setData(nextData);

        return;
      }

      if (modifier === "prepend") {
        engine.captureAnchor();
        engine.setData(nextData);

        return;
      }

      if (modifier === "remove-from-start") {
        // Trimming happens above the viewport in practice; anchoring the
        // first visible item keeps the view still. If it was trimmed away the
        // anchor dissolves and no repair happens.
        engine.captureAnchor();
        engine.setData(nextData);

        return;
      }

      if (modifier === "remove-from-end") {
        engine.setData(nextData);

        return;
      }

      if (modifier.type === "item-location") {
        engine.requestScrollTo(modifier.location);
        engine.setData(nextData, { purgeSizes: modifier.purgeItemSizes });

        return;
      }

      if (modifier.type === "auto-scroll-to-bottom") {
        scheduleAutoScroll(
          nextData,
          modifier.autoScroll as AutoscrollToBottom<Data, Context>,
        );
        engine.setData(nextData);

        return;
      }

      if (modifier.type === "items-change") {
        const wasAtBottom = engine.getLocation().isAtBottom;

        engine.setData(nextData);

        if (!wasAtBottom) return;

        engine.requestScrollTo(
          typeof modifier.behavior === "object"
            ? (modifier.behavior.location() ?? {
                index: "LAST",
                align: "end",
              })
            : {
                index: "LAST",
                align: "end",
                behavior: modifier.behavior,
              },
        );
      }
    },
    [engine, scheduleAutoScroll, syncScrollTop],
  );

  useIsomorphicLayoutEffect(() => {
    if (controlledData === undefined) return;

    const lastApplied = lastAppliedControlledDataRef.current;

    // The instruction is the data array identity plus the modifier's
    // semantics — a parent re-render recreating the `{ data }` wrapper around
    // the same array must not re-apply the scroll modifier.
    if (
      lastApplied &&
      lastApplied.data === controlledData?.data &&
      scrollModifiersEqual(lastApplied.modifier, controlledData?.scrollModifier)
    ) {
      return;
    }

    lastAppliedControlledDataRef.current = {
      data: controlledData?.data,
      modifier: controlledData?.scrollModifier,
    };

    applyControlledData(controlledData);
  }, [applyControlledData, controlledData]);

  // --- change notification callbacks ---
  useEffect(() => {
    onRenderedDataChangeRef.current?.(snapshot.renderedData.slice() as Data[]);
  }, [snapshot.renderedData]);

  useEffect(() => {
    onScrollRef.current?.(snapshot.location);
  }, [snapshot.location]);

  // Edge-triggered start/end callbacks: fire on entering the zone, re-arm on
  // leaving it. Prepend compensation moves the viewport out of the top zone,
  // so applying a loaded history page re-arms without refiring — the classic
  // infinite-history-loop bug cannot happen.
  const startReachedArmedRef = useRef(true);
  const endReachedArmedRef = useRef(true);
  useEffect(() => {
    const location = snapshot.location;
    const hasItems = snapshot.data.length > 0;

    if (location.isAtTop && hasItems) {
      if (startReachedArmedRef.current && onStartReachedRef.current) {
        startReachedArmedRef.current = false;
        onStartReachedRef.current(location.firstVisibleItemIndex);
      }
    } else {
      startReachedArmedRef.current = true;
    }

    if (location.isAtBottom && hasItems) {
      if (endReachedArmedRef.current && onEndReachedRef.current) {
        endReachedArmedRef.current = false;
        onEndReachedRef.current(location.lastVisibleItemIndex);
      }
    } else {
      endReachedArmedRef.current = true;
    }
  }, [snapshot.location, snapshot.data]);

  // --- viewport measurement ---
  useIsomorphicLayoutEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;

    const updateViewport = () => {
      engine.setViewportHeight(
        testingContextRef.current?.viewportHeight ?? element.clientHeight,
      );
    };

    updateViewport();

    if (testingContextRef.current || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(updateViewport);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [engine, testingContext]);

  // --- header/footer chrome measurement ---
  useIsomorphicLayoutEffect(() => {
    const observeStaticElement = (
      element: HTMLDivElement | null,
      part: "header" | "stickyHeader" | "footer" | "stickyFooter",
    ) => {
      if (!element) {
        engine.setChromeHeight(part, 0);

        return noCleanup;
      }

      const measure = () =>
        engine.setChromeHeight(part, element.getBoundingClientRect().height);
      measure();

      if (typeof ResizeObserver === "undefined") return noCleanup;

      const observer = new ResizeObserver(measure);
      observer.observe(element);

      return () => observer.disconnect();
    };

    const cleanup = [
      observeStaticElement(headerRef.current, "header"),
      observeStaticElement(stickyHeaderRef.current, "stickyHeader"),
      observeStaticElement(footerRef.current, "footer"),
      observeStaticElement(stickyFooterRef.current, "stickyFooter"),
    ];

    return () => {
      cleanup.forEach((run) => run());
    };
  }, [engine, Header, StickyHeader, Footer, StickyFooter]);

  // --- initial location (declared before the flush effect on purpose) ---
  const hasData = snapshot.data.length > 0;
  useIsomorphicLayoutEffect(() => {
    if (initialLocationAppliedRef.current) return;

    const location = initialLocationRef.current;
    if (location === null || !hasData) return;

    initialLocationAppliedRef.current = true;
    engine.requestScrollTo(location);
  }, [engine, hasData]);

  // --- flush: runs on every commit, before paint ---
  // Row ref callbacks have already run (React invokes them before layout
  // effects in the same commit), so the engine holds real measured heights
  // here — anchor deltas are computed from post-measurement geometry, never
  // from stale DOM scrollHeight.
  useIsomorphicLayoutEffect(() => {
    syncListLayout();
    applyScrollAdjustment();
    applyScrollTarget(engine.resolvePendingScroll());

    // Settle pass: re-apply the live target while late measurements keep
    // shifting the geometry.
    const settle = settleRef.current;
    if (!settle || smoothScroll.scrolling()) return;

    // Stop chasing the bottom the moment the user is no longer there.
    if (settle.kind === "follow-bottom" && !engine.getLocation().isAtBottom) {
      settleRef.current = null;

      return;
    }

    const element = scrollerRef.current;
    if (!element) return;

    const target = settle.getTarget();

    if (Math.abs(target - element.scrollTop) <= 1 || settle.attempts >= 8) {
      settleRef.current = null;

      return;
    }

    settle.attempts += 1;
    element.scrollTop = target;
    engine.updateScrollTop(element.scrollTop);
  });

  // Prune measurer callbacks for keys that left the window.
  const activeKeys = useMemo(() => {
    const keys = new Set<React.Key>();

    for (const item of snapshot.visibleItems) {
      keys.add(
        computeItemKey({
          data: item.data as Data,
          index: item.index,
          context: contextRef.current,
        }),
      );
    }

    return keys;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.visibleItems, computeItemKey]);

  useEffect(() => {
    measurer.prune(activeKeys);
  }, [measurer, activeKeys]);

  // --- unmount cleanup ---
  useEffect(() => {
    return () => {
      smoothScroll.cancel();

      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [smoothScroll]);

  const ScrollTag = ScrollElement as ScrollElementComponent<Context> | "div";
  const renderedContext = context;
  const Empty = EmptyPlaceholder as ContextAwareComponent<Context> | null;
  const listContentVisible = snapshot.data.length > 0;

  return (
    <MethodsContext.Provider value={methods as SognaVirtualListMethods}>
      <LocationContext.Provider value={snapshot.location}>
        <RenderedDataContext.Provider
          value={snapshot.renderedData as unknown[]}
        >
          <ScrollTag
            {...scrollerProps}
            ref={scrollerRef}
            data-testid="sogna-virtual-list-scroller"
            onScroll={handleScroll}
            style={{
              boxSizing: "border-box",
              overflowY: "auto",
              overscrollBehavior: "contain",
              ...style,
            }}
            {...(ScrollTag === "div" ? {} : { context: renderedContext })}
          >
            {!listContentVisible && Empty ? (
              <Empty context={renderedContext} />
            ) : null}

            {Header ? (
              <HeaderWrapper
                ref={headerRef}
                style={{
                  overflowAnchor: "none",
                }}
              >
                <Header context={renderedContext} />
              </HeaderWrapper>
            ) : null}

            {StickyHeader ? (
              <StickyHeaderWrapperProp
                ref={stickyHeaderRef}
                style={{
                  overflowAnchor: "none",
                }}
              >
                <StickyHeader context={renderedContext} />
              </StickyHeaderWrapperProp>
            ) : null}

            {listContentVisible ? (
              <div
                ref={listRef}
                data-testid="sogna-virtual-list-list"
                style={{
                  boxSizing: "content-box",
                  height: snapshot.totalListHeight,
                  marginTop: snapshot.shortListOffset,
                  minHeight: enforceStickyFooterAtBottom
                    ? Math.max(
                        0,
                        snapshot.viewportHeight -
                          snapshot.listStartOffset -
                          snapshot.listEndOffset,
                      )
                    : undefined,
                  overflowAnchor: "none",
                  position: "relative",
                  transition:
                    shortSizeAlign === "bottom-smooth"
                      ? "margin-top 0.2s ease-out"
                      : undefined,
                }}
              >
                {snapshot.visibleItems.map((item) => {
                  const key = computeItemKey({
                    data: item.data as Data,
                    index: item.index,
                    context: renderedContext,
                  });

                  return (
                    <div
                      key={key}
                      ref={measurer.refFor(key)}
                      data-index={item.index}
                      data-known-size={item.height}
                      style={{
                        left: 0,
                        overflowAnchor: "none",
                        position: "absolute",
                        top: item.offset,
                        width: "100%",
                      }}
                    >
                      <ItemContent
                        context={renderedContext}
                        data={item.data as Data}
                        index={item.index}
                        nextData={item.nextData as Data | null}
                        prevData={item.prevData as Data | null}
                      />
                    </div>
                  );
                })}
              </div>
            ) : null}

            {Footer ? (
              <FooterWrapper
                ref={footerRef}
                style={{
                  overflowAnchor: "none",
                }}
              >
                <Footer context={renderedContext} />
              </FooterWrapper>
            ) : null}

            {StickyFooter ? (
              <StickyFooterWrapperProp
                ref={stickyFooterRef}
                style={{
                  overflowAnchor: "none",
                }}
              >
                <StickyFooter context={renderedContext} />
              </StickyFooterWrapperProp>
            ) : null}
          </ScrollTag>
        </RenderedDataContext.Provider>
      </LocationContext.Provider>
    </MethodsContext.Provider>
  );
}

export const SognaVirtualList = forwardRef(SognaVirtualListInner) as <
  Data,
  Context,
>(
  props: SognaVirtualListProps<Data, Context> & {
    ref?: React.Ref<SognaVirtualListMethods<Data, Context>>;
  },
) => React.ReactElement;

export function SognaVirtualListLicense({
  children,
}: SognaVirtualListLicenseProps) {
  return <>{children}</>;
}
