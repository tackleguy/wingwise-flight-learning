/**
 * RadioPanel — a reusable, realistic dual COM radio for simulated ATC training.
 *
 *   const [radio, setRadio] = useState(() => makeRadioState(121.6, 118.3));
 *   <RadioPanel
 *     value={radio}
 *     onChange={setRadio}
 *     directory={[{ mhz: 121.6, name: "Palo Alto Ground" }]}
 *     expected={{ name: "Palo Alto Ground", mhz: 125.0 }}
 *     receiving={{ station: "Palo Alto Ground" }}
 *     onPttStart={(at) => ...}
 *     onTransmit={(text, meta) => ...}
 *     micEnabled
 *   />
 *
 * Features: COM1/COM2 active (green) & standby (cyan), flip-flop, dual concentric tuning knobs
 * (click the ± buttons, drag vertically, scroll, or focus + arrow keys / Shift+arrows), direct
 * frequency entry (click STBY), 25 kHz (US) / 8.33 kHz channel spacing, MIC select, COM2
 * monitor, volume knob, push-to-talk (hold SPACE or press-and-hold; with a microphone it uses
 * browser speech recognition while held) and an always-available typed transmission field.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeftRight,
  Keyboard,
  Mic,
  MicOff,
  Minus,
  Plus,
  Radio,
  Send,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatCom,
  freqEquals,
  parseFreqInput,
  stepCoarse,
  stepFine,
  validateComInput,
  type ChannelSpacing,
} from "@/lib/atc/frequency";
import { createRecognizer, useSpeechSupport, type Recognizer } from "@/lib/atc/speech";

export interface ComState {
  /** MHz */
  active: number;
  /** MHz */
  standby: number;
}

export interface RadioState {
  com1: ComState;
  com2: ComState;
  /** Which COM the microphone transmits on. */
  tx: 1 | 2;
  /** Listen to COM2 as well (COM1 is always heard when selected). */
  monitor2: boolean;
  /** 0..1 — use it as the controller voice volume. */
  volume: number;
  spacing: ChannelSpacing;
}

export interface RadioDirectoryEntry {
  mhz: number;
  name: string;
  station?: string;
  simulated?: boolean;
}

export interface TransmitMeta {
  via: "voice" | "text";
  /** Epoch ms the PTT was pressed (or the text was sent). */
  pttStartedAt: number;
  endedAt: number;
  com: 1 | 2;
  /** Frequency transmitted on (active frequency of the selected COM). */
  mhz: number;
}

export interface RadioPanelProps {
  value: RadioState;
  onChange: (next: RadioState) => void;
  /** Known stations for labels and the quick-load frequency list. */
  directory?: RadioDirectoryEntry[];
  /** Controller you are expected to talk to now (shown as "Current controller"). */
  expected?: { name: string; mhz: number } | null;
  /** Someone is transmitting (lights RX). */
  receiving?: { station: string } | null;
  onPttStart?: (at: number) => void;
  onTransmit?: (text: string, meta: TransmitMeta) => void;
  /** Use speech recognition while PTT is held (when the browser supports it). */
  micEnabled?: boolean;
  disabled?: boolean;
  /** Controlled draft for the typed transmission (optional). */
  draft?: string;
  onDraftChange?: (v: string) => void;
  composerPlaceholder?: string;
  /** Hold SPACE for push-to-talk (ignored while typing in a field). Default true. */
  spacebarPtt?: boolean;
  /** Extra controls rendered next to the transmit field (e.g. "Say it for me"). */
  composerActions?: ReactNode;
  className?: string;
}

export const DEFAULT_RADIO_STATE: RadioState = {
  com1: { active: 121.5, standby: 118.0 },
  com2: { active: 121.5, standby: 118.0 },
  tx: 1,
  monitor2: false,
  volume: 0.85,
  spacing: 25,
};

