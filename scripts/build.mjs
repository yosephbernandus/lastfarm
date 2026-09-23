import { copyFile, mkdir } from "node:fs/promises";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = (file) => new URL(`../src/${file}`, import.meta.url);
const output = new URL("../dist/", import.meta.url);

await mkdir(output, { recursive: true });
await copyFile(source("index.html"), new URL("index.html", output));
await copyFile(source("styles.css"), new URL("styles.css", output));
await build({
  absWorkingDir: root,
  entryPoints: ["src/game.js"],
  bundle: true,
  minify: true,
  sourcemap: false,
  format: "iife",
  target: ["es2020"],
  outfile: "dist/game.bundle.js",
  legalComments: "none",
});
console.log("Built local Babylon.js game bundle and static shell into dist/");
