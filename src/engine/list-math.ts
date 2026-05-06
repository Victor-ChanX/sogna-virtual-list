import type {
  ItemLocation,
  ItemLocationWithAlign,
  ListScrollLocation,
  ScrollBehavior,
  VisibleItem,
} from "../types";

export const DEFAULT_ITEM_HEIGHT = 72;

export const DEFAULT_AT_BOTTOM_THRESHOLD = 4;

export type VisibleRange = {
  start: number;
  end: number;
  top: number;
  bottom: number;
};

export type ScrollTarget = {
  top: number;
  behavior?: ScrollBehavior;
};

export function normalizeLocation(
  location: ItemLocation,
  lastIndex: number,
): Omit<Required<ItemLocationWithAlign>, "done" | "index"> & {
  index: number;
  done?: () => void;
} {
  if (typeof location === "number") {
    return {
      index: clampIndex(location, lastIndex),
      align: "start-no-overflow",
      behavior: "auto",
      offset: 0,
    };
  }

  const rawIndex =
    location.index === "LAST"
      ? lastIndex
      : location.index < 0
        ? lastIndex + location.index
        : location.index;

  return {
    index: clampIndex(rawIndex, lastIndex),
    align: location.align ?? "start-no-overflow",
    behavior: location.behavior ?? "auto",
    offset: location.offset ?? 0,
    done: location.done,
  };
}

export function clampIndex(index: number, lastIndex: number) {
  if (lastIndex < 0) return 0;

  return Math.min(Math.max(index, 0), lastIndex);
}

export function sumHeights(heights: readonly number[], count: number) {
  let total = 0;

  for (let index = 0; index < count; index += 1) {
    total += heights[index] ?? DEFAULT_ITEM_HEIGHT;
  }

  return total;
}

export function offsetOf(heights: readonly number[], index: number) {
  return sumHeights(heights, index);
}

export function rangeHeight(
  heights: readonly number[],
  start: number,
  count: number,
) {
  return sumHeights(heights.slice(start, start + count), count);
}

export function calculateVisibleRange(params: {
  heights: readonly number[];
  itemCount: number;
  scrollTop: number;
  viewportHeight: number;
  increaseViewportBy: number;
}): VisibleRange {
  const { heights, itemCount, scrollTop, viewportHeight, increaseViewportBy } =
    params;

  if (itemCount === 0) {
    return {
      start: 0,
      end: 0,
      top: 0,
      bottom: 0,
    };
  }

  const minVisible = Math.max(0, scrollTop - increaseViewportBy);
  const maxVisible = scrollTop + viewportHeight + increaseViewportBy;
  const totalHeight = sumHeights(heights, itemCount);
  let top = 0;
  let start = 0;

  while (start < itemCount && top + heightAt(heights, start) < minVisible) {
    top += heightAt(heights, start);
    start += 1;
  }

  let end = start;
  let consumed = top;

  while (end < itemCount && consumed < maxVisible) {
    consumed += heightAt(heights, end);
    end += 1;
  }

  return {
    start,
    end,
    top,
    bottom: Math.max(0, totalHeight - consumed),
  };
}

export function buildVisibleItems<Data>(params: {
  data: readonly Data[];
  heights: readonly number[];
  range: VisibleRange;
}): VisibleItem<Data>[] {
  const { data, heights, range } = params;
  let offset = range.top;
  const items: VisibleItem<Data>[] = [];

  for (let index = range.start; index < range.end; index += 1) {
    const height = heightAt(heights, index);

    items.push({
      data: data[index] as Data,
      prevData: index > 0 ? (data[index - 1] as Data) : null,
      nextData: index < data.length - 1 ? (data[index + 1] as Data) : null,
      index,
      offset,
      height,
    });

    offset += height;
  }

  return items;
}

export function calculateScrollTopForLocation(params: {
  heights: readonly number[];
  itemCount: number;
  location: ItemLocation;
  viewportHeight: number;
  scrollTop: number;
}): ScrollTarget {
  const { heights, itemCount, location, viewportHeight, scrollTop } = params;
  const normalized = normalizeLocation(location, itemCount - 1);
  const itemOffset = offsetOf(heights, normalized.index);
  const itemHeight = heightAt(heights, normalized.index);
  const totalHeight = sumHeights(heights, itemCount);
  let top = itemOffset;

  if (normalized.align === "end") {
    top = itemOffset - viewportHeight + itemHeight;
  } else if (normalized.align === "center") {
    top = itemOffset - viewportHeight / 2 + itemHeight / 2;
  } else if (normalized.align === "start-no-overflow") {
    if (itemOffset < scrollTop) {
      top = itemOffset;
    } else if (itemOffset + itemHeight > scrollTop + viewportHeight) {
      top = itemOffset - viewportHeight + itemHeight;
    } else {
      top = scrollTop;
    }
  }

  top += normalized.offset;

  return {
    top: Math.max(0, Math.min(top, Math.max(0, totalHeight - viewportHeight))),
    behavior: normalized.behavior,
  };
}

export function calculateScrollLocation(params: {
  heights: readonly number[];
  itemCount: number;
  scrollTop: number;
  viewportHeight: number;
  scrollHeight: number;
  atBottomThreshold?: number;
}): ListScrollLocation {
  const {
    heights,
    itemCount,
    scrollTop,
    viewportHeight,
    scrollHeight,
    atBottomThreshold = DEFAULT_AT_BOTTOM_THRESHOLD,
  } = params;
  const bottomOffset = Math.max(0, scrollHeight - scrollTop - viewportHeight);
  const viewportBottom = scrollTop + viewportHeight;
  let lastVisibleItemIndex = 0;
  let lastItemBottomOffset = 0;
  let offset = 0;

  for (let index = 0; index < itemCount; index += 1) {
    const height = heightAt(heights, index);
    const itemBottom = offset + height;

    if (itemBottom <= viewportBottom) {
      lastVisibleItemIndex = index;
      lastItemBottomOffset = viewportBottom - itemBottom;
    }

    if (offset > viewportBottom) break;

    offset += height;
  }

  return {
    listOffset: -scrollTop,
    visibleListHeight: viewportHeight,
    scrollHeight,
    bottomOffset,
    isAtBottom: bottomOffset <= atBottomThreshold,
    lastVisibleItemIndex,
    lastItemBottomOffset,
  };
}

export function heightAt(heights: readonly number[], index: number) {
  return heights[index] ?? DEFAULT_ITEM_HEIGHT;
}
