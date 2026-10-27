import path from "path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "./",

  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      assert: "assert/",
      util: "util/",
      "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "./src")
    }
  },

  server: {
    port: 3000,
    host: "0.0.0.0"
  },

  preview: {
    port: 3000,
    host: "0.0.0.0"
  }
});
