import * as esbuild from "esbuild";
import * as fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const production = process.argv.includes("--production");

// Copy webview HTML to dist
fs.mkdirSync("dist/webview", { recursive: true });
fs.copyFileSync("src/ui/webview/index.html", "dist/webview/index.html");

await esbuild.build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/extension.js",
  bundle: true,
  format: "cjs",
  platform: "node",
  sourcesContent: false,
  logLevel: "info",
  minify: production,
  sourcemap: !production,
  loader: { ".html": "text" },
});
