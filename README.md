# sogna-virtual-list

A lightweight React virtual list for chat, feeds, logs, and dynamic-height
message UIs.

`sogna-virtual-list` keeps large, frequently changing lists responsive while
preserving scroll position during common messaging workflows: appending new
items, prepending history, streaming content into an existing row, trimming old
items, and jumping to a known item.

## Features

- Dynamic item measurement with `ResizeObserver`.
- Scroll-position repair for prepend, append, trim, replace, and streaming
  updates.
- Imperative data and scroll methods through a forwarded ref or hook.
- Header, footer, sticky header, sticky footer, empty state, and custom scroller
  slots.
- TypeScript declarations generated from the source.
- No runtime dependency beyond React and React DOM.

## Install

```bash
npm install sogna-virtual-list
```

React and React DOM are peer dependencies:

```bash
npm install react react-dom
```

## Requirements

- React 18 or React 19.
- Node.js 18 or newer for local development and builds.
- A browser environment with `ResizeObserver`.

`useWindowScroll` and `customScrollParent` are not implemented in `0.1.0`.
Passing either prop falls back to the internal scroller and logs a warning.

## Basic Usage

The default flow is `top-down`: the first message starts at the top and new
messages grow downward.

```tsx
import { SognaVirtualList } from "sogna-virtual-list";

type Message = {
  id: string;
  author: "user" | "assistant";
  text: string;
};

export function ChatList({ messages }: { messages: Message[] }) {
  return (
    <SognaVirtualList<Message, null>
      data={{
        data: messages,
      }}
      context={null}
      computeItemKey={({ data }) => data.id}
      ItemContent={({ data }) => (
        <div style={{ padding: "6px 12px" }}>
          <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {data.text}
          </div>
        </div>
      )}
      style={{ height: 480, width: "100%" }}
    />
  );
}
```

For a classic chat window where short conversations sit at the bottom and the
initial view opens on the latest item, use `messageFlow="bottom-up"`.

```tsx
<SognaVirtualList<Message, null>
  data={{ data: messages }}
  messageFlow="bottom-up"
  context={null}
  computeItemKey={({ data }) => data.id}
  ItemContent={({ data }) => <div>{data.text}</div>}
  style={{ height: 480 }}
/>
```

## Streaming Updates

For streaming text, keep the same item id and update that item with
`scrollModifier: { type: "items-change", behavior: "auto" }`. If the user is
already at the bottom, the list follows the growing item. If the user has
scrolled up, their reading position is preserved.

```tsx
import { SognaVirtualList } from "sogna-virtual-list";
import type { DataWithScrollModifier } from "sogna-virtual-list";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

function StreamingChat({ messages }: { messages: Message[] }) {
  const data: DataWithScrollModifier<Message> = {
    data: messages,
    scrollModifier: {
      type: "items-change",
      behavior: "auto",
    },
  };

  return (
    <SognaVirtualList<Message, null>
      data={data}
      context={null}
      computeItemKey={({ data }) => data.id}
      ItemContent={({ data }) => <div>{data.content}</div>}
      style={{ height: "100%" }}
    />
  );
}
```

## Loading Older Items

Use the `prepend` scroll modifier when older items are inserted before the
current data. The visible viewport stays anchored instead of jumping.

```tsx
const data = {
  data: [...olderMessages, ...messages],
  scrollModifier: "prepend" as const,
};
```

## Imperative API

Use a ref when the owner component needs to control the list:

```tsx
import { createRef } from "react";
import {
  SognaVirtualList,
  type SognaVirtualListMethods,
} from "sogna-virtual-list";

const ref = createRef<SognaVirtualListMethods<Message, null>>();

<SognaVirtualList<Message, null>
  ref={ref}
  data={{ data: messages }}
  context={null}
  ItemContent={({ data }) => <div>{data.text}</div>}
/>;

ref.current?.scrollToItem({ index: "LAST", align: "end", behavior: "smooth" });
```

Use `useSognaVirtualListMethods` from inside the list tree:

```tsx
import { useSognaVirtualListMethods } from "sogna-virtual-list";

function AddMessageButton() {
  const methods = useSognaVirtualListMethods<Message, null>();

  return (
    <button
      type="button"
      onClick={() => {
        methods.data.append(
          [{ id: crypto.randomUUID(), role: "assistant", content: "New item" }],
          "smooth",
        );
      }}
    >
      Add
    </button>
  );
}
```

