import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  BookOpen,
  CloudLightning,
  CloudSun,
  Cloudy,
  Eye,
  Gauge,
  MessageSquareWarning,
  Snowflake,
  Waves,
  Wind,
  Brain,
  FileText,
  ClipboardList,
} from "lucide-react";

import { Notice, Page, PageHeader } from "@/components/app/page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  id,
  title,
  icon: Icon,
  intro,
  children,
}: {
  id: string;
  title: string;
  icon: typeof Cloudy;
  intro: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="panel scroll-mt-4 p-4">
      <h3 className="flex items-center gap-2 font-semibold">
        <Icon className="size-4 text-primary" /> {title}
      </h3>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">{intro}</p>
      {children}
    </section>
  );
}

function WeatherLab() {
  return (
    <Page wide>
      <PageHeader
        eyebrow="Train"
        icon={CloudSun}
        title="Weather Lab"
        description="Turn coded aviation weather into plain English, build your weather theory, and practice the go / no-go decisions examiners care about."
      />
      <Notice tone="caution" title="Educational weather only." className="mb-5">
        Sample reports and scenarios on this page are written for training and are not live weather.
        Decoders work on any report you paste, but TeachX does not fetch real observations. For real
        flights, obtain an official briefing (1800wxbrief.com, aviationweather.gov or another
        FAA-approved source).
      </Notice>

      <Tabs defaultValue="metar">
        <div className="overflow-x-auto">
          <TabsList className="mb-4">
            <TabsTrigger value="metar">
              <FileText className="size-4" /> METAR
            </TabsTrigger>
            <TabsTrigger value="taf">
              <ClipboardList className="size-4" /> TAF
            </TabsTrigger>
            <TabsTrigger value="pirep">
              <MessageSquareWarning className="size-4" /> PIREP
            </TabsTrigger>
            <TabsTrigger value="fb">
              <Wind className="size-4" /> Winds aloft
            </TabsTrigger>
            <TabsTrigger value="theory">
              <BookOpen className="size-4" /> Weather theory
            </TabsTrigger>
            <TabsTrigger value="decisions">
              <Brain className="size-4" /> Decision scenarios
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="metar" className="animate-fade-up">
          <MetarDecoder />
        </TabsContent>
        <TabsContent value="taf" className="animate-fade-up">
          <TafDecoder />
        </TabsContent>
        <TabsContent value="pirep" className="animate-fade-up">
          <PirepDecoder />
        </TabsContent>
        <TabsContent value="fb" className="animate-fade-up">
          <WindsAloftDecoder />
        </TabsContent>
        <TabsContent value="theory" className="animate-fade-up">
          <nav className="mb-4 flex flex-wrap gap-1.5 text-xs" aria-label="Weather theory topics">
            {[
              ["fronts", "Fronts"],
              ["pressure", "Pressure systems"],
              ["clouds", "Clouds"],
              ["viscig", "Visibility & ceiling"],
              ["icing", "Icing"],
              ["turbulence", "Turbulence"],
              ["thunderstorms", "Thunderstorms"],
            ].map(([id, l]) => (
              <a
                key={id}
                href={`#${id}`}
                className="rounded border bg-card px-2.5 py-1 text-muted-foreground hover:border-primary/50 hover:text-foreground"
              >
                {l}
              </a>
            ))}
          </nav>
          <div className="space-y-4">
            <TheoryBlock
              id="fronts"
              title="Fronts"
              icon={Waves}
              intro="A front is the boundary between air masses of different temperature and moisture. Most significant weather in the mid-latitudes occurs along fronts."
            >
              <FrontsRef />
            </TheoryBlock>
            <TheoryBlock
              id="pressure"
              title="Pressure systems"
              icon={Gauge}
              intro="Air flows from high to low pressure, deflected by the Coriolis force. Pressure also drives the most important altimeter error."
            >
              <PressureRef />
            </TheoryBlock>
            <TheoryBlock
              id="clouds"
              title="Clouds"
              icon={Cloudy}
              intro="Clouds form when air is cooled to its dew point — usually by lifting. Their shape tells you about the stability of the air."
            >
              <CloudsRef />
            </TheoryBlock>
            <TheoryBlock
              id="viscig"
              title="Visibility & ceiling"
              icon={Eye}
              intro="Ceiling and visibility determine the flight category and whether VFR flight is legal in a given class of airspace."
            >
              <VisCeilRef />
            </TheoryBlock>
            <TheoryBlock
              id="icing"
              title="Structural icing"
              icon={Snowflake}
              intro="Structural icing needs two things: visible moisture and an airframe temperature at or below freezing. It adds weight and drag and destroys lift."
            >
              <IcingRef />
            </TheoryBlock>
            <TheoryBlock
              id="turbulence"
              title="Turbulence"
              icon={Wind}
              intro="Turbulence is reported by intensity using the AIM 7-1-21 criteria. Slow to the turbulence penetration speed and keep the wings level."
            >
              <TurbulenceRef />
            </TheoryBlock>
            <TheoryBlock
              id="thunderstorms"
              title="Thunderstorms & convective weather"
              icon={CloudLightning}
              intro="A thunderstorm packs nearly every weather hazard to aviation into one cloud. The only safe strategy is avoidance."
            >
              <ThunderstormRef />
            </TheoryBlock>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Sources: FAA Aviation Weather Handbook (FAA-H-8083-28), Pilot's Handbook of Aeronautical
            Knowledge Ch. 12–13, AIM Chapter 7. For full lessons see the{" "}
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
