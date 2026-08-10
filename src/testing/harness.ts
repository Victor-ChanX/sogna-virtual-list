/**
 * Test harness for jsdom, where no real layout exists.
 *
 * Installs a controllable ResizeObserver mock and an Element.scrollTo stub so
 * component tests can exercise the measurement and scroll-repair paths:
 *
 * ```ts
 * const harness = installTestHarness();
 * // ...render, interact...
 * harness.resize(element, 120); // fire a resize with a border-box height
 * harness.restore();
 * ```
 */

export interface TestHarness {
  /** Fire a resize entry for an observed element with the given height. */
  resize(element: Element, height: number): void;
  /** Whether any mock observer currently observes the element. */
  isObserved(element: Element): boolean;
  /** Restore the previous globals. */
  restore(): void;
}

interface ObserverRecord {
  callback: ResizeObserverCallback;
  observer: ResizeObserver;
  targets: Set<Element>;
}

export function installTestHarness(): TestHarness {
  const records = new Set<ObserverRecord>();

  class MockResizeObserver implements ResizeObserver {
    private record: ObserverRecord;

    constructor(callback: ResizeObserverCallback) {
      this.record = { callback, observer: this, targets: new Set() };
      records.add(this.record);
    }

    observe(target: Element) {
      this.record.targets.add(target);
    }

    unobserve(target: Element) {
      this.record.targets.delete(target);
    }

    disconnect() {
      this.record.targets.clear();
      records.delete(this.record);
    }
  }

  const globalRef = globalThis as {
    ResizeObserver?: typeof ResizeObserver;
  };
  const previousResizeObserver = globalRef.ResizeObserver;
  globalRef.ResizeObserver = MockResizeObserver as typeof ResizeObserver;

  // jsdom has no Element.prototype.scrollTo; route it to a scrollTop write so
  // the component's scroll paths work.
  const elementProto = Element.prototype as Element & {
    scrollTo?: (options?: ScrollToOptions | number, y?: number) => void;
  };
  const previousScrollTo = elementProto.scrollTo;
  elementProto.scrollTo = function scrollTo(
    this: Element,
    options?: ScrollToOptions | number,
    y?: number,
  ) {
    const top =
      typeof options === "number" ? (y ?? 0) : (options?.top ?? this.scrollTop);
    this.scrollTop = top;
  };

  return {
    resize(element, height) {
      const entry = {
        target: element,
        borderBoxSize: [{ blockSize: height, inlineSize: 0 }],
        contentBoxSize: [{ blockSize: height, inlineSize: 0 }],
        contentRect: {
          height,
          width: 0,
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: 0,
          bottom: height,
          toJSON: () => ({}),
        },
        devicePixelContentBoxSize: [{ blockSize: height, inlineSize: 0 }],
      } as unknown as ResizeObserverEntry;

      for (const record of records) {
        if (record.targets.has(element)) {
          record.callback([entry], record.observer);
        }
      }
    },
    isObserved(element) {
      for (const record of records) {
        if (record.targets.has(element)) return true;
      }

      return false;
    },
    restore() {
      if (previousResizeObserver === undefined) {
        delete globalRef.ResizeObserver;
      } else {
        globalRef.ResizeObserver = previousResizeObserver;
      }

      if (previousScrollTo === undefined) {
        delete (elementProto as { scrollTo?: unknown }).scrollTo;
      } else {
        elementProto.scrollTo = previousScrollTo;
      }

      records.clear();
    },
  };
}
