/**
 * Stylesheet of the cockpit panel (kept in code so the panel is one self-contained module).
 * Colours that depend on the lighting come from CSS variables set by src/panel/lighting.ts.
 */
export const PANEL_CSS = `
.txp{position:absolute;left:0;right:0;bottom:0;z-index:20;pointer-events:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;touch-action:none;
  font-family:"Roboto Condensed","Arial Narrow","Helvetica Neue",Helvetica,Arial,"Liberation Sans",sans-serif;line-height:1;
  --u:1px;--tab:34px;
  --tx-mk:#f4f3ee;--tx-green:#34b24e;--tx-yellow:#f4c430;--tx-red:#e43a2e;--tx-orange:#ff941c;--tx-sky:#428ed6;--tx-ground:#7c522e;--tx-tube:#deded2;
  --tx-lcd:#86947e;--tx-lcd-ink:#101610;--tx-face:#0b0b0c;--tx-bezel:#1e1f22;--tx-bezel-hi:#46484e;--tx-panel:#2f333a;--tx-panel-hi:#3e434c;--tx-panel-lo:#24272d;
  --tx-glare:#0e0f11;--tx-knob:#1a1b1e;--tx-knob-hi:#5c5f66;--tx-red-knob:#c42822;--tx-rocker:#e8e6e0;--tx-rocker-red:#ce2c26;--tx-screw:#787a80;--tx-label:#e0dfd8;
  --tx-led:#ff7d1f;--tx-led-bg:#170a04}
.txp *,.txp *::before,.txp *::after{box-sizing:border-box}
.txp-top{position:relative;height:0;pointer-events:none}
.txp-compass{position:absolute;bottom:calc(var(--u) * -5);pointer-events:auto}
.txp-handle{position:absolute;right:8px;bottom:0;display:flex;gap:4px;pointer-events:auto}
.txp-chip{appearance:none;border:1px solid rgba(255,255,255,.16);border-bottom:0;background:rgba(14,16,20,.82);color:#d6dde6;height:28px;min-width:40px;padding:0 10px;border-radius:8px 8px 0 0;
  font:600 12px/1 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:inline-flex;align-items:center;gap:6px;cursor:pointer;touch-action:manipulation}
.txp-chip:hover{background:rgba(32,38,48,.92);color:#fff}
.txp-chip[aria-pressed="true"]{background:#1f6fb2;color:#fff;border-color:#5aa9e6}
.txp-chip:focus-visible,.txp-tab:focus-visible{outline:2px solid #7cc4ff;outline-offset:1px}
.txp-show{position:absolute;right:8px;bottom:0;pointer-events:auto}
.txp-shell{position:relative;pointer-events:auto;background:linear-gradient(180deg,var(--tx-panel-hi) 0,var(--tx-panel) 26%,var(--tx-panel-lo) 100%);box-shadow:0 -1px 0 rgba(0,0,0,.6)}
.txp-glare{height:calc(var(--u) * 12);background:linear-gradient(180deg,var(--tx-bezel-hi) 0,var(--tx-glare) 22%,var(--tx-glare) 78%,#000 100%);box-shadow:0 3px 6px rgba(0,0,0,.45);position:relative;z-index:1}
.txp-canvas{position:relative;margin:0 auto}
.txp-at{position:absolute}
.txp-inst{display:block;overflow:visible;touch-action:none}
.txp-stack{display:flex;flex-direction:column;gap:calc(var(--u) * 4)}

/* tab bar (compact layouts) */
.txp-tabs{display:flex;align-items:center;gap:6px;height:var(--tab);padding:0 8px;background:rgba(0,0,0,.28);border-bottom:1px solid rgba(0,0,0,.4);overflow:hidden}
.txp-tab{appearance:none;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#cfd6df;height:calc(var(--tab) - 8px);min-width:64px;padding:0 10px;border-radius:6px;
  font:600 12px/1 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;cursor:pointer;touch-action:manipulation;flex:0 0 auto}
.txp-tab:hover{background:rgba(255,255,255,.12);color:#fff}
.txp-tab[aria-selected="true"]{background:#1f6fb2;border-color:#5aa9e6;color:#fff}
.txp-tab.icon{min-width:36px;padding:0 8px}
.txp-tabs-space{flex:1 1 auto}
.txp-tabs-ann{flex:0 1 auto;min-width:0;overflow:hidden}

/* scrolling areas */
.txp-pages{position:absolute;display:flex;align-items:flex-start;gap:calc(var(--u) * 14);overflow-x:auto;overflow-y:hidden;scroll-snap-type:x proximity;scrollbar-width:none;touch-action:pan-x;overscroll-behavior:contain;padding:0 calc(var(--u) * 6)}
.txp-pages::-webkit-scrollbar{display:none}
.txp-pages.static{position:relative;justify-content:flex-start;margin:0 auto}
.txp-page{position:relative;flex:0 0 auto;scroll-snap-align:center}
.txp-page:first-child{margin-left:auto}
.txp-page:last-child{margin-right:auto}
.txp-pages .txp-inst{touch-action:pan-x}
.txp-rowscroll{overflow-x:auto;overflow-y:hidden;scrollbar-width:none;touch-action:pan-x}
.txp-rowscroll::-webkit-scrollbar{display:none}
.txp-rowscroll .txp-inst{touch-action:pan-x}
.txp .tx-ctl{touch-action:none;cursor:pointer;outline:none}
.txp .tx-ctl:focus-visible .tx-hit{stroke:#7cc4ff;stroke-width:1.6}

/* generic drawing classes */
.txp text{fill:var(--tx-mk);font-weight:700;pointer-events:none}
.txp .tx-mono{font-family:ui-monospace,"SF Mono","DejaVu Sans Mono",Menlo,Consolas,"Liberation Mono",monospace;font-weight:700}
.txp .mk{fill:var(--tx-mk)}
.txp .arc{fill:none}
.txp .s-mk{stroke:var(--tx-mk)}
.txp .s-green{stroke:var(--tx-green)}
.txp .s-yellow{stroke:var(--tx-yellow)}
.txp .s-red{stroke:var(--tx-red)}
.txp .s-label{stroke:var(--tx-label)}
.txp .f-sky{fill:var(--tx-sky)}
.txp .f-ground{fill:var(--tx-ground)}
.txp .f-orange{fill:var(--tx-orange)}
.txp .f-red{fill:var(--tx-red)}
.txp .tx-outline{stroke:rgba(0,0,0,.75);stroke-width:1;paint-order:stroke}
.txp .tx-bezel{fill:var(--tx-bezel)}
.txp .tx-bezel-ring{fill:none;stroke:var(--tx-bezel-hi);stroke-width:1.1}
.txp .tx-face{fill:var(--tx-face)}
.txp .tx-inner-face{fill:var(--tx-face);stroke:var(--tx-bezel-hi);stroke-width:.8}
.txp .tx-glass{fill:none;stroke:rgba(255,255,255,.05);stroke-width:1.5;pointer-events:none}
.txp .tx-inner-edge{fill:none;stroke:rgba(0,0,0,.65);stroke-width:1.6;pointer-events:none}
.txp .tx-screw{fill:var(--tx-screw)}
.txp .tx-screw-slot{stroke:rgba(0,0,0,.7);stroke-width:1.3;fill:none}
.txp .tx-hub{fill:var(--tx-knob);stroke:var(--tx-knob-hi);stroke-width:.8}
.txp .tx-hub-dot{fill:var(--tx-knob-hi)}
.txp .tx-needle{fill:var(--tx-mk);stroke:rgba(0,0,0,.55);stroke-width:.6}
.txp .tx-legend{font-weight:600;letter-spacing:.04em}
.txp .lbl{fill:var(--tx-label);font-weight:600;letter-spacing:.03em}
.txp .tx-faint{opacity:.62}
.txp .tx-hit{fill:rgba(0,0,0,0);stroke:none;pointer-events:all}
.txp .tx-xhit{fill:rgba(0,0,0,0);stroke:none;pointer-events:all}
.txp .tx-flag{fill:var(--tx-red);stroke:rgba(0,0,0,.7);stroke-width:.8}
.txp .tx-flag-text{fill:#fff;font-weight:800}
.txp .tx-ring-dim{fill:rgba(0,0,0,.2);pointer-events:none}
.txp .tx-mini{fill:none;stroke:var(--tx-orange);stroke-width:4;stroke-linecap:round;stroke-linejoin:round}
.txp .tx-mini-shadow{fill:none;stroke:rgba(0,0,0,.8);stroke-width:6.4;stroke-linecap:round;stroke-linejoin:round}
.txp .tx-window{fill:#050506;stroke:var(--tx-bezel-hi);stroke-width:.8}
.txp .tx-window-white{fill:var(--tx-mk);stroke:var(--tx-bezel-hi);stroke-width:.8}
.txp .tx-window-text{fill:var(--tx-mk);font-weight:700}
.txp .tx-window-ink{fill:#0b0b0c;font-weight:800}
.txp .tx-tube{fill:none;stroke:var(--tx-tube);stroke-linecap:round}
.txp .tx-ball{fill:#060607;stroke:rgba(255,255,255,.18);stroke-width:.6}
.txp .tx-tube-cage{fill:none;stroke:#060607}
.txp .tx-hi-plane{fill:none;stroke:var(--tx-orange);stroke-width:2.2;stroke-linejoin:round}
.txp .tx-cdi-needle{fill:none;stroke:var(--tx-mk);stroke-width:2.6;stroke-linecap:round}
.txp .tx-lubber{fill:none;stroke:var(--tx-mk);stroke-width:1.3}
.txp .tx-compass-card{fill:#050506}
.txp .tx-compass-shade1{fill:rgba(0,0,0,.3)}
.txp .tx-compass-shade2{fill:rgba(0,0,0,.6)}
.txp .tx-lcd{fill:var(--tx-lcd)}
.txp .tx-lcd-ink{fill:var(--tx-lcd-ink)}
.txp .tx-lcd-rule{stroke:var(--tx-lcd-ink);stroke-width:.6;opacity:.5;fill:none}

/* knobs, buttons, switches */
.txp .tx-knob{fill:var(--tx-knob);stroke:var(--tx-knob-hi);stroke-width:1.1}
.txp .tx-knob-red{fill:var(--tx-red-knob);stroke:rgba(0,0,0,.6);stroke-width:1.1}
.txp .tx-knob-cap{fill:none;stroke:var(--tx-knob-hi);stroke-width:.8;opacity:.7}
.txp .tx-knob-ridge{fill:none;stroke:var(--tx-knob-hi);stroke-width:1.5;opacity:.8}
.txp .tx-knob-notch{fill:none;stroke:rgba(0,0,0,.55);stroke-width:1.2}
.txp .tx-knob-mark{fill:none;stroke:var(--tx-mk);stroke-width:1.8;stroke-linecap:round}
.txp .tx-knob-text{fill:var(--tx-label);font-weight:700;opacity:.9}
.txp .tx-leader{fill:none;stroke:var(--tx-label);stroke-width:.7;opacity:.5}
.txp .tx-btn-body{fill:var(--tx-knob);stroke:var(--tx-knob-hi);stroke-width:.9}
.txp .tx-btn:hover .tx-btn-body{stroke:var(--tx-mk)}
.txp .tx-btn:active .tx-btn-body{fill:var(--tx-knob-hi)}
.txp .tx-btn-text{fill:var(--tx-label);font-weight:700}
.txp .tx-btn-glyph{fill:none;stroke:var(--tx-label);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.txp .tx-rk-well{fill:#060607;stroke:var(--tx-bezel-hi);stroke-width:.8}
.txp .tx-rk{fill:var(--tx-rocker)}
.txp .tx-rk-lo{fill:color-mix(in srgb,var(--tx-rocker) 46%,#000)}
.txp .tx-rk-red{fill:var(--tx-rocker-red)}
.txp .tx-rk-red-lo{fill:color-mix(in srgb,var(--tx-rocker-red) 50%,#000)}
.txp .tx-rk-on{fill:var(--tx-green);filter:brightness(1.25)}
.txp .tx-rk-off{fill:rgba(0,0,0,.28)}
.txp .tx-rk-edge{stroke:var(--tx-mk);opacity:.5;stroke-width:1;fill:none}
.txp .tx-lock{fill:#8d9097;stroke:#2a2b2e;stroke-width:1}
.txp .tx-lock-inner{fill:#5d6067;stroke:#2a2b2e;stroke-width:.8}
.txp .tx-key{fill:#c9ccd2;stroke:#2a2b2e;stroke-width:.9}
.txp .tx-key-hole{fill:#2a2b2e}
.txp .tx-key-line{stroke:#2a2b2e;stroke-width:1.4;fill:none}
.txp .tx-lock,.txp .tx-lock-inner,.txp .tx-key{filter:brightness(var(--tx-dim,1))}
.txp .tx-warn-text{fill:var(--tx-red);font-weight:800}
.txp .tx-collar{fill:#8d9097;stroke:#2a2b2e;stroke-width:.8;filter:brightness(var(--tx-dim,1))}
.txp .tx-shaft{fill:#b9bcc3;filter:brightness(var(--tx-dim,1))}
.txp .tx-slot{fill:#050506;stroke:var(--tx-bezel-hi);stroke-width:.8}
.txp .tx-flap-handle{fill:var(--tx-rocker);stroke:rgba(0,0,0,.6);stroke-width:.8}
.txp .tx-flap-grip{stroke:rgba(0,0,0,.35);stroke-width:1.2;fill:none}
.txp .tx-wheel{fill:var(--tx-knob);stroke:var(--tx-knob-hi);stroke-width:.9}
.txp .tx-wheel-ridge{stroke:var(--tx-knob-hi);stroke-width:2.2;fill:none}
.txp .tx-wheel-shade{fill:none;stroke:rgba(0,0,0,.5);stroke-width:1.2;pointer-events:none}
.txp .tx-plate{fill:var(--tx-bezel);stroke:var(--tx-bezel-hi);stroke-width:1}
.txp .tx-fuel-handle{fill:var(--tx-red-knob);stroke:rgba(0,0,0,.65);stroke-width:1}

/* radios: self-lit displays do not depend on the panel lights */
.txp .tx-radio{fill:#131417;stroke:var(--tx-bezel-hi);stroke-width:1}
.txp .tx-display{fill:var(--tx-led-bg);stroke:#000;stroke-width:1}
.txp .tx-display-rule{stroke:rgba(255,125,31,.22);stroke-width:.8;fill:none}
.txp .tx-seg line{stroke:var(--tx-led);stroke-linecap:round}
.txp .tx-seg circle{fill:var(--tx-led)}
.txp text.tx-led{fill:var(--tx-led)}
.txp .tx-led-dot{fill:#5dff7a}
.txp .tx-digit-arrow{fill:var(--tx-label);opacity:.4}
.txp .tx-mode[data-on="sel"] .tx-btn-body{stroke:var(--tx-mk);stroke-width:1.4}
.txp .tx-mode[data-on="lit"] .tx-btn-body{fill:#3b2208;stroke:var(--tx-led);stroke-width:1.4}
.txp .tx-mode[data-on="lit"] .tx-btn-text{fill:var(--tx-led)}
.txp .tx-ann rect{fill:#1a0c0b;stroke:#000;stroke-width:.8}
.txp .tx-ann text{fill:#5b2f2b;font-weight:800}
.txp .tx-ann.amber rect{fill:#1a1408}
.txp .tx-ann.amber text{fill:#5a4a22}
.txp .tx-ann.on rect{fill:#e3271b;stroke:#ff8f85}
.txp .tx-ann.on text{fill:#fff}
.txp .tx-ann.amber.on rect{fill:#f0a81c;stroke:#ffe3a1}
.txp .tx-ann.amber.on text{fill:#1c1200}

/* explain mode: everything becomes a "what is this?" target */
.txp[data-explain="1"] [data-instrument]{cursor:help}
.txp[data-explain="1"] [data-instrument] .tx-ctl{cursor:help}
.txp[data-explain="1"] svg[data-instrument]{outline:1.5px dashed rgba(124,196,255,.55);outline-offset:-2px;border-radius:calc(var(--u) * 8)}
.txp[data-explain="1"] svg[data-instrument]:hover{outline:2.5px solid #7cc4ff;background:rgba(124,196,255,.10)}
.txp[data-explain="1"] g[data-instrument] .tx-xhit{stroke:rgba(124,196,255,.55);stroke-width:.8;stroke-dasharray:3 2}
.txp[data-explain="1"] g[data-instrument]:hover .tx-xhit{stroke:#7cc4ff;stroke-width:1.6;stroke-dasharray:none;fill:rgba(124,196,255,.10)}
`;
