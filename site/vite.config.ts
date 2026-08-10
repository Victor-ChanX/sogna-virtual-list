import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Relative base so the static build works on GitHub Pages or any subpath.
  base: "./",
  server: {
    port: 5184,
  },
  build: {
    outDir: "dist",
  },
});
