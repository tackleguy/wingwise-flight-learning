# TeachX — Flight Simulator & Pilot Training Platform

A complete simulated aviation training environment in the browser:

- **3D flight simulator** with a physics-based flight model, 12 aircraft, real-world-inspired airports,
  weather, day/night, and 24 scored training scenarios (VFR, IFR, emergencies, checkride flights).
- **Avionics Lab** — functional PFD/MFD, steam gauges, HSI/VOR/ILS, a GPS navigator and an autopilot,
  all driven by the same simulation engine.
- **ATC Simulator & AI ATC Practice** — radio panel, 15 phraseology scenarios with readback scoring,
  voice input/output where the browser supports it, and an optional AI controller.
- **VFR and IFR academies** — lessons, interactive diagrams and exercises, flashcards and module quizzes.
- **Practice Test Center & Written Exams**, **Oral Exam simulator**, **Mock Checkrides**.
- **Aircraft Library, Airport Database, Weather Lab, Navigation & Charts, Flight Planner, Logbook,
  Progress statistics and Achievements.**

> Educational simulation only. Not for real-world navigation. Simulated time is not loggable flight time,
> and nothing on this platform grants an FAA certificate, rating or endorsement.

This project is connected to [Lovable](https://lovable.dev/projects/e1f8669a-347d-476b-bcfa-d1fb6db80dbd).

## Optional AI configuration

Everything works without AI (scripted training mode). To enable the AI controller/instructor/examiner:

- **Cloud AI** — enable Lovable AI for the project (provides `LOVABLE_API_KEY` on the server).
- **Local model on a server** — set server environment variables `LOCAL_AI_BASE_URL` (OpenAI-compatible,
  e.g. `http://localhost:11434/v1`) and `LOCAL_AI_MODEL`.
- **Local model on your own computer** — in **Settings → AI provider**, choose "Local model in this
  browser" and enter your Ollama/LM Studio URL (allow the site origin, e.g. `OLLAMA_ORIGINS`).

## Development

```sh
bun install
bun run dev        # start the dev server
bun run test       # run unit tests (includes headless flight-model tests)
bun run build      # production build
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how the pieces fit together.
