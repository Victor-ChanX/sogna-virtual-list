import { describe, expect, it } from "vitest";

import { OffsetTree } from "./offset-tree";

/** Naive reference implementation to validate the Fenwick tree against. */
class NaiveTree {
  heights: number[] = [];

  build(heights: readonly number[]) {
    this.heights = heights.slice();
  }

  set(index: number, height: number) {
    if (index < 0 || index >= this.heights.length) return;
    this.heights[index] = height;
  }

  prefixSum(index: number) {
    let sum = 0;
    for (let i = 0; i < Math.min(index, this.heights.length); i += 1) {
      sum += this.heights[i];
    }
    return sum;
  }

  total() {
    return this.prefixSum(this.heights.length);
  }

  indexAtOffset(offset: number) {
    if (this.heights.length === 0) return 0;
    if (offset <= 0) return 0;

    let cumulative = 0;
    for (let i = 0; i < this.heights.length; i += 1) {
      cumulative += this.heights[i];
      if (cumulative > offset) return i;
    }
    return this.heights.length - 1;
  }
}

/** Deterministic pseudo-random generator (mulberry32). */
function rng(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("OffsetTree", () => {
  it("computes prefix sums, totals, and heights", () => {
    const tree = new OffsetTree();
    tree.build([10, 20, 30, 40]);

    expect(tree.size).toBe(4);
    expect(tree.total()).toBe(100);
    expect(tree.prefixSum(0)).toBe(0);
    expect(tree.prefixSum(1)).toBe(10);
    expect(tree.prefixSum(3)).toBe(60);
    expect(tree.prefixSum(4)).toBe(100);
    expect(tree.prefixSum(99)).toBe(100);
    expect(tree.heightAt(2)).toBe(30);
    expect(tree.heightAt(-1)).toBe(0);
    expect(tree.heightAt(4)).toBe(0);
  });

  it("updates single heights in place", () => {
    const tree = new OffsetTree();
    tree.build([10, 20, 30]);

    tree.set(1, 50);

    expect(tree.total()).toBe(90);
    expect(tree.prefixSum(2)).toBe(60);
    expect(tree.heightAt(1)).toBe(50);

    // Out-of-range updates are ignored.
    tree.set(-1, 99);
    tree.set(3, 99);
    expect(tree.total()).toBe(90);
  });

  it("locates the item containing an offset", () => {
    const tree = new OffsetTree();
    tree.build([10, 20, 30]);

    expect(tree.indexAtOffset(-5)).toBe(0);
    expect(tree.indexAtOffset(0)).toBe(0);
    expect(tree.indexAtOffset(9.5)).toBe(0);
    // Boundary offsets belong to the item that starts there.
    expect(tree.indexAtOffset(10)).toBe(1);
    expect(tree.indexAtOffset(29)).toBe(1);
    expect(tree.indexAtOffset(30)).toBe(2);
    // Past the end clamps to the last item.
    expect(tree.indexAtOffset(60)).toBe(2);
    expect(tree.indexAtOffset(1000)).toBe(2);
  });

  it("handles the empty tree", () => {
    const tree = new OffsetTree();
    tree.build([]);

    expect(tree.size).toBe(0);
    expect(tree.total()).toBe(0);
    expect(tree.prefixSum(0)).toBe(0);
    expect(tree.prefixSum(5)).toBe(0);
    expect(tree.indexAtOffset(0)).toBe(0);
    expect(tree.indexAtOffset(100)).toBe(0);
  });

  it("supports fractional heights", () => {
    const tree = new OffsetTree();
    tree.build([10.5, 20.25, 0.125]);

    expect(tree.total()).toBeCloseTo(30.875, 10);
    expect(tree.prefixSum(2)).toBeCloseTo(30.75, 10);
    expect(tree.indexAtOffset(10.4)).toBe(0);
    expect(tree.indexAtOffset(10.5)).toBe(1);
  });

  it("matches a naive implementation under random operations", () => {
    const random = rng(20260810);

    for (let round = 0; round < 20; round += 1) {
      const size = 1 + Math.floor(random() * 300);
      const heights = Array.from(
        { length: size },
        () => Math.floor(random() * 200) / 2,
      );

      const tree = new OffsetTree();
      const naive = new NaiveTree();
      tree.build(heights);
      naive.build(heights);

      for (let op = 0; op < 120; op += 1) {
        const kind = random();

        if (kind < 0.4) {
          const index = Math.floor(random() * size);
          const height = Math.floor(random() * 300) / 2;
          tree.set(index, height);
          naive.set(index, height);
        } else if (kind < 0.7) {
          const index = Math.floor(random() * (size + 3)) - 1;
          expect(tree.prefixSum(index)).toBeCloseTo(
            naive.prefixSum(index),
            8,
          );
        } else {
          const offset = random() * naive.total() * 1.2 - 10;
          expect(tree.indexAtOffset(offset)).toBe(naive.indexAtOffset(offset));
        }
      }

      expect(tree.total()).toBeCloseTo(naive.total(), 8);
    }
  });
});
