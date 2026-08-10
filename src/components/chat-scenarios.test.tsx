/**
 * Chat-correctness scenarios: regression tests for the scroll-repair
 * behaviors this library exists for. Each test simulates a real messaging
 * workflow (streaming growth, loading history, trimming) with deterministic
 * jsdom geometry via the testing context and the ResizeObserver harness.
 */
import React, { createRef, act, StrictMode } from "react";

import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SognaVirtualList } from "./SognaVirtualList";
import { SognaVirtualListTestingContext } from "../testing/context";
import { installTestHarness, type TestHarness } from "../testing/harness";
import type {
  DataWithScrollModifier,
  SognaVirtualListMethods,
  SognaVirtualListProps,
} from "../types";

type Message = {
  id: string;
  text: string;
};

const message = (id: string, text = `text-${id}`): Message => ({ id, text });

const messages = (count: number, prefix = "m") =>
  Array.from({ length: count }, (_, i) => message(`${prefix}${i}`));

const ItemContent: SognaVirtualListProps<Message, null>["ItemContent"] = ({
  data,
}) => <div>{data.text}</div>;

const VIEWPORT = 400;
const ITEM = 40;

describe("chat scenarios", () => {
  let container: HTMLDivElement;
  let harness: TestHarness;
  let root: Root | null = null;
  /** Per-message height map consulted by getItemHeight. */
  let heights: Map<string, number>;

  const getItemHeight = (data: unknown) =>
    heights.get((data as Message).id) ?? ITEM;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    harness = installTestHarness();
    heights = new Map();
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    harness.restore();
    document.body.removeChild(container);
  });

  function renderList(
    props: Partial<SognaVirtualListProps<Message, null>> & {
      ref?: React.Ref<SognaVirtualListMethods<Message, null>>;
    },
    options?: { strictMode?: boolean },
  ) {
    root = createRoot(container);

    const tree = (
      <SognaVirtualListTestingContext.Provider
        value={{
          itemHeight: ITEM,
          viewportHeight: VIEWPORT,
          getItemHeight,
        }}
      >
        <SognaVirtualList<Message, null>
          computeItemKey={({ data }) => data.id}
          ItemContent={ItemContent}
          {...props}
        />
      </SognaVirtualListTestingContext.Provider>
    );

    act(() => {
      root?.render(options?.strictMode ? <StrictMode>{tree}</StrictMode> : tree);
    });

    return {
      scroller: container.querySelector<HTMLElement>(
        "[data-testid='sogna-virtual-list-scroller']",
      ) as HTMLElement,
      itemElement: (index: number) =>
        container.querySelector<HTMLElement>(`[data-index='${index}']`),
      rerender: (nextProps: Partial<SognaVirtualListProps<Message, null>>) => {
        act(() => {
          root?.render(
            <SognaVirtualListTestingContext.Provider
              value={{
                itemHeight: ITEM,
                viewportHeight: VIEWPORT,
                getItemHeight,
              }}
            >
              <SognaVirtualList<Message, null>
                computeItemKey={({ data }) => data.id}
                ItemContent={ItemContent}
                {...props}
                {...nextProps}
              />
            </SognaVirtualListTestingContext.Provider>,
          );
        });
      },
    };
  }

  function scrollTo(scroller: HTMLElement, top: number) {
    act(() => {
      scroller.scrollTop = top;
      scroller.dispatchEvent(new Event("scroll"));
    });
  }

  it("1. streaming follow-bottom: growth of the last item keeps the view pinned", () => {
    const ref = createRef<SognaVirtualListMethods<Message, null>>();
    const { scroller, itemElement } = renderList({
      ref,
      initialData: messages(20), // total 800
    });

    scrollTo(scroller, 400); // bottom: 800 - 400
    expect(ref.current?.getScrollLocation().isAtBottom).toBe(true);

    // Token streamed into the last row: it grows from 40 to 100.
    const lastRow = itemElement(19);
    expect(lastRow).not.toBeNull();
    act(() => {
      harness.resize(lastRow as HTMLElement, 100);
    });

    // New total 860 → bottom scrollTop 460. The view followed.
    expect(scroller.scrollTop).toBe(460);
    expect(ref.current?.getScrollLocation().isAtBottom).toBe(true);
  });

  it("2. prepend anchoring: loading history keeps the viewport still", () => {
    const ref = createRef<SognaVirtualListMethods<Message, null>>();
    // Render (and thus measure) every row so the pixel math is exact.
    const { scroller } = renderList({
      ref,
      initialData: messages(50), // total 2000
      increaseViewportBy: 100000,
    });

    scrollTo(scroller, 800); // first visible item: index 20

    const older = messages(10, "old");
    older.forEach((m) => heights.set(m.id, 30)); // heterogeneous: 30px each

    act(() => {
      ref.current?.data.prepend(older);
    });

    // 10 × 30 = 300px of new content above → scrollTop compensates exactly.
    expect(scroller.scrollTop).toBe(1100);
    expect(ref.current?.getScrollLocation().firstVisibleItemIndex).toBe(30);
  });

  it("3. prepend measurement race: measured heights differ wildly from estimates", () => {
    const ref = createRef<SognaVirtualListMethods<Message, null>>();
    const { scroller } = renderList({
      ref,
      initialData: messages(50),
    });

    scrollTo(scroller, 0); // reading the very top

    // The exact defect-B reproduction: the prepended rows land inside the
    // render window, and their measured heights (200 and 10) differ wildly
    // from any estimate. The anchor delta must use the measured values.
    const older = [message("tall"), message("short")];
    heights.set("tall", 200);
    heights.set("short", 10);

    act(() => {
      ref.current?.data.prepend(older);
    });

    // The previous first item must stay exactly where it was: 210 measured
    // pixels were inserted above it.
    expect(scroller.scrollTop).toBe(210);
  });

  it("4. trim stability: removeFromStart keeps the view still mid-list", () => {
    const ref = createRef<SognaVirtualListMethods<Message, null>>();
    const { scroller } = renderList({
      ref,
      initialData: messages(50),
      increaseViewportBy: 100000,
    });

    scrollTo(scroller, 800); // first visible: 20

    act(() => {
      ref.current?.data.removeFromStart(10);
    });

    // 10 × 40 = 400px removed above the viewport.
    expect(scroller.scrollTop).toBe(400);
    expect(ref.current?.getScrollLocation().firstVisibleItemIndex).toBe(10);
  });

  it("5. append while scrolled up does not disturb; at-bottom stays correct after growth", () => {
    const ref = createRef<SognaVirtualListMethods<Message, null>>();
    const { scroller } = renderList({
      ref,
      initialData: messages(30), // total 1200
      increaseViewportBy: 100000,
    });

    scrollTo(scroller, 0);

    act(() => {
      ref.current?.data.append(messages(5, "new"), true);
    });

    // Reading position preserved.
    expect(scroller.scrollTop).toBe(0);
    expect(ref.current?.getScrollLocation().isAtBottom).toBe(false);

    // Regression for the stale-closure bug: after the list grew (35 items,
    // total 1400), scrolling to the *new* bottom must be detected as
    // at-bottom.
    scrollTo(scroller, 1000);
    expect(ref.current?.getScrollLocation().isAtBottom).toBe(true);

    // And appending now does follow.
    act(() => {
      ref.current?.data.append([message("tail")], true);
    });
    expect(scroller.scrollTop).toBe(1040);
  });

  it("6. prepend wins over simultaneous streaming growth (anchor is not clobbered)", () => {
    const ref = createRef<SognaVirtualListMethods<Message, null>>();
    const { scroller } = renderList({
      ref,
      initialData: messages(20), // total 800
      increaseViewportBy: 100000,
    });

    scrollTo(scroller, 400); // at bottom
    expect(ref.current?.getScrollLocation().isAtBottom).toBe(true);

    const older = messages(5, "old");
    older.forEach((m) => heights.set(m.id, 30));

    // Prepending while at the bottom: the new rows measure at ref-attach
    // while isAtBottom is still true, which arms follow-bottom — the anchor
    // must win anyway.
    act(() => {
      ref.current?.data.prepend(older);
    });

    // Anchored: 5 × 30 = 150 of content above → compensated, not yanked.
    expect(scroller.scrollTop).toBe(550);
  });

  it("7. StrictMode: bottom-up initial location lands at the bottom once", () => {
    const ref = createRef<SognaVirtualListMethods<Message, null>>();
    const { scroller } = renderList(
      {
        ref,
        initialData: messages(20), // total 800
        messageFlow: "bottom-up",
        increaseViewportBy: 100000,
      },
      { strictMode: true },
    );

    expect(scroller.scrollTop).toBe(400); // 800 - 400
    expect(ref.current?.getScrollLocation().isAtBottom).toBe(true);
  });

  it("8. controlled data: same array in a fresh wrapper does not re-apply the modifier", () => {
    const ref = createRef<SognaVirtualListMethods<Message, null>>();
    const initial = messages(50);
    const { scroller, rerender } = renderList({
      ref,
      data: { data: initial },
      increaseViewportBy: 100000,
    });

    scrollTo(scroller, 800);

    // Prepend page via controlled data.
    const older = messages(10, "old");
    const withHistory = [...older, ...initial];
    const prependInstruction: DataWithScrollModifier<Message> = {
      data: withHistory,
      scrollModifier: "prepend",
    };

    rerender({ data: prependInstruction });
    expect(scroller.scrollTop).toBe(1200); // 10 × 40 compensated

    // A parent re-render recreating the wrapper (and even the string
    // modifier) around the SAME array must be a no-op.
    rerender({ data: { data: withHistory, scrollModifier: "prepend" } });
    expect(scroller.scrollTop).toBe(1200);

    // Content-equal but same-reference modifier object: also a no-op.
    rerender({ data: { data: withHistory, scrollModifier: "prepend" } });
    expect(scroller.scrollTop).toBe(1200);
  });

  it("streaming via controlled items-change follows the bottom only when there", () => {
    const ref = createRef<SognaVirtualListMethods<Message, null>>();
    let current = messages(20); // total 800
    const { scroller, itemElement, rerender } = renderList({
      ref,
      data: { data: current },
    });

    scrollTo(scroller, 400); // at bottom

    // Stream a token: same last-message id, longer text, taller row. In a
    // real browser ResizeObserver reports the growth; the harness fires it.
    current = current.map((m, i) =>
      i === current.length - 1 ? { ...m, text: m.text + " more" } : m,
    );
    rerender({
      data: {
        data: current,
        scrollModifier: { type: "items-change", behavior: "auto" },
      },
    });
    act(() => {
      harness.resize(itemElement(19) as HTMLElement, 120);
    });

    // Total 880 → follows to 480.
    expect(scroller.scrollTop).toBe(480);

    // Now the reader scrolls up…
    scrollTo(scroller, 100);

    current = current.map((m, i) =>
      i === current.length - 1 ? { ...m, text: m.text + " more" } : m,
    );
    rerender({
      data: {
        data: current,
        scrollModifier: { type: "items-change", behavior: "auto" },
      },
    });
    // The grown row is out of the window while scrolled up; if it were
    // still rendered, its resize must not disturb the reader either way.
    const grownRow = itemElement(19);
    if (grownRow) {
      act(() => {
        harness.resize(grownRow, 200);
      });
    }

    // …and their reading position is left alone.
    expect(scroller.scrollTop).toBe(100);
  });

  it("scrollToItem LAST/end settles onto the real bottom despite estimates", () => {
    const ref = createRef<SognaVirtualListMethods<Message, null>>();
    const { scroller } = renderList({
      ref,
      initialData: messages(100),
    });

    act(() => {
      ref.current?.scrollToItem({ index: "LAST", align: "end" });
    });

    // Absolute pixels depend on estimates for never-rendered middle rows;
    // the invariant is semantic: the last item is visible at the bottom.
    const location = ref.current?.getScrollLocation();
    expect(location?.lastVisibleItemIndex).toBe(99);
    expect(location?.isAtBottom).toBe(true);

    act(() => {
      ref.current?.scrollToItem({ index: 0, align: "start" });
    });

    expect(scroller.scrollTop).toBe(0);
    expect(ref.current?.getScrollLocation().firstVisibleItemIndex).toBe(0);
  });

  it("onStartReached fires once, stays quiet through prepend compensation, re-arms after leaving", () => {
    const ref = createRef<SognaVirtualListMethods<Message, null>>();
    const startReached: number[] = [];
    const { scroller } = renderList({
      ref,
      initialData: messages(50),
      increaseViewportBy: 100000,
      onStartReached: (index) => startReached.push(index),
    });

    // Mount starts at the top → one initial trigger.
    expect(startReached).toHaveLength(1);

    scrollTo(scroller, 800);
    scrollTo(scroller, 0);
    expect(startReached).toHaveLength(2);

    // The app loads a history page in response. Compensation moves the
    // viewport out of the top zone — this must NOT refire.
    act(() => {
      ref.current?.data.prepend(messages(10, "old"));
    });

    expect(scroller.scrollTop).toBe(400);
    expect(startReached).toHaveLength(2);

    // Scrolling back to the top fires again (next page).
    scrollTo(scroller, 0);
    expect(startReached).toHaveLength(3);
  });

  it("onEndReached fires when scrolled to the bottom and re-arms after leaving", () => {
    const ref = createRef<SognaVirtualListMethods<Message, null>>();
    const endReached: number[] = [];
    const { scroller } = renderList({
      ref,
      initialData: messages(50), // total 2000
      increaseViewportBy: 100000,
      onEndReached: (index) => endReached.push(index),
    });

    expect(endReached).toHaveLength(0);

    scrollTo(scroller, 1600); // bottom
    expect(endReached).toEqual([49]);

    scrollTo(scroller, 200);
    scrollTo(scroller, 1600);
    expect(endReached).toEqual([49, 49]);
  });

  it("empty placeholder renders when there is no data", () => {
    renderList({
      initialData: [],
      EmptyPlaceholder: () => <div data-testid="empty">nothing here</div>,
    });

    expect(
      container.querySelector("[data-testid='empty']")?.textContent,
    ).toBe("nothing here");
  });
});