export function makeRadioState(
  active: number,
  standby: number,
  patch: Partial<RadioState> = {},
): RadioState {
  return {
    ...DEFAULT_RADIO_STATE,
    com1: { active, standby },
    com2: { active: 121.5, standby: 118.0 },
    ...patch,
  };
}

/** Frequency the pilot is transmitting on. */
export function transmitFrequency(r: RadioState): number {
  return r.tx === 1 ? r.com1.active : r.com2.active;
}

/** True if the radio is listening to `mhz` (selected COM, or COM2 monitored). */
export function isListening(r: RadioState, mhz: number): boolean {
  const sel = r.tx === 1 ? r.com1.active : r.com2.active;
  if (freqEquals(sel, mhz)) return true;
  if (r.tx === 1 && r.monitor2 && freqEquals(r.com2.active, mhz)) return true;
  if (r.tx === 2 && freqEquals(r.com1.active, mhz)) return true;
  return false;
}

// ---------------------------------------------------------------------------

function isEditableTarget(t: EventTarget | null) {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
}

function lookup(directory: RadioDirectoryEntry[] | undefined, mhz: number) {
  return directory?.find((d) => freqEquals(d.mhz, mhz));
}

/** Concentric dual knob: outer ring = MHz, inner = kHz. */
function DualKnob({
  label,
  onStep,
  disabled,
}: {
  label: string;
  onStep: (ring: "outer" | "inner", dir: number) => void;
  disabled?: boolean | undefined;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [angles, setAngles] = useState({ outer: 0, inner: 0 });
  const drag = useRef<{ ring: "outer" | "inner"; y: number; acc: number } | null>(null);

  const step = useCallback(
    (ring: "outer" | "inner", dir: number) => {
      if (disabled) return;
      onStep(ring, dir);
      setAngles((a) => ({ ...a, [ring]: a[ring] + dir * (ring === "outer" ? 15 : 20) }));
    },
    [onStep, disabled],
  );

  const ringAt = (clientX: number, clientY: number): "outer" | "inner" => {
    const el = ref.current;
    if (!el) return "inner";
    const r = el.getBoundingClientRect();
    const dx = clientX - (r.left + r.width / 2);
    const dy = clientY - (r.top + r.height / 2);
    return Math.hypot(dx, dy) > r.width * 0.3 ? "outer" : "inner";
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      step(ringAt(e.clientX, e.clientY), e.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [step]);

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        ref={ref}
        role="group"
        tabIndex={disabled ? -1 : 0}
        aria-label={`${label} tuning knob. Arrow up or down tunes kHz; Shift plus arrow tunes MHz.`}
        title="Drag up/down or scroll · outer ring = MHz, inner = kHz · keyboard: ↑/↓ kHz, Shift+↑/↓ MHz"
        className={cn(
          "relative size-14 shrink-0 cursor-ns-resize touch-none rounded-full outline-none select-none focus-visible:ring-2 focus-visible:ring-cyan",
          disabled && "pointer-events-none opacity-40",
        )}
        onKeyDown={(e) => {
          const dir =
            e.key === "ArrowUp" || e.key === "ArrowRight" || e.key === "PageUp"
              ? 1
              : e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "PageDown"
                ? -1
                : 0;
          if (!dir) return;
          e.preventDefault();
          step(e.shiftKey || e.key.startsWith("Page") ? "outer" : "inner", dir);
        }}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { ring: ringAt(e.clientX, e.clientY), y: e.clientY, acc: 0 };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          d.acc += d.y - e.clientY;
          d.y = e.clientY;
          while (Math.abs(d.acc) >= 12) {
            const dir = d.acc > 0 ? 1 : -1;
            step(d.ring, dir);
            d.acc -= dir * 12;
          }
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <svg viewBox="0 0 56 56" className="size-full">
          <defs>
            <radialGradient id="knob-o" cx="40%" cy="35%">
              <stop offset="0%" stopColor="oklch(0.42 0.01 258)" />
              <stop offset="100%" stopColor="oklch(0.18 0.01 258)" />
            </radialGradient>
            <radialGradient id="knob-i" cx="40%" cy="35%">
              <stop offset="0%" stopColor="oklch(0.5 0.01 258)" />
              <stop offset="100%" stopColor="oklch(0.24 0.01 258)" />
            </radialGradient>
          </defs>
          <g transform={`rotate(${angles.outer} 28 28)`}>
            <circle cx="28" cy="28" r="27" fill="url(#knob-o)" stroke="oklch(0.1 0 0)" />
            {Array.from({ length: 24 }, (_, i) => (
              <line
                key={i}
                x1="28"
                y1="2.5"
                x2="28"
                y2="6.5"
                stroke="oklch(0.55 0.01 258)"
                strokeWidth="1.2"
                transform={`rotate(${i * 15} 28 28)`}
              />
            ))}
          </g>
          <g transform={`rotate(${angles.inner} 28 28)`}>
            <circle cx="28" cy="28" r="15" fill="url(#knob-i)" stroke="oklch(0.1 0 0)" />
            <line
              x1="28"
              y1="15"
              x2="28"
              y2="21"
              stroke="var(--cyan)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>
        </svg>
      </div>
      <div className="grid grid-cols-2 gap-x-1 gap-y-0.5 text-[9px] font-semibold tracking-wide text-muted-foreground uppercase">
        <span className="text-center">MHz</span>
        <span className="text-center">kHz</span>
        <div className="flex gap-0.5">
          <KnobBtn
            label={`${label} MHz down`}
            onClick={() => step("outer", -1)}
            disabled={disabled}
            icon={Minus}
          />
          <KnobBtn
            label={`${label} MHz up`}
            onClick={() => step("outer", 1)}
            disabled={disabled}
            icon={Plus}
          />
        </div>
        <div className="flex gap-0.5">
          <KnobBtn
            label={`${label} kHz down`}
            onClick={() => step("inner", -1)}
            disabled={disabled}
            icon={Minus}
          />
          <KnobBtn
            label={`${label} kHz up`}
            onClick={() => step("inner", 1)}
            disabled={disabled}
            icon={Plus}
          />
        </div>
      </div>
    </div>
  );
}

function KnobBtn({
  label,
  onClick,
  disabled,
  icon: Icon,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean | undefined;
  icon: typeof Plus;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-5 items-center justify-center rounded border border-border bg-muted/60 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
    >
      <Icon className="size-3" />
    </button>
  );
}

function VolumeKnob({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number } | null>(null);
  const set = useCallback(
    (v: number) => onChange(Math.max(0, Math.min(1, Math.round(v * 20) / 20))),
    [onChange],
  );
  const valRef = useRef(value);
  valRef.current = value;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      set(valRef.current + (e.deltaY < 0 ? 0.05 : -0.05));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [set]);
  const angle = -135 + value * 270;
  return (
    <div className="flex items-center gap-2">
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label="Radio volume"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        className="size-9 cursor-ns-resize touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-cyan"
        onKeyDown={(e) => {
          const dir =
            e.key === "ArrowUp" || e.key === "ArrowRight"
              ? 1
              : e.key === "ArrowDown" || e.key === "ArrowLeft"
                ? -1
                : 0;
          if (!dir) return;
          e.preventDefault();
          set(value + dir * 0.05);
        }}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const dy = drag.current.y - e.clientY;
          if (Math.abs(dy) >= 6) {
            set(valRef.current + (dy > 0 ? 0.05 : -0.05));
            drag.current.y = e.clientY;
          }
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <svg viewBox="0 0 36 36" className="size-full">
          <circle cx="18" cy="18" r="17" fill="oklch(0.22 0.01 258)" stroke="oklch(0.1 0 0)" />
          <line
            x1="18"
            y1="5"
            x2="18"
            y2="11"
            stroke="var(--ok)"
            strokeWidth="2.2"
            strokeLinecap="round"
            transform={`rotate(${angle} 18 18)`}
          />
        </svg>
      </div>
      <div className="leading-tight">
        <div className="label-caps !text-[9px]">Vol</div>
        <div className="font-mono text-xs tabular">{Math.round(value * 100)}</div>
      </div>
    </div>
  );
}

