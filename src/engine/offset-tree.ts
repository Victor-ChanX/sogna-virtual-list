/**
 * Fenwick (binary indexed) tree over item heights.
 *
 * Replaces the previous O(n) prefix-sum walks with O(log n) queries so that
 * scroll events and streaming measurements stay cheap on long lists:
 *
 * - `set` (single measurement): O(log n)
 * - `prefixSum` / `indexAtOffset` (scroll math): O(log n)
 * - `total`: O(1)
 * - `build` (structural data change): O(n) — a structural change already
 *   copies the data array, so this does not change the asymptotics of edits.
 */
export class OffsetTree {
  private tree: Float64Array = new Float64Array(1);
  private heights: Float64Array = new Float64Array(0);
  private count = 0;
  private cachedTotal = 0;
  /** Highest power of two <= count, used by indexAtOffset binary lifting. */
  private lift = 0;

  get size(): number {
    return this.count;
  }

  /** Rebuild the tree from scratch. O(n). */
  build(heights: readonly number[]): void {
    const n = heights.length;
    this.count = n;
    this.heights = new Float64Array(n);
    this.tree = new Float64Array(n + 1);
    this.cachedTotal = 0;

    for (let i = 0; i < n; i += 1) {
      const height = heights[i] ?? 0;
      this.heights[i] = height;
      this.cachedTotal += height;
      // O(n) Fenwick construction: add into the parent in one pass.
      this.tree[i + 1] += height;
      const parent = i + 1 + ((i + 1) & -(i + 1));
      if (parent <= n) {
        this.tree[parent] += this.tree[i + 1];
      }
    }

    this.lift = n > 0 ? 2 ** Math.floor(Math.log2(n)) : 0;
  }

  /** Height of the item at `index`; 0 when out of range. */
  heightAt(index: number): number {
    if (index < 0 || index >= this.count) return 0;

    return this.heights[index];
  }

  /** Update a single item height. O(log n). */
  set(index: number, height: number): void {
    if (index < 0 || index >= this.count) return;

    const delta = height - this.heights[index];
    if (delta === 0) return;

    this.heights[index] = height;
    this.cachedTotal += delta;

    for (let i = index + 1; i <= this.count; i += i & -i) {
      this.tree[i] += delta;
    }
  }

  /** Sum of the heights of items [0, index). O(log n). */
  prefixSum(index: number): number {
    let bounded = Math.min(index, this.count);
    if (bounded <= 0) return 0;

    let sum = 0;
    for (; bounded > 0; bounded -= bounded & -bounded) {
      sum += this.tree[bounded];
    }

    return sum;
  }

  /** Offset of the top of the item at `index`. */
  offsetOf(index: number): number {
    return this.prefixSum(index);
  }

  /** Total height of all items. O(1). */
  total(): number {
    return this.cachedTotal;
  }

  /**
   * Index of the item containing vertical offset `offset`, clamped to
   * [0, size - 1]. An offset exactly at an item boundary belongs to the item
   * that starts there. O(log n) via binary lifting.
   */
  indexAtOffset(offset: number): number {
    if (this.count === 0) return 0;
    if (offset <= 0) return 0;

    let position = 0;
    let remaining = offset;

    for (let step = this.lift; step > 0; step >>= 1) {
      const next = position + step;

      if (next <= this.count && this.tree[next] <= remaining) {
        position = next;
        remaining -= this.tree[next];
      }
    }

    return Math.min(position, this.count - 1);
  }
}
