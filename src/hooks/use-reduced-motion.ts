import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";

/**
 * True when motion should be kept to a minimum: the OS asks for reduced motion, or the user turned
 * on "Reduce motion" in SkyReady settings. JS-driven animations (canvas/SVG loops, count-ups) should
 * check this; CSS animations are already handled in styles.css.
 */
export function useReducedMotion(): boolean {
  const setting = useStore((s) => s.settings.accessibility.reducedMotion);
  const [os, setOs] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setOs(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return setting || os;
}