function FreqEntry({
  value,
  spacing,
  onCommit,
  onCancel,
}: {
  value: number;
  spacing: ChannelSpacing;
  onCommit: (mhz: number) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(formatCom(value));
  const [err, setErr] = useState<string | null>(null);
  const commit = () => {
    const v = parseFreqInput(text);
    const e = v === null ? "Enter a frequency like 121.600" : validateComInput(v, spacing);
    if (e || v === null) return setErr(e);
    onCommit(v);
  };
  return (
    <div className="relative">
      <input
        autoFocus
        value={text}
        inputMode="decimal"
        aria-label="Enter standby frequency"
        onChange={(e) => (setText(e.target.value), setErr(null))}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") onCancel();
        }}
        onBlur={commit}
        className="w-[7.2rem] rounded border border-cyan/60 bg-black/60 px-1.5 py-0.5 font-mono text-lg text-cyan outline-none"
      />
      {err ? (
        <div className="absolute top-full left-0 z-10 mt-1 w-56 rounded border border-warning/40 bg-panel px-2 py-1 text-[11px] text-warning">
          {err}
        </div>
      ) : null}
    </div>
  );
}

function ComRow({
  n,
  com,
  radio,
  directory,
  receiving,
  txActive,
  onChange,
  disabled,
}: {
  n: 1 | 2;
  com: ComState;
  radio: RadioState;
  directory: RadioDirectoryEntry[] | undefined;
  receiving: boolean;
  txActive: boolean;
  onChange: (c: ComState) => void;
  disabled?: boolean | undefined;
}) {
  const [editing, setEditing] = useState(false);
  const activeName = lookup(directory, com.active)?.name;
  const stbyName = lookup(directory, com.standby)?.name;
  const selected = radio.tx === n;
  return (
    <div
      className={cn(
        "rounded-md border px-2.5 py-2 transition-colors sm:px-3",
        selected ? "border-ok/30 bg-ok/[0.03]" : "border-transparent bg-muted/20",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex w-12 flex-col items-start gap-1">
          <span className="font-mono text-xs font-bold text-foreground">COM{n}</span>
          <div className="flex gap-1">
            <span
              className={cn(
                "rounded px-1 text-[9px] font-bold",
                txActive && selected
                  ? "bg-warning text-white"
                  : "bg-muted text-muted-foreground/60",
              )}
            >
              TX
            </span>
            <span
              className={cn(
                "rounded px-1 text-[9px] font-bold",
                receiving ? "bg-ok text-black" : "bg-muted text-muted-foreground/60",
              )}
            >
              RX
            </span>
          </div>
        </div>
        <div className="min-w-[7.5rem]">
          <div className="label-caps !text-[9px]">Active</div>
          <div
            className="font-mono text-xl font-semibold tracking-tight text-ok tabular sm:text-2xl"
            aria-label={`COM${n} active ${formatCom(com.active)}`}
          >
            {formatCom(com.active)}
          </div>
          <div className="h-4 truncate text-[10px] text-muted-foreground" title={activeName}>
            {activeName ?? "—"}
          </div>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange({ active: com.standby, standby: com.active })}
          aria-label={`COM${n} flip-flop: swap active and standby`}
          className="flex h-9 w-11 items-center justify-center rounded-md border border-border bg-muted text-foreground hover:bg-accent disabled:opacity-40"
        >
          <ArrowLeftRight className="size-4" />
        </button>
        <div className="min-w-[7.5rem]">
          <div className="label-caps !text-[9px]">Standby</div>
          {editing ? (
            <FreqEntry
              value={com.standby}
              spacing={radio.spacing}
              onCommit={(v) => {
                onChange({ ...com, standby: v });
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setEditing(true)}
              title="Click to type a frequency"
              className="font-mono text-xl font-semibold tracking-tight text-cyan tabular hover:underline hover:decoration-dotted sm:text-2xl"
              aria-label={`COM${n} standby ${formatCom(com.standby)} — click to enter a frequency`}
            >
              {formatCom(com.standby)}
            </button>
          )}
          <div className="h-4 truncate text-[10px] text-muted-foreground" title={stbyName}>
            {stbyName ?? "—"}
          </div>
        </div>
        <div className="ml-auto">
          <DualKnob
            label={`COM${n}`}
            disabled={disabled}
            onStep={(ring, dir) =>
              onChange({
                ...com,
                standby:
                  ring === "outer"
                    ? stepCoarse(com.standby, dir)
                    : stepFine(com.standby, dir, radio.spacing),
              })
            }
          />
        </div>
      </div>
    </div>
  );
}

export function RadioPanel({
  value,
  onChange,
  directory,
  expected,
  receiving,
  onPttStart,
  onTransmit,
  micEnabled = true,
  disabled,
  draft: draftProp,
  onDraftChange,
  composerPlaceholder,
  spacebarPtt = true,
  composerActions,
  className,
}: RadioPanelProps) {
  const support = useSpeechSupport();
  const [innerDraft, setInnerDraft] = useState("");
  const draft = draftProp ?? innerDraft;
  const setDraft = useCallback(
    (v: string) => (onDraftChange ? onDraftChange(v) : setInnerDraft(v)),
    [onDraftChange],
  );
  const [txActive, setTxActive] = useState(false);
  const [partial, setPartial] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const pttAt = useRef(0);
  const listening = useRef(false);
  const recognizer = useRef<Recognizer | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const useVoice = micEnabled && support.stt;

  const emit = useCallback(
    (text: string, via: "voice" | "text", startedAt: number) => {
      const v = valueRef.current;
      const mhz = v.tx === 1 ? v.com1.active : v.com2.active;
      onTransmit?.(text, { via, pttStartedAt: startedAt, endedAt: Date.now(), com: v.tx, mhz });
    },
    [onTransmit],
  );

  const emitRef = useRef(emit);
  emitRef.current = emit;

  const pttDown = useCallback(() => {
    if (disabled || txActive) return;
    const at = Date.now();
    pttAt.current = at;
    setTxActive(true);
    setNotice(null);
    onPttStart?.(at);
    if (useVoice) {
      if (!recognizer.current) {
        recognizer.current = createRecognizer({
          onPartial: (t) => setPartial(t),
          onFinal: (t) => {
            listening.current = false;
            setPartial("");
            if (t.trim()) emitRef.current(t.trim(), "voice", pttAt.current);
            else setNotice("Didn't catch that — hold PTT while you speak, or type the call.");
          },
          onError: (m) => {
            listening.current = false;
            setNotice(m);
          },
        });
      }
      listening.current = true;
      setPartial("");
      recognizer.current?.start();
    }
  }, [disabled, txActive, onPttStart, useVoice]);

  const pttUp = useCallback(() => {
    if (!txActive) return;
    setTxActive(false);
    if (listening.current && recognizer.current) {
      recognizer.current.stop();
      return;
    }
    const text = draftRef.current.trim();
    if (text) {
      emit(text, "text", pttAt.current);
      setDraft("");
    } else if (!useVoice) {
      setNotice(
        micEnabled && !support.stt
          ? "Voice input isn't available in this browser — type your call, then press PTT or Enter."
          : "Type your transmission first, then press PTT or Enter.",
      );
    }
  }, [txActive, emit, setDraft, useVoice, micEnabled, support.stt]);

  // Space bar push-to-talk.
  useEffect(() => {
    if (!spacebarPtt) return;
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || isEditableTarget(e.target)) return;
      e.preventDefault();
      pttDown();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isEditableTarget(e.target)) return;
      e.preventDefault();
      pttUp();
    };
    const blur = () => pttUp();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [spacebarPtt, pttDown, pttUp]);

  useEffect(() => () => recognizer.current?.abort(), []);

  const sendTyped = () => {
    const text = draft.trim();
    if (!text || disabled) return;
    const at = Date.now();
    onPttStart?.(at);
    emit(text, "text", at);
    setDraft("");
  };

  const txMhz = value.tx === 1 ? value.com1.active : value.com2.active;
  const onExpected = expected ? freqEquals(txMhz, expected.mhz) : null;
  const rxOn = (n: 1 | 2) => !!receiving && (n === value.tx || (n === 2 && value.monitor2));

  const directorySorted = useMemo(() => directory ?? [], [directory]);

  return (
    <div className={cn("avionics-screen p-3 sm:p-4", className)}>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex items-center gap-2">
          <Radio className="size-4 text-ok" />
          <span className="label-caps !text-foreground/80">COM radio</span>
          <span className="text-[10px] text-muted-foreground">simulated</span>
        </div>
        {expected ? (
          <div className="min-w-0 truncate text-xs" title="Current controller">
            <span className="text-muted-foreground">Talking to </span>
            <span className="font-semibold">{expected.name}</span>{" "}
            <span className={cn("font-mono", onExpected ? "text-ok" : "text-caution")}>
              {formatCom(expected.mhz)}
            </span>
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <ComRow
          n={1}
          com={value.com1}
          radio={value}
          directory={directory}
          receiving={rxOn(1)}
          txActive={txActive}
          disabled={disabled}
          onChange={(c) => onChange({ ...value, com1: c })}
        />
        <ComRow
          n={2}
          com={value.com2}
          radio={value}
          directory={directory}
          receiving={rxOn(2)}
          txActive={txActive}
          disabled={disabled}
          onChange={(c) => onChange({ ...value, com2: c })}
        />
      </div>

      {directorySorted.length ? (
        <div
          className="mt-2.5 flex flex-wrap gap-1.5"
          aria-label={`Frequency list — tap to load COM${value.tx} standby`}
        >
          {directorySorted.map((d) => (
            <button
              key={`${d.name}-${d.mhz}`}
              type="button"
              disabled={disabled}
              onClick={() =>
                onChange(
                  value.tx === 1
                    ? { ...value, com1: { ...value.com1, standby: d.mhz } }
                    : { ...value, com2: { ...value.com2, standby: d.mhz } },
                )
              }
              className="rounded px-1.5 py-0.5 text-left text-[11px] leading-tight hover:bg-cyan/10"
              title={`Load into COM${value.tx} standby${d.simulated ? " (simulated training frequency)" : ""}`}
            >
              <span className="text-muted-foreground">{d.name}</span>{" "}
              <span className="font-mono text-cyan">{formatCom(d.mhz)}</span>
              {d.simulated ? <span className="ml-1 text-[9px] text-caution">SIM</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      {onTransmit ? (
        <div className="mt-3 border-t border-border/60 pt-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <button
              type="button"
              disabled={disabled}
              onPointerDown={(e) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                pttDown();
              }}
              onPointerUp={() => pttUp()}
              onPointerCancel={() => pttUp()}
              onContextMenu={(e) => e.preventDefault()}
              aria-label={
                useVoice
                  ? "Push to talk — hold while speaking"
                  : "Push to talk — sends the typed transmission"
              }
              className={cn(
                "flex min-h-12 shrink-0 touch-none items-center justify-center gap-2 rounded-md border px-4 font-semibold tracking-wide uppercase select-none sm:w-36",
                txActive
                  ? "border-warning bg-warning text-white shadow-[0_0_18px_-2px] shadow-warning/60"
                  : "border-warning/50 bg-warning/10 text-warning hover:bg-warning/20",
                disabled && "opacity-40",
              )}
            >
              {useVoice ? <Mic className="size-4" /> : <Keyboard className="size-4" />}
              <span className="text-xs">
                {txActive ? (useVoice ? "Transmitting…" : "Release to send") : "PTT"}
              </span>
            </button>
            <div className="flex min-w-0 flex-1 gap-2">
              <input
                value={txActive && useVoice ? partial : draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendTyped();
                  }
                }}
                disabled={disabled}
                placeholder={
                  composerPlaceholder ??
                  (useVoice ? "Hold SPACE to speak, or type your call" : "Type your radio call")
                }
                aria-label="Transmission text"
                className="h-12 min-w-0 flex-1 rounded-md border border-input bg-black/40 px-3 font-mono text-sm outline-none placeholder:font-sans placeholder:text-muted-foreground/70 focus:border-primary"
              />
              <button
                type="button"
                onClick={sendTyped}
                disabled={disabled || !draft.trim()}
                aria-label="Transmit typed call"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              >
                <Send className="size-4" />
              </button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span
              className="flex min-w-0 items-center gap-1.5"
              title={
                micEnabled
                  ? support.stt
                    ? "Hold SPACE or the PTT button while speaking."
                    : "Voice input is not supported in this browser — typed transmissions work everywhere."
                  : "Microphone is off (Settings → Voice). Type your transmissions."
              }
            >
              {micEnabled ? (
                support.stt ? (
                  <Mic className="size-3 text-ok" />
                ) : (
                  <MicOff className="size-3 text-caution" />
                )
              ) : (
                <MicOff className="size-3" />
              )}
              <span className="truncate">
                {micEnabled
                  ? support.stt
                    ? "Voice on"
                    : "No voice input — type calls"
                  : "Mic off — type calls"}
                {" · "}TX COM{value.tx} <span className="font-mono">{formatCom(txMhz)}</span>
              </span>
            </span>
            <span className="flex items-center gap-2">
              {composerActions}
              <button
                type="button"
                onClick={() => setShowOptions((o) => !o)}
                aria-expanded={showOptions}
                className={cn(
                  "inline-flex items-center gap-1 rounded px-1.5 py-1 hover:text-foreground",
                  showOptions && "text-foreground",
                )}
              >
                <SlidersHorizontal className="size-3" /> Radio options
              </button>
            </span>
          </div>
          {notice ? (
            <div className="mt-2 rounded border border-caution/30 bg-caution/5 px-2 py-1 text-[11px] text-caution">
              {notice}
            </div>
          ) : null}
        </div>
      ) : null}

      {showOptions || !onTransmit ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 pt-3">
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Microphone select">
            {([1, 2] as const).map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={value.tx === n}
                onClick={() => onChange({ ...value, tx: n })}
                className={cn(
                  "rounded border px-2 py-1 font-mono text-[10px] font-bold",
                  value.tx === n
                    ? "border-ok/50 bg-ok/15 text-ok"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                MIC {n}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={value.monitor2}
              onClick={() => onChange({ ...value, monitor2: !value.monitor2 })}
              className={cn(
                "ml-1 rounded border px-2 py-1 font-mono text-[10px] font-bold",
                value.monitor2
                  ? "border-cyan/50 bg-cyan/15 text-cyan"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
              title="Monitor COM2 while transmitting on COM1"
            >
              MON 2
            </button>
          </div>
          <VolumeKnob value={value.volume} onChange={(v) => onChange({ ...value, volume: v })} />
          <div
            className="flex items-center gap-1 rounded-md border border-border p-0.5"
            role="radiogroup"
            aria-label="Channel spacing"
          >
            {([25, 8.33] as ChannelSpacing[]).map((sp) => (
              <button
                key={sp}
                type="button"
                role="radio"
                aria-checked={value.spacing === sp}
                onClick={() => onChange({ ...value, spacing: sp })}
                className={cn(
                  "rounded px-2 py-0.5 text-[10px] font-semibold",
                  value.spacing === sp
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {sp === 25 ? "25 kHz (US)" : "8.33 kHz"}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default RadioPanel;
