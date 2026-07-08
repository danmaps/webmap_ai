import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      webmap_ai: resolve(__dirname, "../src/index.ts"),
    },
  },
});
