import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      fileName: "index",
      formats: ["es", "cjs"],
      name: "SognaVirtualList",
    },
    rollupOptions: {
      external: ["react", "react/jsx-runtime", "react-dom"],
      output: {
        exports: "named",
      },
    },
  },
  plugins: [
    react(),
    dts({
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      rollupTypes: true,
    }),
  ],
});