Data methods:

- `append(data, autoscrollToBottom?)`
- `prepend(data)`
- `insert(data, offset, autoscrollToBottom?)`
- `deleteRange(offset, count)`
- `find(predicate)`
- `findIndex(predicate)`
- `findAndDelete(predicate)`
- `map(callback, autoscrollToBottomBehavior?)`
- `mapWithAnchor(callback, anchorItemIndex)`
- `replace(data, options?)`
- `batch(callback, autoscrollToBottom?)`
- `removeFromStart(count)`
- `get()`
- `getCurrentlyRendered()`

Scroll methods:

- `scrollToItem(location)`
- `scrollIntoView(location)`
- `getScrollLocation()`
- `scrollerElement()`
- `cancelSmoothScroll()`
- `height(item)`

## Scroll Modifiers

`scrollModifier` tells the list how to repair scroll position after data
changes.

```ts
type ScrollModifier =
  | "prepend"
  | "remove-from-start"
  | "remove-from-end"
  | {
      type: "item-location";
      location: ItemLocation;
      purgeItemSizes?: boolean;
    }
  | {
      type: "auto-scroll-to-bottom";
      autoScroll: AutoscrollToBottom;
    }
  | {
      type: "items-change";
      behavior: ScrollBehavior | { location: () => ItemLocation | null };
    };
```

Common choices:

- `"prepend"` for loading older items above the viewport.
- `"remove-from-start"` for trimming old items from the beginning.
- `{ type: "items-change", behavior: "auto" }` for streaming updates.
- `{ type: "item-location", location: { index: "LAST", align: "end" } }` for
  replacing data and jumping to the latest item.
- `{ type: "auto-scroll-to-bottom", autoScroll: true }` for appending only when
  the user is already at the bottom.

## Props

The main component is generic:

```tsx
<SognaVirtualList<Data, Context> />
```

Core props:

- `data`: controlled data with an optional `scrollModifier`.
- `initialData`: uncontrolled initial data.
- `context`: arbitrary value passed to render slots.
- `messageFlow`: `"top-down"` by default. Use `"bottom-up"` for classic
  bottom-aligned chat behavior.
- `computeItemKey`: stable key resolver.
- `ItemContent`: item renderer.
- `Header`, `StickyHeader`, `Footer`, `StickyFooter`, `EmptyPlaceholder`:
  optional slot components.
- `ScrollElement`: custom scroll element component or `"div"`.
- `onScroll`: receives the current `ListScrollLocation`.
- `onRenderedDataChange`: receives the currently rendered data range.
- `shortSizeAlign`: `"top"`, `"bottom"`, or `"bottom-smooth"`. Overrides the
  alignment implied by `messageFlow`.
- `increaseViewportBy`: extra pixels rendered above and below the viewport.
- `itemIdentity`: identity resolver used by item-size cache logic.
- `enforceStickyFooterAtBottom`: keeps the sticky footer pinned when possible.

## Testing

`SognaVirtualListTestingContext` lets tests provide deterministic viewport and
item sizes.

```tsx
import {
  SognaVirtualList,
  SognaVirtualListTestingContext,
} from "sogna-virtual-list";

render(
  <SognaVirtualListTestingContext.Provider
    value={{ viewportHeight: 400, itemHeight: 40 }}
  >
    <SognaVirtualList
      data={{ data: messages }}
      context={null}
      ItemContent={({ data }) => <div>{data.text}</div>}
    />
  </SognaVirtualListTestingContext.Provider>,
);
```

## Development

```bash
npm install
npm run typecheck
npm run test
npm run build
npm run pack:dry-run
```

Run the full local validation before publishing:

```bash
npm run validate
```

## Publishing

This package is configured for public npm publishing.

```bash
npm login
npm version patch
npm publish --access public
```

Repository:

```text
git@github.com:Victor-ChanX/sogna-virtual-list.git
```

## License And Notices

MIT. See `LICENSE`.

Some internal engine primitives under `src/engine` are copied or adapted from
MIT-licensed `react-virtuoso`. See `NOTICE.md` and
`THIRD_PARTY_LICENSES.md`.
