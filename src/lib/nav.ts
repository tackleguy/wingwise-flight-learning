import {
  Award,
  BarChart3,
  BookOpen,
  BookOpenCheck,
  Building2,
  ClipboardCheck,
  CloudSun,
  Compass,
  FileCheck2,
  Gauge,
  GraduationCap,
  LayoutDashboard,
  Map,
  MessageSquareText,
  Mic,
  Notebook,
  Plane,
  PlaneTakeoff,
  Radio,
  Route,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        to: "/",
        label: "Dashboard",
        icon: LayoutDashboard,
        description: "Your training at a glance",
      },
      {
        to: "/progress",
        label: "Progress & Statistics",
        icon: BarChart3,
        description: "Scores and trends over time",
      },
      {
        to: "/achievements",
        label: "Achievements",
        icon: Award,
        description: "Training milestones",
      },
      {
        to: "/logbook",
        label: "Flight Logbook",
        icon: Notebook,
        description: "Simulated flight history",
      },
    ],
  },
  {
    label: "Fly",
    items: [
      {
        to: "/simulator",
        label: "Flight Simulator",
        icon: PlaneTakeoff,
        description: "3D flight simulation",
      },
      {
        to: "/avionics",
        label: "Avionics Lab",
        icon: Gauge,
        description: "PFD, MFD, GPS, autopilot",
      },
      {
        to: "/aircraft",
        label: "Aircraft Library",
        icon: Plane,
        description: "Aircraft systems & specs",
      },
      {
        to: "/airports",
        label: "Airport Database",
        icon: Building2,
        description: "Runways, frequencies, procedures",
      },
    ],
  },
  {
    label: "Train",
    items: [
      {
        to: "/training",
        label: "Flight Training",
        icon: GraduationCap,
        description: "Certificates, ratings & pathways",
      },
      { to: "/vfr", label: "VFR Training", icon: BookOpen, description: "VFR ground school" },
      { to: "/ifr", label: "IFR Training", icon: Compass, description: "Instrument ground school" },
      {
        to: "/weather",
        label: "Weather Lab",
        icon: CloudSun,
        description: "METAR, TAF & decisions",
      },
      {
        to: "/navigation",
        label: "Navigation & Charts",
        icon: Map,
        description: "Chart work & E6B tools",
      },
      { to: "/planner", label: "Flight Planner", icon: Route, description: "VFR & IFR planning" },
      { to: "/instructor", label: "AI Instructor", icon: Sparkles, description: "Ask your AI CFI" },
    ],
  },
  {
    label: "Radio",
    items: [
      { to: "/atc", label: "ATC Simulator", icon: Radio, description: "Scripted radio scenarios" },
      {
        to: "/ai-atc",
        label: "AI ATC Practice",
        icon: MessageSquareText,
        description: "Free-form AI controller",
      },
    ],
  },
  {
    label: "Test",
    items: [
      {
        to: "/practice-tests",
        label: "Practice Tests",
        icon: BookOpenCheck,
        description: "Topic quizzes & study mode",
      },
      {
        to: "/written-exams",
        label: "Written Exams",
        icon: FileCheck2,
        description: "Full-length knowledge tests",
      },
      {
        to: "/oral-exam",
        label: "Oral Exam",
        icon: Mic,
        description: "Examiner question practice",
      },
      {
        to: "/checkrides",
        label: "Checkrides",
        icon: ClipboardCheck,
        description: "Mock practical tests",
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        to: "/settings",
        label: "Settings",
        icon: Settings,
        description: "Profile, units, AI & controls",
      },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV.flatMap((g) => g.items);

export function navItemFor(pathname: string): NavItem | undefined {
  if (pathname === "/") return ALL_NAV_ITEMS[0];
  let best: NavItem | undefined;
  for (const item of ALL_NAV_ITEMS) {
    if (item.to !== "/" && (pathname === item.to || pathname.startsWith(item.to + "/"))) {
      if (!best || item.to.length > best.to.length) best = item;
    }
  }
  if (!best && pathname.startsWith("/academy/vfr"))
    return ALL_NAV_ITEMS.find((i) => i.to === "/vfr");
  if (!best && pathname.startsWith("/academy/ifr"))
    return ALL_NAV_ITEMS.find((i) => i.to === "/ifr");
  if (!best && pathname.startsWith("/exam"))
    return ALL_NAV_ITEMS.find((i) => i.to === "/practice-tests");
  return best;
}
