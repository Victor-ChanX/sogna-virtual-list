import { describe, expect, it } from "vitest";

import {
  calculateScrollTopForLocation,
  calculateVisibleRange,
  offsetOf,
  sumHeights,
} from "./list-math";

describe("list math", () => {
  it("calculates offsets and total height", () => {
    const heights = [10, 20, 30, 40];

    expect(sumHeights(heights, 4)).toBe(100);
    expect(offsetOf(heights, 2)).toBe(30);
  });

  it("calculates visible range with overscan", () => {
    const range = calculateVisibleRange({
      heights: [10, 20, 30, 40, 50],
      itemCount: 5,
      scrollTop: 25,
      viewportHeight: 40,
      increaseViewportBy: 0,
    });

    expect(range).toEqual({
      start: 1,
      end: 4,
      top: 10,
      bottom: 50,
    });
  });

  it("calculates aligned scroll locations", () => {
    const target = calculateScrollTopForLocation({
      heights: [10, 20, 30, 40],
      itemCount: 4,
      location: {
        index: "LAST",
        align: "end",
      },
      viewportHeight: 50,
      scrollTop: 0,
    });

    expect(target.top).toBe(50);
  });
});
