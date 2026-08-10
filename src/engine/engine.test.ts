import { describe, expect, it } from "vitest";

import { createListEngine } from "./engine";

type Message = { id: string; text: string };

const message = (id: string, text = ""): Message => ({ id, text });

function chatEngine() {
  const engine = createListEngine<Message>({
    itemIdentity: (item) => item.id,
    defaultItemHeight: 40,
  });
  engine.setViewportHeight(400);

  return engine;
}

/** Populate `count` messages, all measured at `height`. */
function fill(
  engine: ReturnType<typeof chatEngine>,
  count: number,
  height = 40,
) {
  const items = Array.from({ length: count }, (_, i) => message(`m${i}`));
  engine.setData(items);
  items.forEach((_, index) => engine.measureItem(index, height));

  return items;
}

describe("createListEngine", () => {
  it("exposes an empty snapshot before any input", () => {
    const engine = chatEngine();
    const snapshot = engine.getSnapshot();

    expect(snapshot.visibleItems).toEqual([]);
    expect(snapshot.totalListHeight).toBe(0);
    // An empty list counts as being at both edges.
    expect(snapshot.location.isAtBottom).toBe(true);
    expect(snapshot.location.isAtTop).toBe(true);
  });

  it("keeps snapshot referential identity when nothing changed", () => {
    const engine = chatEngine();
    fill(engine, 50);

    const first = engine.getSnapshot();
    // A no-op scroll write must not produce a new snapshot.
    engine.updateScrollTop(0);
    expect(engine.getSnapshot()).toBe(first);
  });

  it("computes visible range and location from measured heights", () => {
    const engine = chatEngine();
    fill(engine, 100, 40); // total 4000, viewport 400

    engine.updateScrollTop(400);
    const snapshot = engine.getSnapshot();

    expect(snapshot.totalListHeight).toBe(4000);
    expect(snapshot.visibleItems[0]?.index).toBe(10);
    expect(snapshot.visibleItems.at(-1)?.index).toBe(20);
    expect(snapshot.location.firstVisibleItemIndex).toBe(10);
    expect(snapshot.location.lastVisibleItemIndex).toBe(19);
    expect(snapshot.location.isAtTop).toBe(false);
    expect(snapshot.location.isAtBottom).toBe(false);

    engine.updateScrollTop(3600);
    expect(engine.getLocation().isAtBottom).toBe(true);
  });

  it("keeps measured sizes attached to items across a prepend", () => {
    const engine = chatEngine();
    const items = fill(engine, 10, 40);
    engine.measureItem(0, 111); // m0 has a distinctive height

    const older = Array.from({ length: 5 }, (_, i) => message(`old${i}`));
    engine.setData([...older, ...items]);

    // m0 moved from index 0 to index 5; its size must follow its identity.
    expect(engine.heightOf(5)).toBe(111);
    // Unmeasured prepended items use the running-mean estimate, not a
    // hardcoded constant.
    const estimate = engine.heightOf(0);
    expect(estimate).toBeGreaterThan(40);
    expect(estimate).toBeLessThan(111);
  });

  it("anchor repair compensates for prepended content", () => {
    const engine = chatEngine();
    const items = fill(engine, 50, 40);
    engine.updateScrollTop(800); // first visible item: index 20

    engine.captureAnchor();
    const older = Array.from({ length: 10 }, (_, i) => message(`old${i}`));
    engine.setData([...older, ...items]);
    older.forEach((_, index) => engine.measureItem(index, 30));

    const target = engine.resolvePendingScroll();

    // 10 items × 30px above the anchor → scrollTop shifts by exactly 300.
    expect(target).not.toBeNull();
    expect(target?.top).toBe(1100);
    expect(engine.hasPendingScroll()).toBe(false);
  });

  it("anchor delta uses measured heights, not estimates", () => {
    const engine = chatEngine();
    const items = fill(engine, 50, 40);
    engine.updateScrollTop(800);

    engine.captureAnchor();
    const older = [message("old0"), message("old1")];
    engine.setData([...older, ...items]);
    // Measured heights differ wildly from the 40px estimate.
    engine.measureItem(0, 200);
    engine.measureItem(1, 10);

    expect(engine.resolvePendingScroll()?.top).toBe(800 + 210);
  });

  it("anchor resolves to null when the anchor item was removed", () => {
    const engine = chatEngine();
    fill(engine, 20, 40);
    engine.updateScrollTop(100);

    engine.captureAnchor();
    engine.setData(
      Array.from({ length: 5 }, (_, i) => message(`fresh${i}`)),
    );

    expect(engine.resolvePendingScroll()).toBeNull();
  });

  it("measurement growth at bottom arms follow-bottom without clobbering an anchor", () => {
    const engine = chatEngine();
    const items = fill(engine, 20, 40); // total 800
    engine.updateScrollTop(400); // bottomOffset 0 → at bottom
    expect(engine.getLocation().isAtBottom).toBe(true);

    // Prepend captures an anchor...
    engine.captureAnchor();
    const older = [message("old0")];
    engine.setData([...older, ...items]);
    engine.measureItem(0, 60);
    // ...and a streaming item growing at the same time arms follow-bottom.
    engine.measureItem(20, 90);

    // The anchor still wins.
    const target = engine.resolvePendingScroll();
    expect(target?.top).toBe(400 + 60);
  });

  it("follow-bottom resolves to the bottom scroll target", () => {
    const engine = chatEngine();
    fill(engine, 20, 40); // total 800
    engine.updateScrollTop(400);
    expect(engine.getLocation().isAtBottom).toBe(true);

    engine.measureItem(19, 140); // streaming growth: total 900

    const target = engine.resolvePendingScroll();
    expect(target?.top).toBe(500); // 900 - 400
  });

  it("scroll-to has the highest priority and resolves aligned targets", () => {
    const engine = chatEngine();
    fill(engine, 100, 40);

    engine.captureAnchor();
    engine.armFollowBottom();
    engine.requestScrollTo({ index: "LAST", align: "end" });

    const target = engine.resolvePendingScroll();
    expect(target?.top).toBe(3600); // 4000 - 400
  });

  it("supports negative indices in scroll targets", () => {
    const engine = chatEngine();
    fill(engine, 100, 40);

    const target = engine.scrollTargetFor({ index: -10, align: "start" });
    expect(target.top).toBe(3600); // item 90 → offset 3600, clamped max is 3600
  });

  it("re-measuring an equal height is a no-op", () => {
    const engine = chatEngine();
    fill(engine, 10, 40);
    const snapshot = engine.getSnapshot();

    expect(engine.measureItem(3, 40.005)).toBe(false);
    expect(engine.getSnapshot()).toBe(snapshot);
  });

  it("purgeSizes drops the size cache", () => {
    const engine = chatEngine();
    const items = fill(engine, 10, 100);

    engine.setData(items.slice(), { purgeSizes: true });

    expect(engine.heightOf(0)).toBe(40); // back to the default estimate
  });

  it("suppressMeasureReactions blocks follow-bottom arming until the next flush", () => {
    const engine = chatEngine();
    const items = fill(engine, 20, 40); // total 800
    engine.updateScrollTop(400);
    expect(engine.getLocation().isAtBottom).toBe(true);

    // replace(..., { suppressItemMeasure: true }) path.
    engine.setData(items.slice(), { suppressMeasureReactions: true });
    engine.measureItem(19, 100);
    expect(engine.pendingKind()).toBeNull();

    // The suppressed growth left the viewport above the new bottom — that is
    // the point of suppression. The flush cycle re-enables reactions; once
    // back at the bottom, growth arms follow-bottom again.
    engine.resolvePendingScroll();
    engine.updateScrollTop(engine.bottomScrollTop());
    expect(engine.getLocation().isAtBottom).toBe(true);

    engine.measureItem(19, 140);
    expect(engine.pendingKind()).toBe("follow-bottom");
  });

  it("above-viewport height changes accumulate a scroll adjustment", () => {
    const engine = chatEngine();
    fill(engine, 50, 40); // total 2000
    engine.updateScrollTop(800); // rows 0..19 above the viewport

    // Window resize reflow: rows above the viewport grow.
    engine.measureItem(3, 100); // +60
    engine.measureItem(5, 10); // -30

    expect(engine.takeScrollAdjustment()).toBe(30);
    // Taking it resets the accumulator.
    expect(engine.takeScrollAdjustment()).toBe(0);
  });

  it("no scroll adjustment when a pending intent will absorb the change", () => {
    const engine = chatEngine();
    const items = fill(engine, 50, 40);
    engine.updateScrollTop(800);

    engine.captureAnchor(); // e.g. a prepend is in flight
    engine.setData([message("old0"), ...items]);
    engine.measureItem(0, 60); // above viewport, but anchor covers it

    expect(engine.takeScrollAdjustment()).toBe(0);
    expect(engine.resolvePendingScroll()?.top).toBe(860);
  });

  it("no scroll adjustment for visible or below-viewport changes", () => {
    const engine = chatEngine();
    fill(engine, 50, 40);
    engine.updateScrollTop(800); // viewport shows rows 20..29

    engine.measureItem(25, 90); // visible row grows
    engine.measureItem(45, 90); // below viewport

    expect(engine.takeScrollAdjustment()).toBe(0);
  });

  it("transaction coalesces notifications", () => {
    const engine = chatEngine();
    let notifications = 0;
    engine.subscribe(() => {
      notifications += 1;
    });

    engine.transaction(() => {
      engine.setData([message("a"), message("b")]);
      engine.measureItem(0, 30);
      engine.measureItem(1, 50);
    });

    expect(notifications).toBe(1);
    expect(engine.totalListHeight()).toBe(80);
  });

  it("chrome heights shift list coordinates", () => {
    const engine = chatEngine();
    fill(engine, 100, 40);
    engine.setChromeHeight("header", 50);
    engine.setChromeHeight("stickyFooter", 30);

    expect(engine.listStartOffset()).toBe(50);
    expect(engine.listEndOffset()).toBe(30);
    expect(engine.scrollHeight()).toBe(4080);
    expect(engine.scrollerOffsetOf(0)).toBe(50);

    // At-bottom accounts for chrome: max scrollTop = 4080 - 400 = 3680.
    engine.updateScrollTop(3680);
    expect(engine.getLocation().isAtBottom).toBe(true);
  });

  it("short-size alignment adds a filler offset for short lists", () => {
    const engine = chatEngine();
    engine.configure({ shortSizeAlign: "bottom" });
    fill(engine, 2, 40); // total 80, viewport 400

    expect(engine.shortListOffset()).toBe(320);
    expect(engine.scrollerOffsetOf(0)).toBe(320);
    // A short list counts as being at the bottom.
    expect(engine.getLocation().isAtBottom).toBe(true);
  });
});
