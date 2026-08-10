import React from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { LangProvider } from "./i18n";

createRoot(document.getElementById("root") as HTMLElement).render(
  <LangProvider>
    <App />
  </LangProvider>,
);
