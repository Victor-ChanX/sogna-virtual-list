import type { ScrollBehavior } from "../types";

const defaultEaseOut = (x: number) => (x === 1 ? 1 : 1 - 2 ** (-10 * x));

export type SmoothScrollController = {
  cancel: () => void;
  scrollTo: (targetTop: number, behavior?: ScrollBehavior) => void;
  scrolling: () => boolean;
};

export function createSmoothScrollController(
  getElement: () => HTMLDivElement | null,
  onScrollFrame: (scrollTop: number) => void,
  onDone: () => void,
): SmoothScrollController {
  let frame: number | null = null;
  let active = false;

  const cancel = () => {
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }

    active = false;
  };

  const scrollTo = (targetTop: number, behavior?: ScrollBehavior) => {
    const element = getElement();
    if (!element) return;

    cancel();

    if (behavior === "smooth" || typeof behavior === "function") {
      const startTop = element.scrollTop;
      const animation =
        typeof behavior === "function"
          ? behavior(startTop, targetTop)
          : {
              animationFrameCount: 50,
              easing: defaultEaseOut,
            };
      let currentFrame = 0;

      active = true;

      const tick = () => {
        const progress = Math.min(
          currentFrame / animation.animationFrameCount,
          1,
        );
        const nextTop =
          startTop + (targetTop - startTop) * animation.easing(progress);

        element.scrollTo({ top: nextTop, behavior: "instant" });
        onScrollFrame(nextTop);
        currentFrame += 1;

        if (currentFrame <= animation.animationFrameCount) {
          frame = requestAnimationFrame(tick);

          return;
        }

        element.scrollTo({ top: targetTop, behavior: "instant" });
        onScrollFrame(targetTop);
        frame = null;
        active = false;
        onDone();
      };

      tick();

      return;
    }

    element.scrollTo({
      top: targetTop,
      behavior:
        behavior === "auto" || behavior === "instant" ? behavior : "auto",
    });
    onScrollFrame(targetTop);
    onDone();
  };

  return {
    cancel,
    scrollTo,
    scrolling: () => active,
  };
}
