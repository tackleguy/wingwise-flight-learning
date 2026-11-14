import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  BookOpen,
  CloudLightning,
  CloudSun,
  Cloudy,
  Eye,
  Gauge,
  Snowflake,
  Waves,
  Wind,
  Brain,
  FileText,
} from "lucide-react";

import { Notice, Page, PageHeader } from "@/components/app/page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  MetarDecoder,
  PirepDecoder,
  TafDecoder,
  WindsAloftDecoder,
} from "@/components/weather/decoders";
import { DecisionTrainer } from "@/components/weather/decision-trainer";
import {
  CloudsRef,
  FrontsRef,
  IcingRef,
  PressureRef,
  ThunderstormRef,
  TurbulenceRef,
  VisCeilRef,
} from "@/components/weather/reference";

export const Route = createFileRoute("/weather")({
  head: () => ({
    meta: [
      { title: "Weather Lab — TeachX" },
      {
        name: "description",
        content:
          "Decode METARs, TAFs, PIREPs and winds aloft in plain English, study aviation weather theory, and practice go/no-go decisions with graded scenarios. Sample weather is educational, not live.",
      },
    ],
  }),
  component: WeatherLab,
});

function TheoryBlock({
  title,
  icon: Icon,
  intro,
  children,
}: {
  title: string;
  icon: typeof Cloudy;
  intro: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="flex items-center gap-2 font-semibold">
        <Icon className="size-4 text-primary" /> {title}
      </h3>
      <p className="mt-1 mb-4 max-w-3xl text-sm text-muted-foreground">{intro}</p>
      {children}
    </section>
  );
}

/** Underlined secondary switcher used inside a tab (keeps the top-level tab row short). */
function SubNav<K extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: readonly (readonly [K, string])[];
  value: K;
  onChange: (k: K) => void;
  label: string;
}) {
  return (
    <div
      className="mb-4 flex gap-x-4 overflow-x-auto border-b text-sm whitespace-nowrap"
      role="group"
      aria-label={label}
    >
      {items.map(([k, l]) => (
        <button
          key={k}
          type="button"
          aria-pressed={value === k}
          onClick={() => onChange(k)}
          className={cn(
            "-mb-px border-b-2 px-0.5 pb-2 font-medium",
            value === k
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

const DECODERS = [
  ["metar", "METAR"],
  ["taf", "TAF"],
  ["pirep", "PIREP"],
  ["fb", "Winds aloft"],
] as const;
type DecoderKey = (typeof DECODERS)[number][0];

const TOPICS = [
  ["fronts", "Fronts"],
  ["pressure", "Pressure systems"],
  ["clouds", "Clouds"],
  ["viscig", "Visibility & ceiling"],
  ["icing", "Icing"],
  ["turbulence", "Turbulence"],
  ["thunderstorms", "Thunderstorms"],
] as const;
type TopicKey = (typeof TOPICS)[number][0];

function WeatherLab() {
  const [decoder, setDecoder] = useState<DecoderKey>("metar");
  const [topic, setTopic] = useState<TopicKey>("fronts");
  return (
    <Page wide>
      <PageHeader
        eyebrow="Train"
        icon={CloudSun}
        title="Weather Lab"
        description="Decode aviation weather, learn the theory, and practice go / no-go decisions."
      />
      <Notice tone="caution" title="Educational weather only." className="mb-4">
        Sample reports and scenarios on this page are written for training and are not live weather.
        Every METAR, TAF, PIREP and advisory in the decision scenarios is invented for teaching.
        Decoders work on any report you paste, but TeachX does not fetch real observations. For real
        flights, obtain an official briefing (1800wxbrief.com, aviationweather.gov or another
        FAA-approved source).
      </Notice>

      <Tabs defaultValue="decode">
        <div className="overflow-x-auto">
          <TabsList className="mb-4">
            <TabsTrigger value="decode">
              <FileText className="size-4" /> Decode
            </TabsTrigger>
            <TabsTrigger value="theory">
              <BookOpen className="size-4" /> Theory
            </TabsTrigger>
            <TabsTrigger value="decisions">
              <Brain className="size-4" /> Go / no-go
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="decode" className="animate-fade-up">
          <SubNav items={DECODERS} value={decoder} onChange={setDecoder} label="Report type" />
          {decoder === "metar" ? <MetarDecoder /> : null}
          {decoder === "taf" ? <TafDecoder /> : null}
          {decoder === "pirep" ? <PirepDecoder /> : null}
          {decoder === "fb" ? <WindsAloftDecoder /> : null}
        </TabsContent>
        <TabsContent value="theory" className="animate-fade-up">
          <SubNav items={TOPICS} value={topic} onChange={setTopic} label="Weather theory topics" />
          {topic === "fronts" ? (
            <TheoryBlock
              title="Fronts"
              icon={Waves}
              intro="A front is the boundary between air masses of different temperature and moisture. Most significant weather in the mid-latitudes occurs along fronts."
            >
              <FrontsRef />
            </TheoryBlock>
          ) : null}
          {topic === "pressure" ? (
            <TheoryBlock
              title="Pressure systems"
              icon={Gauge}
              intro="Air flows from high to low pressure, deflected by the Coriolis force. Pressure also drives the most important altimeter error."
            >
              <PressureRef />
            </TheoryBlock>
          ) : null}
          {topic === "clouds" ? (
            <TheoryBlock
              title="Clouds"
              icon={Cloudy}
              intro="Clouds form when air is cooled to its dew point — usually by lifting. Their shape tells you about the stability of the air."
            >
              <CloudsRef />
            </TheoryBlock>
          ) : null}
          {topic === "viscig" ? (
            <TheoryBlock
              title="Visibility & ceiling"
              icon={Eye}
              intro="Ceiling and visibility determine the flight category and whether VFR flight is legal in a given class of airspace."
            >
              <VisCeilRef />
            </TheoryBlock>
          ) : null}
          {topic === "icing" ? (
            <TheoryBlock
              title="Structural icing"
              icon={Snowflake}
              intro="Structural icing needs two things: visible moisture and an airframe temperature at or below freezing. It adds weight and drag and destroys lift."
            >
              <IcingRef />
            </TheoryBlock>
          ) : null}
          {topic === "turbulence" ? (
            <TheoryBlock
              title="Turbulence"
              icon={Wind}
              intro="Turbulence is reported by intensity using the AIM 7-1-21 criteria. Slow to the turbulence penetration speed and keep the wings level."
            >
              <TurbulenceRef />
            </TheoryBlock>
          ) : null}
          {topic === "thunderstorms" ? (
            <TheoryBlock
              title="Thunderstorms & convective weather"
              icon={CloudLightning}
              intro="A thunderstorm packs nearly every weather hazard to aviation into one cloud. The only safe strategy is avoidance."
            >
              <ThunderstormRef />
            </TheoryBlock>
          ) : null}
          <p className="mt-6 text-xs text-muted-foreground">
            Sources: FAA-H-8083-28, PHAK Ch. 12–13, AIM Ch. 7. Full lessons in{" "}
            <Link to="/vfr" className="text-primary hover:underline">
              VFR ground school
            </Link>
            .
          </p>
        </TabsContent>
        <TabsContent value="decisions" className="animate-fade-up">
          <DecisionTrainer />
        </TabsContent>
      </Tabs>
    </Page>
  );
}
