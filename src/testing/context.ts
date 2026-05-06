import React from "react";

import type { SognaVirtualListTestingContextValue } from "../types";

export const SognaVirtualListTestingContext = React.createContext<
  SognaVirtualListTestingContextValue | undefined
>(undefined);
