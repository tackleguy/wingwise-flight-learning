#!/usr/bin/env node
/**
 * Developer tool: open a page of the simulator in headless Chrome (software WebGL), optionally run
 * some JavaScript in it, print console output / errors / failed downloads, and save a screenshot.
 *
 *   node scripts/shot.cjs --url http://127.0.0.1:5321/dev/slice.html --out /tmp/x.png \
 *        [--wait 20000] [--ready "window.sim && window.sim.lastSpawn"] [--eval "code"] [--eval-file file.js]
 *        [--after 5000] [--width 1280 --height 720] [--mobile] [--keys "KeyB,KeyW:3000"]
 *
 *   --ready   JS expression polled until truthy (default: window.sim && window.sim.lastSpawn), max --wait ms
 *   --eval    JS run in the page after ready (may be async; its return value is printed as JSON)
 *   --after   extra milliseconds to wait after --eval before the screenshot (default 3000)
 *   --keys    comma list of keys to press; "Code:ms" holds the key for ms
 * Software rendering is slow (a few frames per second) and the simulator then runs in slow motion;
 * use sim.advance(seconds) inside --eval to move simulated time forward instantly.
 */
const { chromium } = require("playwright");
const fs = require("fs");

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith("--")) continue;
  const key = a.slice(2);
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith("--")) args[key] = true;
  else {
    args[key] = next;
    i++;
  }
}
if (!args.url) {
  console.error("usage: node scripts/shot.cjs --url <url> [--out file.png] …  (see the comment at the top of this file)");
  process.exit(2);
}

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
  const width = Number(args.width || 1280);
  const height = Number(args.height || 720);
  const context = await browser.newContext(
    args.mobile ? { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true } : { viewport: { width, height }, deviceScaleFactor: 1 },
  );
  const page = await context.newPage();
  const logs = [];
  page.on("console", (m) => {
    const t = m.text();
    if (/\[vite\]|React DevTools/.test(t)) return;
    logs.push(`[${m.type()}] ${t}`.slice(0, 500));
  });
  page.on("pageerror", (e) => logs.push("[pageerror] " + String(e.stack || e).slice(0, 900)));
  const failed = new Map();
  page.on("requestfailed", (r) => {
    const k = new URL(r.url()).host + " " + (r.failure()?.errorText ?? "");
    failed.set(k, (failed.get(k) || 0) + 1);
  });
  const bad = new Map();
  page.on("response", (r) => {
    if (r.status() >= 400) {
      const k = r.status() + " " + r.url().slice(0, 140);
      bad.set(k, (bad.get(k) || 0) + 1);
    }
  });
  let exit = 0;
  try {
    await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    const ready = args.ready === "none" ? null : args.ready || "window.sim && window.sim.lastSpawn";
    if (ready) {
      try {
        await page.waitForFunction(ready, null, { timeout: Number(args.wait || 60000), polling: 500 });
        console.log("READY: yes");
      } catch {
        console.log("READY: NO (timed out waiting for: " + ready + ")");
        exit = 1;
      }
    } else await page.waitForTimeout(Number(args.wait || 5000));
    let code = args.eval;
    if (args["eval-file"]) code = fs.readFileSync(args["eval-file"], "utf8");
    if (code) {
      try {
        const result = await page.evaluate(`(async () => { ${code} })()`);
        console.log("EVAL RESULT: " + JSON.stringify(result, null, 1));
      } catch (e) {
        console.log("EVAL ERROR: " + String(e).slice(0, 900));
        exit = 1;
      }
    }
    if (args.keys) {
      for (const k of String(args.keys).split(",")) {
        const [code2, ms] = k.split(":");
        if (ms) {
          await page.keyboard.down(code2);
          await page.waitForTimeout(Number(ms));
          await page.keyboard.up(code2);
        } else await page.keyboard.press(code2);
      }
    }
    await page.waitForTimeout(Number(args.after ?? 3000));
    if (args.out) {
      await page.screenshot({ path: args.out });
      console.log("SCREENSHOT: " + args.out);
    }
  } catch (e) {
    console.log("FAILED: " + String(e).slice(0, 900));
    exit = 1;
  }
  console.log("CONSOLE (" + logs.length + "):\n" + logs.slice(0, Number(args.maxlogs || 40)).join("\n"));
  if (bad.size) console.log("HTTP ERRORS:\n" + [...bad.entries()].slice(0, 15).map(([k, v]) => `${k} x${v}`).join("\n"));
  if (failed.size) console.log("FAILED REQUESTS:\n" + [...failed.entries()].slice(0, 15).map(([k, v]) => `${k} x${v}`).join("\n"));
  await browser.close();
  process.exit(exit);
})();
