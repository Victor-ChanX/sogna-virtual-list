import type { ScrollBehavior } from "../types";

const defaultEaseOut = (x: number) => (x === 1 ? 1 : 1 - 2 ** (-10 * x));

/** Legacy custom behaviors express duration in frames; assume 60fps. */
const FRAME_MS = 1000 / 60;

const MIN_DURATION_MS = 160;
const MAX_DURATION_MS = 500;

export type ScrollDoneReason =
  | "completed"
  | "interrupted"
  | "superseded"
  | "cancelled";

export type SmoothScrollController = {
  cancel: (reason?: ScrollDoneReason) => void;
  /**
   * Scroll to a live target. `getTarget` is re-evaluated on every animation
   * frame, so a target that moves while the animation runs (streaming content
   * growing the list) is chased without restarting the easing.
   */
  scrollTo: (
    getTarget: () => number,
    behavior?: ScrollBehavior,
    done?: (reason: ScrollDoneReason) => void,
  ) => void;
  scrolling: () => boolean;
};

/** Injectable clock/rAF so the controller is testable with fake timers. */
export interface SmoothScrollEnvironment {
  now?: () => number;
  requestFrame?: (callback: () => void) => number;
  cancelFrame?: (handle: number) => void;
  prefersReducedMotion?: () => boolean;
}

const INTERRUPT_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  " ",
]);

function defaultPrefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function createSmoothScrollController(
  getElement: () => HTMLElement | null,
  onScrollFrame: (scrollTop: number) => void,
  environment: SmoothScrollEnvironment = {},
): SmoothScrollController {
  const now =
    environment.now ??
    (typeof performance !== "undefined"
      ? () => performance.now()
      : () => Date.now());
  const requestFrame =
    environment.requestFrame ??
    ((callback: () => void) => requestAnimationFrame(callback));
  const cancelFrame =
    environment.cancelFrame ??
    ((handle: number) => cancelAnimationFrame(handle));
  const prefersReducedMotion =
    environment.prefersReducedMotion ?? defaultPrefersReducedMotion;

  let frame: number | null = null;
  let active = false;
  let finish: ((reason: ScrollDoneReason) => void) | null = null;
  let detachInterrupts: (() => void) | null = null;

  const writeTop = (element: HTMLElement, top: number) => {
    // Always write with instant semantics: forwarding "auto" to the DOM would
    // honor CSS `scroll-behavior: smooth` and produce a surprise native
    // animation on top of ours.
    if (typeof element.scrollTo === "function") {
      element.scrollTo({ top, behavior: "instant" });
    } else {
      element.scrollTop = top;
    }

    onScrollFrame(element.scrollTop);
  };

  const settle = (reason: ScrollDoneReason) => {
    if (frame !== null) {
      cancelFrame(frame);
      frame = null;
    }

    detachInterrupts?.();
    detachInterrupts = null;
    active = false;

    const callback = finish;
    finish = null;
    callback?.(reason);
  };

  const attachInterrupts = (element: HTMLElement) => {
    // A user gesture must win over the animation immediately — otherwise the
    // tween fights the wheel for its full duration.
    const onWheel = () => settle("interrupted");
    const onTouchStart = () => settle("interrupted");
    const onKeyDown = (event: KeyboardEvent) => {
      if (INTERRUPT_KEYS.has(event.key)) settle("interrupted");
    };

    element.addEventListener("wheel", onWheel, { passive: true });
    element.addEventListener("touchstart", onTouchStart, { passive: true });
    element.addEventListener("keydown", onKeyDown);

    detachInterrupts = () => {
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("keydown", onKeyDown);
    };
  };

  const scrollTo: SmoothScrollController["scrollTo"] = (
    getTarget,
    behavior,
    done,
  ) => {
    const element = getElement();
    if (!element) {
      done?.("cancelled");

      return;
    }

    if (active) settle("superseded");
    finish = done ?? null;

    const animated =
      (behavior === "smooth" || typeof behavior === "function") &&
      !prefersReducedMotion();

    if (!animated) {
      writeTop(element, getTarget());
      settle("completed");

      return;
    }

    const startTop = element.scrollTop;
    const startTime = now();

    let easing = defaultEaseOut;
    let duration: number;

    if (typeof behavior === "function") {
      const legacy = behavior(startTop, getTarget());
      easing = legacy.easing;
      duration = Math.max(1, legacy.animationFrameCount * FRAME_MS);
    } else {
      const distance = Math.abs(getTarget() - startTop);
      duration = Math.min(
        MAX_DURATION_MS,
        Math.max(MIN_DURATION_MS, distance / 2),
      );
    }

    active = true;
    attachInterrupts(element);

    const tick = () => {
      const progress = Math.min(1, (now() - startTime) / duration);
      // The target is re-read every frame: as it moves, the remaining
      // fraction of the distance is applied toward the *current* target, so
      // the animation converges on the live position.
      const target = getTarget();
      const nextTop = target - (target - startTop) * (1 - easing(progress));

      writeTop(element, nextTop);

      if (progress < 1) {
        frame = requestFrame(tick);

        return;
      }

      frame = null;
      settle("completed");
    };

    tick();
  };

  return {
    cancel: (reason = "cancelled") => {
      if (!active) return;

      settle(reason);
    },
    scrollTo,
    scrolling: () => active,
  };
}
