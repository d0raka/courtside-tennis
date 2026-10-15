import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const pages = ["index.html", "screen.html", "controller.html"];
const scripts = [
  "js/controller.js",
  "js/core.js",
  "js/engine.js",
  "js/home.js",
  "js/host.js",
  "js/motion.js",
  "js/network.js",
  "js/qr.js",
  "js/renderer.js",
  "tv-remote.js",
];

test("pages have a title", () => {
  for (const page of pages) {
    const html = readFileSync(page, "utf8");
    assert.match(html, /<title>[^<]+<\/title>/, page);
  }
});

test("game scripts parse", () => {
  for (const script of scripts) {
    const result = spawnSync(process.execPath, ["--check", script], { encoding: "utf8" });
    assert.equal(result.status, 0, `${script}\n${result.stderr}`);
  }
});
