import type React from "react";

/**
 * DOM measurement adapter: one shared ResizeObserver for all rows plus a
 * stable-per-key ref callback cache.
 *
 * The previous design curried a fresh ref callback per render, which made
 * React detach and re-attach every visible row's observer on every render —
 * at render frequency during token streaming. Stable callbacks mean React
 * only invokes a ref on real mount/unmount, and one observer watching N rows
 * is the intended ResizeObserver usage.
 *
 * The row index is read from `element.dataset.index` at measure time: when a
 * prepend shifts indices under a stable key, React updates the attribute in
 * place and no re-registration is needed.
 */

export interface ItemMeasurerOptions {
  /** Called with the row index and measured height. */
  onMeasure: (index: number, height: number, element: HTMLElement) => void;
  /** Called once after each batch of ResizeObserver entries. */
  onAfterResizeBatch?: () => void;
  /**
   * Test override: supply a deterministic height for an element (jsdom has no
   * layout). Return undefined to fall back to DOM measurement.
   */
  getHeightOverride?: (
    element: HTMLElement,
    index: number,
  ) => number | undefined;
}

export interface ItemMeasurer {
  /** Stable ref callback for a row key. */
  refFor(key: React.Key): (node: HTMLElement | null) => void;
  /** Drop cached callbacks for keys that are no longer rendered. */
  prune(activeKeys: ReadonlySet<React.Key>): void;
  disconnect(): void;
}

function indexOf(element: HTMLElement): number {
  const raw = element.dataset.index;
  const index = raw === undefined ? NaN : Number(raw);

  return Number.isFinite(index) ? index : -1;
}

export function createItemMeasurer(options: ItemMeasurerOptions): ItemMeasurer {
  const refCallbacks = new Map<React.Key, (node: HTMLElement | null) => void>();
  const elementForKey = new Map<React.Key, HTMLElement>();

  const measureElement = (element: HTMLElement, entryHeight?: number) => {
    const index = indexOf(element);
    if (index === -1) return;

    // An explicit ResizeObserver entry height wins over the testing override:
    // overrides stand in for jsdom's missing layout at attach time, while
    // entries (real or harness-fired) describe actual size changes.
    const height =
      entryHeight ??
      options.getHeightOverride?.(element, index) ??
      element.getBoundingClientRect().height;

    // Zero heights come from display:none subtrees and detached nodes, not
    // from real rows — recording them would corrupt the offset tree.
    if (height <= 0) return;

    options.onMeasure(index, height, element);
  };

  const observer =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver((entries) => {
          for (const entry of entries) {
            const size = entry.borderBoxSize?.[0];

            measureElement(
              entry.target as HTMLElement,
              // Fractional border-box height straight from the entry; falls
              // back to getBoundingClientRect inside measureElement.
              size ? size.blockSize : undefined,
            );
          }

          options.onAfterResizeBatch?.();
        });

  return {
    refFor(key) {
      let callback = refCallbacks.get(key);
      if (callback) return callback;

      callback = (node) => {
        const previous = elementForKey.get(key);

        if (previous && previous !== node) {
          observer?.unobserve(previous);
          elementForKey.delete(key);
        }

        if (!node) return;

        elementForKey.set(key, node);
        // Synchronous initial measurement: ref callbacks run before layout
        // effects in the same commit, so the flush effect that repairs the
        // scroll position sees real heights, not estimates. ResizeObserver
        // only reports *subsequent* resizes — its first delivery is too late
        // for anchoring.
        measureElement(node);
        observer?.observe(node);
      };

      refCallbacks.set(key, callback);

      return callback;
    },
    prune(activeKeys) {
      for (const key of refCallbacks.keys()) {
        if (!activeKeys.has(key)) {
          refCallbacks.delete(key);
        }
      }

      for (const [key, element] of elementForKey) {
        if (!activeKeys.has(key)) {
          observer?.unobserve(element);
          elementForKey.delete(key);
        }
      }
    },
    disconnect() {
      observer?.disconnect();
      refCallbacks.clear();
      elementForKey.clear();
    },
  };
}
