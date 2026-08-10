import { describe, expect, it } from "vitest";

import { createSmoothScrollController } from "./smooth-scroll";
import type { ScrollDoneReason } from "./smooth-scroll";

/** Deterministic clock + frame queue standing in for performance.now/rAF. */
function fakeEnvironment(frameMs = 16) {
  let time = 0;
  let nextHandle = 1;
  const queue = new Map<number, () => void>();

  return {
    env: {
      now: () => time,
      requestFrame: (callback: () => void) => {
        const handle = nextHandle;
        nextHandle += 1;
        queue.set(handle, callback);

        return handle;
      },
      cancelFrame: (handle: number) => {
        queue.delete(handle);
      },
      prefersReducedMotion: () => false,
    },
    /** Advance the clock and run one queued frame. */
    step(ms = frameMs) {
      time += ms;
      const entries = [...queue.entries()];
      queue.clear();
      for (const [, callback] of entries) {
        callback();
      }
    },
    /** Run frames until the animation queue is empty (bounded). */
    finish(ms = frameMs) {
      let guard = 0;
      while (queue.size > 0 && guard < 1000) {
        this.step(ms);
        guard += 1;
      }
    },
    get pendingFrames() {
      return queue.size;
    },
  };
}

/** A scroller stub with scrollTop and scrollTo support. */
function fakeScroller() {
  const element = document.createElement("div");
  let top = 0;

  Object.defineProperty(element, "scrollTop", {
    configurable: true,
    get: () => top,
    set: (value: number) => {
      top = value;
    },
  });
  (element as HTMLElement & { scrollTo: (options: ScrollToOptions) => void })
    .scrollTo = (options: ScrollToOptions) => {
    if (options.top !== undefined) top = options.top;
  };

  return element;
}

function controller(element: HTMLElement, environment: ReturnType<typeof fakeEnvironment>["env"]) {
  const frames: number[] = [];
  const control = createSmoothScrollController(
    () => element,
    (top) => frames.push(top),
    environment,
  );

  return { control, frames };
}

describe("createSmoothScrollController", () => {
  it("instant behaviors write once and complete synchronously", () => {
    const fake = fakeEnvironment();
    const element = fakeScroller();
    const { control, frames } = controller(element, fake.env);

    const reasons: ScrollDoneReason[] = [];
    control.scrollTo(() => 500, "auto", (reason) => reasons.push(reason));

    expect(element.scrollTop).toBe(500);
    expect(frames).toEqual([500]);
    expect(reasons).toEqual(["completed"]);
    expect(control.scrolling()).toBe(false);
  });

  it("smooth scrolling is time-based, not frame-count based", () => {
    const fake = fakeEnvironment();
    const element = fakeScroller();
    const { control } = controller(element, fake.env);

    control.scrollTo(() => 1000, "smooth");
    expect(control.scrolling()).toBe(true);

    // Same wall-clock duration regardless of frame rate: at 120Hz (8ms
    // frames) the animation takes twice as many frames, not half the time.
    fake.finish(8);

    expect(element.scrollTop).toBe(1000);
    expect(control.scrolling()).toBe(false);
  });

  it("chases a moving target (streaming follow-bottom)", () => {
    const fake = fakeEnvironment();
    const element = fakeScroller();
    const { control } = controller(element, fake.env);

    let bottom = 400;
    const reasons: ScrollDoneReason[] = [];
    control.scrollTo(() => bottom, "smooth", (r) => reasons.push(r));

    // The list grows mid-flight.
    fake.step();
    bottom = 700;
    fake.step();
    bottom = 900;

    fake.finish();

    // Landed on the FINAL target, not the one captured at start.
    expect(element.scrollTop).toBe(900);
    expect(reasons).toEqual(["completed"]);
  });

  it("done fires exactly once, on completion", () => {
    const fake = fakeEnvironment();
    const element = fakeScroller();
    const { control } = controller(element, fake.env);

    const reasons: ScrollDoneReason[] = [];
    control.scrollTo(() => 800, "smooth", (r) => reasons.push(r));

    // Not yet.
    fake.step();
    expect(reasons).toEqual([]);

    fake.finish();
    expect(reasons).toEqual(["completed"]);
  });

  it("a new scrollTo supersedes the active one", () => {
    const fake = fakeEnvironment();
    const element = fakeScroller();
    const { control } = controller(element, fake.env);

    const first: ScrollDoneReason[] = [];
    const second: ScrollDoneReason[] = [];

    control.scrollTo(() => 800, "smooth", (r) => first.push(r));
    fake.step();
    control.scrollTo(() => 100, "smooth", (r) => second.push(r));

    expect(first).toEqual(["superseded"]);

    fake.finish();
    expect(element.scrollTop).toBe(100);
    expect(second).toEqual(["completed"]);
  });

  it("user wheel input interrupts the animation", () => {
    const fake = fakeEnvironment();
    const element = fakeScroller();
    document.body.appendChild(element);
    const { control } = controller(element, fake.env);

    const reasons: ScrollDoneReason[] = [];
    control.scrollTo(() => 1000, "smooth", (r) => reasons.push(r));
    fake.step();

    const positionAtInterrupt = element.scrollTop;
    element.dispatchEvent(new Event("wheel"));

    expect(reasons).toEqual(["interrupted"]);
    expect(control.scrolling()).toBe(false);

    // No further frames move the scroller.
    fake.finish();
    expect(element.scrollTop).toBe(positionAtInterrupt);

    document.body.removeChild(element);
  });

  it("cancel() reports the reason to done", () => {
    const fake = fakeEnvironment();
    const element = fakeScroller();
    const { control } = controller(element, fake.env);

    const reasons: ScrollDoneReason[] = [];
    control.scrollTo(() => 1000, "smooth", (r) => reasons.push(r));
    control.cancel();

    expect(reasons).toEqual(["cancelled"]);
    expect(control.scrolling()).toBe(false);
  });

  it("respects prefers-reduced-motion by jumping instantly", () => {
    const fake = fakeEnvironment();
    const element = fakeScroller();
    const { control } = controller(element, {
      ...fake.env,
      prefersReducedMotion: () => true,
    });

    const reasons: ScrollDoneReason[] = [];
    control.scrollTo(() => 640, "smooth", (r) => reasons.push(r));

    expect(element.scrollTop).toBe(640);
    expect(reasons).toEqual(["completed"]);
    expect(fake.pendingFrames).toBe(0);
  });

  it("supports the legacy frame-count custom behavior", () => {
    const fake = fakeEnvironment();
    const element = fakeScroller();
    const { control } = controller(element, fake.env);

    const behavior = (currentTop: number, targetTop: number) => {
      expect(currentTop).toBe(0);
      expect(targetTop).toBe(300);

      return {
        animationFrameCount: 10, // ≈ 167ms at the assumed 60fps
        easing: (x: number) => x, // linear
      };
    };

    control.scrollTo(() => 300, behavior);

    // Halfway through in time → halfway through the distance (linear).
    fake.step(83);
    expect(element.scrollTop).toBeCloseTo(150, -1);

    fake.finish();
    expect(element.scrollTop).toBe(300);
  });
});
