#!/usr/bin/env node
/**
 * Headless check renders of public/models/fg/<id>.glb (three.js GLTFLoader in Chromium via Playwright).
 *
 *   node scripts/fg-aircraft/view.cjs [ids...] [--views=left,front,top,deflect,deflectRear] [--out=DIR]
 *
 * Grey plane = JSBSim main-gear contact height; magenta ball + axes = origin (JSBSim CG; red X = left,
 * green Y = up, blue Z = nose); yellow/cyan dots = JSBSim main / nose-or-tail contact points;
 * green dot = pilot's eye. "deflect" views turn elevator, rudder, ailerons and flaps +20 degrees
 * about their local +X (expected: trailing edges UP, rudder trailing edge to the pilot's RIGHT).
 */
const { chromium } = require("playwright");
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "..", "..");
// FG_SERVE_ROOT: serve another folder (it must contain node_modules/three, scripts/fg-aircraft and public/models/fg)
const SERVE = process.env.FG_SERVE_ROOT || ROOT;
const ALL = ["c172p", "c182", "pa28", "J3Cub", "c310", "DHC6", "p51d", "A320", "f16", "t6texan2"];
const args = process.argv.slice(2);
const opt = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) || `=${d}`).split("=")[1];
const ids = args.filter((a) => !a.startsWith("--"));
const views = opt("views", "left,front,top,deflect,deflectTail,deflectWing").split(",");
const out = opt(
  "out",
  "/tmp/claude-0/-home-user-wingwise-flight-learning/51b73d3e-32ac-50c3-af10-4e0cf79554b5/scratchpad/fg-shots",
);

function freePort() {
  return new Promise((res) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
  });
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const port = await freePort();
  const srv = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1", "--directory", SERVE], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 720 }, deviceScaleFactor: 1 });
  page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && console.log("  [page]", m.text()));
  page.on("pageerror", (e) => console.log("  [page error]", e.message));
  try {
    for (const id of ids.length ? ids : ALL) {
      if (!fs.existsSync(path.join(SERVE, "public/models/fg", id + ".glb"))) {
        console.log(`${id}: no glb`);
        continue;
      }
      for (const v of views) {
        await page.goto(`http://127.0.0.1:${port}/scripts/fg-aircraft/view.html?id=${id}&view=${v}`);
        await page.waitForFunction(() => window.__done === true, null, { timeout: 120000 });
        const file = path.join(out, `${id}-${v}.png`);
        await page.screenshot({ path: file });
        const checks = await page.evaluate(() => window.__checks);
        const bad = Object.entries(checks || {}).filter(([, v]) => !v.ok);
        console.log(file + (checks && Object.keys(checks).length ? (bad.length ? "  CHECK FAILED: " + JSON.stringify(Object.fromEntries(bad)) : "  hinge directions OK (" + Object.keys(checks).join(" ") + ")") : ""));
      }
    }
  } finally {
    await browser.close();
    srv.kill();
  }
})();
