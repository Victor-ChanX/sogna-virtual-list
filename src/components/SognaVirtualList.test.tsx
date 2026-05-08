import React, { createRef, act } from "react";

import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SognaVirtualList } from "./SognaVirtualList";
import { SognaVirtualListTestingContext } from "../testing/context";
import type {
  SognaVirtualListMethods,
  SognaVirtualListProps,
} from "../types";

type Message = {
  id: string;
  text: string;
};

const ItemContent: SognaVirtualListProps<Message, null>["ItemContent"] = ({
  data,
}) => <div>{data.text}</div>;

describe("SognaVirtualList", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);

    Element.prototype.scrollTo = vi.fn(function scrollTo(
      this: Element,
      options?: ScrollToOptions | number,
    ) {
      if (typeof options === "object" && options.top !== undefined) {
        Object.defineProperty(this, "scrollTop", {
          configurable: true,
          value: options.top,
          writable: true,
        });
      }
    });
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  it("renders data and exposes imperative append/map/delete methods", () => {
    const root = createRoot(container);
    const ref = createRef<SognaVirtualListMethods<Message, null>>();

    act(() => {
      root.render(
        <SognaVirtualListTestingContext.Provider
          value={{
            itemHeight: 20,
            viewportHeight: 100,
          }}
        >
          <SognaVirtualList<Message, null>
            ref={ref}
            computeItemKey={({ data }) => data.id}
            initialData={[
              {
                id: "1",
                text: "hello",
              },
            ]}
            ItemContent={ItemContent}
          />
        </SognaVirtualListTestingContext.Provider>,
      );
    });

    expect(container.textContent).toContain("hello");

    act(() => {
      ref.current?.data.append([
        {
          id: "2",
          text: "world",
        },
      ]);
    });

    expect(ref.current?.data.get()).toHaveLength(2);
    expect(container.textContent).toContain("world");

    act(() => {
      ref.current?.data.map((message) =>
        message.id === "2"
          ? {
              ...message,
              text: "updated",
            }
          : message,
      );
    });

    expect(container.textContent).toContain("updated");

    act(() => {
      ref.current?.data.findAndDelete((message) => message.id === "1");
    });

    expect(ref.current?.data.get()).toEqual([
      {
        id: "2",
        text: "updated",
      },
    ]);
  });

  it("uses top-down message flow by default", () => {
    const root = createRoot(container);

    act(() => {
      root.render(
        <SognaVirtualListTestingContext.Provider
          value={{
            itemHeight: 20,
            viewportHeight: 100,
          }}
        >
          <SognaVirtualList<Message, null>
            computeItemKey={({ data }) => data.id}
            initialData={[
              {
                id: "1",
                text: "hello",
              },
            ]}
            ItemContent={ItemContent}
          />
        </SognaVirtualListTestingContext.Provider>,
      );
    });

    const list = container.querySelector<HTMLElement>(
      "[data-testid='sogna-virtual-list-list']",
    );

    expect(list?.style.marginTop).toBe("0px");
  });

  it("supports bottom-up message flow for classic chat alignment", () => {
    const root = createRoot(container);

    act(() => {
      root.render(
        <SognaVirtualListTestingContext.Provider
          value={{
            itemHeight: 20,
            viewportHeight: 100,
          }}
        >
          <SognaVirtualList<Message, null>
            computeItemKey={({ data }) => data.id}
            initialData={[
              {
                id: "1",
                text: "hello",
              },
            ]}
            ItemContent={ItemContent}
            messageFlow="bottom-up"
          />
        </SognaVirtualListTestingContext.Provider>,
      );
    });

    const list = container.querySelector<HTMLElement>(
      "[data-testid='sogna-virtual-list-list']",
    );

    expect(list?.style.marginTop).toBe("80px");
  });
});
