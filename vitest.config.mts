import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@theouthaven/auth": path.resolve(__dirname, "packages/auth"),
      "@theouthaven/config": path.resolve(__dirname, "packages/config"),
      "@theouthaven/db": path.resolve(__dirname, "packages/db"),
      "server-only": path.resolve(__dirname, "test-shims/server-only.ts"),
    },
  },
});
