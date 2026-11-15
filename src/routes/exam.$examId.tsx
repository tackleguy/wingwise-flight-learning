import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileQuestion } from "lucide-react";
import { EmptyState, Page } from "@/components/app/page";
import { ExamRunner } from "@/components/exams/ExamRunner";
import { EXAM_SUBJECTS, getExam } from "@/lib/exams/catalog";
import { recentMissedIds } from "@/lib/exams/analytics";
import { getState, useHydrated } from "@/lib/store";

export interface ExamSearch {
  mode: "timed" | "study";
  count?: number;
  subjects?: string;
  review?: "missed";
}

function validateSearch(search: Record<string, unknown>): ExamSearch {
  const out: ExamSearch = { mode: search["mode"] === "study" ? "study" : "timed" };
  const c = Number(search["count"]);
  if (Number.isFinite(c) && c >= 1) out.count = Math.min(200, Math.floor(c));
  if (typeof search["subjects"] === "string" && search["subjects"].trim())
    out.subjects = search["subjects"];
  if (search["review"] === "missed") out.review = "missed";
  return out;
}

export const Route = createFileRoute("/exam/$examId")({
  validateSearch,
  head: ({ params }) => {
    const def = getExam(params.examId);
    const name = def
      ? def.category === "written"
        ? `${def.code} Practice Exam`
        : def.title
      : "Practice Exam";
    return {
      meta: [
        { title: `${name} — SkyReady` },
        {
          name: "description",
          content:
            "Timed or study-mode practice exam with instant scoring, subject breakdown and full explanations. Unofficial study material — not FAA test questions.",
        },
      ],
    };
  },
  component: ExamPage,
});

function ExamPage() {
  const { examId } = Route.useParams();
  const search = Route.useSearch();
  const def = getExam(examId);
  const hydrated = useHydrated();

  const subjects = useMemo(() => {
    if (!search.subjects) return undefined;
    const valid = new Set<string>(EXAM_SUBJECTS);
    const list = search.subjects
      .split(",")
      .map((s) => s.trim())
      .filter((s) => valid.has(s));
    return list.length ? list : undefined;
  }, [search.subjects]);

  // Snapshot the missed set once, so recording this attempt doesn't change the running exam.
  const [missedSnap, setMissedSnap] = useState<string[] | null>(null);
  useEffect(() => {
    if (search.review === "missed" && hydrated && missedSnap === null)
      setMissedSnap(recentMissedIds(getState().exams));
  }, [search.review, hydrated, missedSnap]);
  const missed = search.review === "missed" ? (missedSnap ?? undefined) : undefined;

  if (!def) {
    return (
      <Page>
        <EmptyState
          icon={FileQuestion}
          title="Exam not found"
          description={`There is no practice exam with the id "${examId}".`}
          action={{ to: "/practice-tests", label: "Go to Practice Test Center" }}
        />
      </Page>
    );
  }

  const isWritten = def.category === "written";
  const backTo = isWritten ? "/written-exams" : "/practice-tests";
  const backLabel = isWritten ? "Back to Written Exams" : "Back to Practice Test Center";

  if (search.review === "missed" && (!hydrated || missedSnap === null)) {
    return (
      <Page>
        <p className="py-16 text-center text-sm text-muted-foreground">
          Loading your missed questions…
        </p>
      </Page>
    );
  }

  if (search.review === "missed" && missed && missed.length === 0) {
    return (
      <Page>
        <EmptyState
          icon={FileQuestion}
          title="No missed questions to review"
          description="Questions you miss in practice tests and written exams are collected here for focused review. Take a test first."
          action={{ to: "/practice-tests", label: "Go to Practice Test Center" }}
        />
      </Page>
    );
  }

  const title =
    search.review === "missed"
      ? "Missed-Question Review"
      : def.category === "custom"
        ? subjects && subjects.length <= 3
          ? `Custom Quiz — ${subjects.join(", ")}`
          : subjects
            ? `Custom Quiz — ${subjects.length} subjects`
            : "Custom Quiz — All subjects"
        : isWritten
          ? `${def.code} — ${def.title} (practice)`
          : `${def.title} Practice Test`;

  const runKey = [
    examId,
    search.mode,
    search.count ?? "",
    search.subjects ?? "",
    search.review ?? "",
  ].join("|");

  return (
    <Page className="max-w-6xl">
      <ExamRunner
        key={runKey}
        def={def}
        title={title}
        mode={search.mode}
        count={search.count}
        subjects={subjects}
        onlyIds={missed}
        backTo={backTo}
        backLabel={backLabel}
      />
    </Page>
  );
}
