/**
 * Must be imported BEFORE anything from "cesium": tells CesiumJS where its worker scripts and
 * static assets live (copied to public/cesium by scripts/copy-cesium.mjs). Relative to the page,
 * so the simulator works at any URL (Vercel root, or embedded under a sub-folder).
 */
declare global {
  interface Window {
    CESIUM_BASE_URL?: string;
  }
}
if (typeof window !== "undefined") window.CESIUM_BASE_URL = new URL(`${import.meta.env.BASE_URL}cesium/`, document.baseURI).href;
export {};
