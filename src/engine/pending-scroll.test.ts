import { describe, expect, it } from "vitest";

import { createPendingScroll } from "./pending-scroll";

describe("createPendingScroll", () => {
  it("starts empty", () => {
    const pending = createPendingScroll();

    expect(pending.hasPending()).toBe(false);
    expect(pending.peek()).toBeNull();
    expect(pending.consume()).toBeNull();
  });

  it("anchor capture is first-wins until consumed", () => {
    const pending = createPendingScroll();

    pending.captureAnchor("msg-1", 100);
    pending.captureAnchor("msg-2", 200);

    expect(pending.consume()).toEqual({
      kind: "anchor",
      identityKey: "msg-1",
      prevOffset: 100,
    });

    // After consumption a new capture is accepted again.
    pending.captureAnchor("msg-3", 300);
    expect(pending.consume()).toEqual({
      kind: "anchor",
      identityKey: "msg-3",
      prevOffset: 300,
    });
  });

  it("scrollTo is last-wins", () => {
    const pending = createPendingScroll();

    pending.requestScrollTo(3);
    pending.requestScrollTo({ index: "LAST", align: "end" });

    expect(pending.consume()).toEqual({
      kind: "scroll-to",
      location: { index: "LAST", align: "end" },
    });
  });

  it("followBottom never clobbers an anchor", () => {
    const pending = createPendingScroll();

    pending.captureAnchor("msg-1", 100);
    // Streaming measurement while at bottom arms the flag...
    pending.armFollowBottom("auto");

    // ...but the anchor still wins.
    expect(pending.consume()).toMatchObject({ kind: "anchor" });
    // And consuming cleared the follow-bottom flag too.
    expect(pending.hasPending()).toBe(false);
  });

  it("explicit scrollTo supersedes anchor and followBottom", () => {
    const pending = createPendingScroll();

    pending.captureAnchor("msg-1", 100);
    pending.armFollowBottom("smooth");
    pending.requestScrollTo(0);

    expect(pending.consume()).toEqual({ kind: "scroll-to", location: 0 });
    expect(pending.hasPending()).toBe(false);
  });

  it("followBottom resolves alone with its behavior", () => {
    const pending = createPendingScroll();

    pending.armFollowBottom("smooth");

    expect(pending.consume()).toEqual({
      kind: "follow-bottom",
      behavior: "smooth",
    });
  });

  it("peek does not consume", () => {
    const pending = createPendingScroll();

    pending.armFollowBottom();

    expect(pending.peek()).toEqual({ kind: "follow-bottom", behavior: "auto" });
    expect(pending.hasPending()).toBe(true);
  });

  it("clear removes everything", () => {
    const pending = createPendingScroll();

    pending.captureAnchor("a", 1);
    pending.requestScrollTo(2);
    pending.armFollowBottom();
    pending.clear();

    expect(pending.hasPending()).toBe(false);
    expect(pending.consume()).toBeNull();
  });
});
