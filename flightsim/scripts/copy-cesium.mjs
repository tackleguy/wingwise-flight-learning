// Copies CesiumJS's static runtime files (web workers, sky textures, widgets CSS) into public/cesium
// so the app can load them from its own origin. Runs automatically before `dev` and `build`.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "cesium", "Build", "Cesium");
const dst = join(root, "public", "cesium");
const version = JSON.parse(readFileSync(join(root, "node_modules", "cesium", "package.json"), "utf8")).version;
const stamp = join(dst, ".version");
if (existsSync(stamp) && readFileSync(stamp, "utf8") === version) process.exit(0);
mkdirSync(dst, { recursive: true });
for (const dir of ["Workers", "ThirdParty", "Assets", "Widgets"]) cpSync(join(src, dir), join(dst, dir), { recursive: true });
writeFileSync(stamp, version);
console.log(`Copied Cesium ${version} runtime assets to public/cesium`);
