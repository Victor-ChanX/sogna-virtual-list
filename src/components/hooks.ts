import { useContext } from "react";

import {
  LocationContext,
  MethodsContext,
  RenderedDataContext,
} from "./contexts";
import type { ListScrollLocation, SognaVirtualListMethods } from "../types";

export function useSognaVirtualListMethods<
  Data = unknown,
  Context = unknown,
>(): SognaVirtualListMethods<Data, Context> {
  const methods = useContext(MethodsContext);

  if (!methods) {
    throw new Error(
      "useSognaVirtualListMethods must be used inside SognaVirtualList.",
    );
  }

  return methods as SognaVirtualListMethods<Data, Context>;
}

export function useSognaVirtualListLocation(): ListScrollLocation {
  return useContext(LocationContext);
}

export function useCurrentlyRenderedData<Data>(): Data[] {
  return useContext(RenderedDataContext) as Data[];
}
