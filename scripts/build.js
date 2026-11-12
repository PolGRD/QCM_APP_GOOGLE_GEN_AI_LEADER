#!/usr/bin/env node
/*
 * Builds a single self-contained HTML file (CSS + data + JS inlined).
 *   node scripts/build.js                 -> dist/gen-ai-leader-mock-exam.html (full document)
 *   node scripts/build.js --fragment out  -> page fragment without <html>/<head>/<body>
 *                                            (format expected by Claude artifacts)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const html = read("index.html");
const css = read("src/styles.css");
const js = read("src/questions.js") + "\n" + read("src/app.js");
const safe = (s) => s.replace(/<\/script/gi, "<\\/script");

let out = html
  .replace(/<link rel="stylesheet" href="src\/styles.css">/, () => `<style>\n${css}</style>`)
  .replace(/<script src="src\/questions.js"><\/script>\s*<script src="src\/app.js"><\/script>/, () => `<script>\n${safe(js)}</script>`);

const fragIdx = process.argv.indexOf("--fragment");
if (fragIdx > -1) {
  const head = out.match(/<head>([\s\S]*)<\/head>/)[1]
    .replace(/<meta charset[^>]*>\s*/, "")
    .replace(/<meta name="viewport"[^>]*>\s*/, "");
  const body = out.match(/<body>([\s\S]*)<\/body>/)[1];
  out = head.trim() + "\n" + body.trim() + "\n";
  const dest = process.argv[fragIdx + 1];
  fs.writeFileSync(dest, out);
  console.log("fragment written to " + dest);
} else {
  fs.mkdirSync(path.join(root, "dist"), { recursive: true });
  const dest = path.join(root, "dist/gen-ai-leader-mock-exam.html");
  fs.writeFileSync(dest, out);
  console.log("written " + path.relative(root, dest) + " (" + Math.round(out.length / 1024) + " KB)");
}
