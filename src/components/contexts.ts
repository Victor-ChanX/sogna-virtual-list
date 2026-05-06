import React from "react";

import type { ListScrollLocation, SognaVirtualListMethods } from "../types";

export const MethodsContext =
  React.createContext<SognaVirtualListMethods | null>(null);

export const LocationContext = React.createContext<ListScrollLocation>({
  listOffset: 0,
  visibleListHeight: 0,
  scrollHeight: 0,
  bottomOffset: 0,
  isAtBottom: false,
  lastVisibleItemIndex: 0,
  lastItemBottomOffset: 0,
});

export const RenderedDataContext = React.createContext<unknown[]>([]);
