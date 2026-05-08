import React, { createRef } from "react";

import { describe, expect, it } from "vitest";

import type {
  ScrollModifier,
  SognaVirtualListMethods,
  SognaVirtualListProps,
  MessageFlow,
} from "./index";
import { SognaVirtualList } from "../components/SognaVirtualList";

type Message = {
  id: string;
  text: string;
};

type Context = {
  channelId: string;
};

const ref = createRef<SognaVirtualListMethods<Message, Context>>();

const ItemContent: SognaVirtualListProps<
  Message,
  Context
>["ItemContent"] = ({ data, context }) => (
  <div data-channel-id={context.channelId}>{data.text}</div>
);

const modifier: ScrollModifier = {
  type: "item-location",
  location: {
    index: "LAST",
    align: "end",
  },
};

const flow: MessageFlow = "top-down";

export const typedElement = (
  <SognaVirtualList<Message, Context>
    ref={ref}
    context={{
      channelId: "general",
    }}
    messageFlow={flow}
    data={{
      data: [
        {
          id: "1",
          text: "hello",
        },
      ],
      scrollModifier: modifier,
    }}
    computeItemKey={({ data }) => data.id}
    ItemContent={ItemContent}
  />
);

describe("public API types", () => {
  it("accepts typed data, context, ref, and scroll modifiers", () => {
    expect(React.isValidElement(typedElement)).toBe(true);
  });
});
