# SkyReady — Architecture

SkyReady is a TanStack Start (React 19 + TypeScript) application styled with Tailwind CSS v4.

## Layout

| Area                                        | Location                                                          |
| ------------------------------------------- | ----------------------------------------------------------------- |
| App shell (sidebar, top bar)                | `src/components/app/AppShell.tsx`, navigation in `src/lib/nav.ts` |
| Shared page primitives                      | `src/components/app/page.tsx`                                     |
| Training record (progress store)            | `src/lib/store.ts`                                                |
| Metrics & achievements                      | `src/lib/metrics.ts`, `src/lib/achievements.ts`                   |
| Aviation data (airports, navaids, aircraft) | `src/lib/data/*`                                                  |
| Ground-school content                       | `src/lib/content/*`                                               |
| Question bank & exam catalog                | `src/lib/exams/*`                                                 |
| Oral exam & checkride logic                 | `src/lib/oral/*`, `src/lib/checkride/*`                           |
| ATC engine & phraseology evaluation         | `src/lib/atc/*`                                                   |
| AI provider abstraction                     | `src/lib/ai/*` (client) and server functions                      |
| Flight simulation engine                    | `src/sim/*`                                                       |
| 3D view and cockpit UI                      | `src/components/sim/*`                                            |
| Avionics instrument library                 | `src/components/avionics/*`                                       |

## Simulation architecture

`src/sim/engine.ts` (`SimEngine`) is the single source of truth for a flight. It owns:

- **Aircraft state** (`AircraftState`) and **controls** (`Controls`).
- **Flight dynamics** — point-mass equations with angle-of-attack lift, stall, induced/parasite drag,
  propeller or jet thrust, density altitude, ground roll, rotation and touchdown detection.
- **Weather** (`environment.ts`) — ISA atmosphere, wind with height, gusts, turbulence, terrain function.
- **Navigation** (`navigation.ts`) — VOR, localizer/glideslope, DME, ADF, markers and GPS.
- **Autopilot / flight director** (`autopilot.ts`) — ROL/HDG/NAV/APR, PIT/ALT/VS/FLC/GS.
- **Failures** — engine, alternator, vacuum, AHRS, pitot, static, radios, GPS.

The 3D view (`src/components/sim/World3D.tsx`) draws each aircraft with its FlightGear 3D model
(`src/components/sim/fg-aircraft.ts` loads `/sim/models/fg/<file>.glb` — the World Flight
Simulator's files, built from `flightsim/` — scaled to the aircraft's wingspan; the Bonanza and
Baron use the closest FlightGear look-alike, the SR20 the SR22 airframe and the 152 the 172). These
models are GPL; authors and sources are in `public/sim/models/fg/CREDITS.md`. A simple drawn shape
is shown while a model loads, or if it cannot be loaded.

Every instrument and the 3D view subscribe to the same immutable `SimSnapshot`, so all displays stay
synchronised. Instruments read `snapshot.indicated.*` so failures (e.g. a blocked pitot tube) show up
realistically.

Scenarios (`src/sim/scenarios.ts`) define start state, weather, scheduled failures and measurable
objectives (`src/sim/objectives.ts`). Flights are scored and written to the logbook.

Headless tests: `bunx vitest run src/sim/sim.test.ts`.

## Persistence

Progress is stored in the browser (localStorage) through `src/lib/store.ts`, with JSON export/import in
Settings. The store's record types mirror the relational model below, so they can be synced to a
Postgres backend (Lovable Cloud) without changing the UI.

### Proposed relational schema (PostgreSQL)

> Database tables for this project must be created through Lovable (see `AGENTS.md`). This is the
> blueprint to request.

| Table                              | Key columns                                                                                                                                                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`                         | `id (uuid, = auth user id)`, `name`, `callsign`, `home_airport`, `goal`, `settings jsonb`, `created_at`                                                                                                                    |
| `courses` / `lessons`              | static content (seeded from `src/lib/content`) — `id`, `course_id`, `module_id`, `title`, `body jsonb`                                                                                                                     |
| `questions` / `exams`              | static bank (seeded from `src/lib/exams`)                                                                                                                                                                                  |
| `lesson_progress`                  | `user_id`, `lesson_id`, `completed_at`                                                                                                                                                                                     |
| `quiz_attempts`                    | `id`, `user_id`, `course`, `module_id`, `score`, `total`, `final`, `created_at`                                                                                                                                            |
| `exam_attempts`                    | `id`, `user_id`, `exam_id`, `mode`, `score_pct`, `correct`, `incorrect`, `unanswered`, `time_used_sec`, `by_subject jsonb`, `missed_question_ids text[]`, `created_at`                                                     |
| `flight_sessions` / `flight_logs`  | `id`, `user_id`, `aircraft_id`, `departure`, `destination`, `duration_sec`, `kind`, `rules`, `scenario_id`, `landings`, `approaches`, `night`, `objectives jsonb`, `feedback jsonb`, `score`, `checkride_id`, `created_at` |
| `atc_sessions` / `atc_transcripts` | `id`, `user_id`, `scenario_id`, `airport`, `difficulty`, `engine`, `score`, `breakdown jsonb`, `transcript jsonb`, `created_at`                                                                                            |
| `oral_attempts`                    | `id`, `user_id`, `level`, `track_id`, `score`, `items jsonb`, `created_at`                                                                                                                                                 |
| `checkride_attempts`               | `id`, `user_id`, `track_id`, `stages jsonb`, `overall`, `passed`, `completed`, `created_at`                                                                                                                                |
| `achievements_unlocked`            | `user_id`, `achievement_id`, `unlocked_at`                                                                                                                                                                                 |
| `flight_plans`                     | `id`, `user_id`, `rules`, `aircraft_id`, `departure`, `destination`, `alternate`, `route text[]`, `cruise_alt_ft`, `cruise_ktas`, `wind`, `fuel_gal`, `departure_time`                                                     |
| `certificates_of_completion`       | `id`, `user_id`, `track_id`, `checkride_id`, `issued_at` (training completion only — not FAA credentials)                                                                                                                  |

All user tables use row-level security: `user_id = auth.uid()`.

## AI services (all local)

AI ATC, the AI Instructor and the Oral Examiner call `aiChat()` in `src/lib/ai/client.ts`. There is no
server-side AI and no API key. Providers:

1. **On-device (default)** — `src/lib/ai/local-model.ts` runs Llama 3.2 3B with WebLLM in a Web Worker
   (`model.worker.ts`) on the user's GPU. The model downloads only after the user turns it on and is
   cached by the browser (`model-cache.ts` retries interrupted downloads). Once enabled it auto-starts
   from cache on later visits. Requests are serialised and time out after 90 s.
2. **User's own local model server** — an OpenAI-compatible URL on the user's computer (e.g. Ollama),
   called directly from the browser.
3. **Scripted fallback** — every AI feature has a rule-based mode, used whenever the model is off,
   unsupported (no WebGPU), loading or busy.

Guardrail system prompts (`guardrails.ts`) are prepended to every request on every provider.

## Honesty rules built into the product

- Simulated flight time is never presented as loggable time (14 CFR 61.51).
- Mock checkrides and training completions are not FAA certificates, ratings or endorsements.
- Simulated ATC is labelled as training, never as real air traffic control.
- Airport/navaid data is an educational snapshot with source/currency notices — not for navigation.
- Practice questions are unofficial study material, not FAA test-bank questions.
