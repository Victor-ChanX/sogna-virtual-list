import type React from "react";

export type BezierFunction = (x: number) => number;

export type ScrollBehavior =
  | "smooth"
  | "auto"
  | "instant"
  | ((
      currentTop: number,
      targetTop: number,
    ) => {
      animationFrameCount: number;
      easing: BezierFunction;
    });

export type ItemLocation = number | ItemLocationWithAlign;

export type ShortSizeAlign = "top" | "bottom" | "bottom-smooth";

export type MessageFlow = "top-down" | "bottom-up";

export interface ItemLocationWithAlign {
  index: number | "LAST";
  align?: "start" | "center" | "end" | "start-no-overflow";
  behavior?: ScrollBehavior;
  offset?: number;
  done?: () => void;
}

export interface ListScrollLocation {
  listOffset: number;
  visibleListHeight: number;
  scrollHeight: number;
  bottomOffset: number;
  isAtBottom: boolean;
  lastVisibleItemIndex: number;
  lastItemBottomOffset: number;
}

export interface ItemLocationCallbackParams<Data = unknown, Context = unknown> {
  scrollLocation: ListScrollLocation;
  scrollInProgress: boolean;
  atBottom: boolean;
  data: Data[];
  context: Context;
}

export type ItemLocationCallback<Data = unknown, Context = unknown> = (
  params: ItemLocationCallbackParams<Data, Context>,
) => ScrollBehavior | boolean | ItemLocation;

export type AutoscrollToBottom<Data = unknown, Context = unknown> =
  | ItemLocationCallback<Data, Context>
  | NonNullable<ScrollToOptions["behavior"]>
  | boolean;

export interface DataChangeParams<Data = unknown> {
  newData: Data[];
  autoscrollToBottomBehavior?:
    | ScrollBehavior
    | {
        location: () => ItemLocation | null | undefined;
      };
}

export interface DataMethods<Data = unknown, Context = unknown> {
  prepend: (data: Data[]) => void;
  append: (
    data: Data[],
    scrollToBottom?: AutoscrollToBottom<Data, Context>,
  ) => void;
  map: (
    callbackfn: (data: Data, index: number) => Data,
    autoscrollToBottomBehavior?:
      | ScrollBehavior
      | {
          location: () => ItemLocation | null | undefined;
        },
  ) => void;
  mapWithAnchor: (
    callbackfn: (data: Data, index: number) => Data,
    anchorItemIndex: number,
  ) => void;
  findAndDelete: (predicate: (item: Data, index: number) => boolean) => void;
  findIndex: (
    predicate: (item: Data, index: number, data: Data[]) => boolean,
  ) => number;
  find: (
    predicate: (item: Data, index: number, data: Data[]) => boolean,
  ) => Data | undefined;
  replace: (
    data: Data[],
    options?: {
      initialLocation?: ItemLocation;
      purgeItemSizes?: boolean;
      suppressItemMeasure?: boolean;
    },
  ) => void;
  insert: (
    data: Data[],
    offset: number,
    scrollToBottom?: AutoscrollToBottom<Data, Context>,
  ) => void;
  deleteRange: (offset: number, count: number) => void;
  batch: (
    callback: () => void,
    scrollToBottom?: AutoscrollToBottom<Data, Context>,
  ) => void;
  get: () => Data[];
  getCurrentlyRendered: () => Data[];
  removeFromStart: (count: number) => void;
}

export interface DataWithScrollModifier<Data> {
  data: Data[] | null | undefined;
  scrollModifier?: ScrollModifier;
}

export const ScrollModifierOption = {
  prepend: "prepend",
  removeFromStart: "remove-from-start",
  removeFromEnd: "remove-from-end",
} as const;

export type ScrollModifierOptionType = typeof ScrollModifierOption;

export type ScrollModifierOptionValue =
  ScrollModifierOptionType[keyof ScrollModifierOptionType];

export type ScrollModifier =
  | null
  | undefined
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
      behavior:
        | ScrollBehavior
        | {
            location: () => ItemLocation | null | undefined;
          };
    }
  | ScrollModifierOptionValue;

export type ContextAwareComponent<Context = unknown> = React.ComponentType<{
  context: Context;
}>;

export type ItemContent<
  Data = unknown,
  Context = unknown,
> = React.ComponentType<{
  index: number;
  data: Data;
  prevData: Data | null;
  nextData: Data | null;
  context: Context;
}>;

export type ScrollElementComponent<Context = unknown> = React.ComponentType<
  React.HTMLProps<HTMLDivElement> & {
    context?: Context;
  } & React.RefAttributes<HTMLDivElement>
>;

export type ScrollerProps = Omit<
  React.HTMLProps<HTMLDivElement>,
  "ref" | "data" | "onScroll"
>;

export type HeaderWrapperComponent = React.ComponentType<
  {
    style: React.CSSProperties;
    children: React.ReactNode;
  } & React.RefAttributes<HTMLDivElement>
>;

export type FooterWrapperComponent = HeaderWrapperComponent;

export type StickyHeaderWrapperComponent = HeaderWrapperComponent;

export type StickyFooterWrapperComponent = HeaderWrapperComponent;

export interface SognaVirtualListMethods<Data = unknown, Context = unknown> {
  data: DataMethods<Data, Context>;
  scrollToItem: (location: ItemLocation) => void;
  scrollIntoView: (location: ItemLocation) => void;
  scrollerElement: () => HTMLDivElement | null;
  getScrollLocation: () => ListScrollLocation;
  cancelSmoothScroll: () => void;
  height: (item: Data) => number;
}

export interface SognaVirtualListProps<Data, Context> extends ScrollerProps {
  initialData?: Data[];
  context?: Context;
  messageFlow?: MessageFlow;
  initialLocation?: ItemLocation;
  computeItemKey?: (params: {
    data: Data;
    index: number;
    context: Context;
  }) => React.Key;
  ItemContent?: ItemContent<Data, Context>;
  Header?: ContextAwareComponent<Context>;
  StickyHeader?: ContextAwareComponent<Context>;
  Footer?: ContextAwareComponent<Context>;
  StickyFooter?: ContextAwareComponent<Context>;
  EmptyPlaceholder?: ContextAwareComponent<Context>;
  ScrollElement?: ScrollElementComponent<Context> | "div";
  onScroll?: (location: ListScrollLocation) => void;
  onRenderedDataChange?: (range: Data[]) => void;
  HeaderWrapper?: HeaderWrapperComponent;
  StickyHeaderWrapper?: StickyHeaderWrapperComponent;
  FooterWrapper?: FooterWrapperComponent;
  StickyFooterWrapper?: StickyFooterWrapperComponent;
  shortSizeAlign?: ShortSizeAlign;
  useWindowScroll?: boolean;
  customScrollParent?: HTMLElement | null | undefined;
  increaseViewportBy?: number;
  data?: DataWithScrollModifier<Data> | null | undefined;
  itemIdentity?: (item: Data) => unknown;
  enforceStickyFooterAtBottom?: boolean;
}

export interface SognaVirtualListLicenseProps {
  licenseKey?: string;
  children: React.ReactNode;
}

export interface SognaVirtualListTestingContextValue {
  viewportHeight: number;
  itemHeight: number;
}

export interface VisibleItem<Data> {
  data: Data;
  prevData: Data | null;
  nextData: Data | null;
  index: number;
  offset: number;
  height: number;
}
