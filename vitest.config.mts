import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Same "@/..." imports as the app, so server modules can be tested directly.
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
