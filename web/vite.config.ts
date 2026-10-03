import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const lock = JSON.parse(
  readFileSync(fileURLToPath(new URL("./artifacts.lock.json", import.meta.url)), "utf8"),
) as { tag: string };

export default defineConfig({
  define: { __ARTIFACTS_TAG__: JSON.stringify(lock.tag) },
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  worker: { format: "es" },
  build: { target: "es2023" },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/unit/setup.ts"],
    css: false,
  },
});
