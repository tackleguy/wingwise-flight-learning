/**
 * The magnetic ("whiskey") compass: a floating card seen through a window, mounted above the panel.
 * It shows sim.state.ind.compassMag. Like the real thing it is read from behind the card, so the
 * numbers run "backwards": larger headings are to the LEFT of the lubber line.
 */
import { useMemo, useRef } from "react";
import { norm360 } from "@/core/math";
import { useFrame } from "./context";
import { COMPASS_UNITS_PER_DEG } from "./geometry";
import { T, box, useCell } from "./parts";

export const COMPASS_W = 132;
export const COMPASS_H = 54;
const CX = 66;
const LABELS = ["N", "3", "6", "E", "12", "15", "S", "21", "24", "W", "30", "33"];

export function MagneticCompass() {
  const strip = useRef<SVGGElement>(null);
  const cell = useCell(NaN);
  useFrame(({ ind }) => {
    const x = norm360(Number.isFinite(ind.compassMag) ? ind.compassMag : 0) * COMPASS_UNITS_PER_DEG;
    if (Math.abs(x - cell.v) < 0.04) return;
    cell.v = x;
    strip.current?.setAttribute("transform", `translate(${x.toFixed(2)} 0)`);
  });
  const art = useMemo(() => {
    // The strip is drawn once for headings −60…420 and slid sideways; a mark for heading h sits at CX − h·k.
    let tens = "";
    let fives = "";
    const labels: { x: number; t: string }[] = [];
    for (let h = -60; h <= 420; h += 5) {
      const x = Math.round((CX - h * COMPASS_UNITS_PER_DEG) * 100) / 100;
      if (h % 10 === 0) tens += `M${x} 29.5V37`;
      else fives += `M${x} 33V37`;
      if (h % 30 === 0) labels.push({ x, t: LABELS[(((h / 30) % 12) + 12) % 12]! });
    }
    return { tens, fives, labels };
  }, []);
  return (
    <svg className="txp-inst" data-instrument="compass" viewBox={`0 0 ${COMPASS_W} ${COMPASS_H}`} style={box(COMPASS_W, COMPASS_H)} role="img" aria-label="Magnetic compass">
      <defs>
        <clipPath id="txp-compass-window">
          <rect x="14" y="9" width="104" height="30" rx="4" />
        </clipPath>
      </defs>
      <path d="M54 44H78L82 54H50Z" className="tx-bezel" />
      <rect x="2" y="2" width="128" height="44" rx="12" className="tx-bezel" />
      <rect x="2.6" y="2.6" width="126.8" height="42.8" rx="11.4" className="tx-bezel-ring" />
      <rect x="14" y="9" width="104" height="30" rx="4" className="tx-compass-card" />
      <g clipPath="url(#txp-compass-window)">
        <g ref={strip}>
          <path d={art.fives} className="arc s-mk" strokeWidth="1" />
          <path d={art.tens} className="arc s-mk" strokeWidth="1.5" />
          {art.labels.map((l, i) => (
            <T key={i} x={l.x} y={19.4} s={13}>
              {l.t}
            </T>
          ))}
        </g>
        {/* the card is a drum: it darkens toward the edges of the window */}
        <rect x="14" y="9" width="9" height="30" className="tx-compass-shade2" />
        <rect x="23" y="9" width="10" height="30" className="tx-compass-shade1" />
        <rect x="99" y="9" width="10" height="30" className="tx-compass-shade1" />
        <rect x="109" y="9" width="9" height="30" className="tx-compass-shade2" />
      </g>
      {/* lubber line: read the heading under it */}
      <path d={`M${CX} 9V39`} className="tx-lubber" />
      <rect x="14" y="9" width="104" height="30" rx="4" className="tx-inner-edge" />
    </svg>
  );
}
