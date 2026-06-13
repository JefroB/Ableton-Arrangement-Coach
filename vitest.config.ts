import { defineConfig } from "vitest/config";
import { readFileSync } from "fs";
import { Plugin } from "vite";

/**
 * Vite plugin to handle .html imports as raw text strings.
 * Mirrors the esbuild `loader: { ".html": "text" }` behaviour in build.ts.
 */
function rawHtmlPlugin(): Plugin {
  return {
    name: "raw-html",
    transform(_code: string, id: string) {
      if (id.endsWith(".html")) {
        const content = readFileSync(id, "utf-8");
        return {
          code: `export default ${JSON.stringify(content)};`,
          map: null,
        };
      }
    },
  };
}

export default defineConfig({
  plugins: [rawHtmlPlugin()],
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/ui/webview/**"],
    },
    testTimeout: 5000,
  },
});
