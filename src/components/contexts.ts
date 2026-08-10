import React from "react";

import { EMPTY_SCROLL_LOCATION } from "../engine/list-math";
import type { ListScrollLocation, SognaVirtualListMethods } from "../types";

export const MethodsContext =
  React.createContext<SognaVirtualListMethods | null>(null);

export const LocationContext = React.createContext<ListScrollLocation>(
  EMPTY_SCROLL_LOCATION,
);

export const RenderedDataContext = React.createContext<unknown[]>([]);
