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

## AI (all local)

All AI on TeachX runs locally — nothing is sent to a cloud AI service and there are no API keys.

- **On-device AI (default)** — Llama 3.2 3B runs inside the visitor's browser on their GPU via
  [WebLLM](https://github.com/mlc-ai/web-llm). Users turn it on once (about a 2 GB download, then
  cached in the browser). Needs WebGPU (recent Chrome or Edge on desktop).
- **Your own local model server** — in **Settings → AI provider**, enter an OpenAI-compatible URL for a
  model running on your computer (e.g. Ollama at `http://localhost:11434/v1`; allow the site origin with
  `OLLAMA_ORIGINS`).
- **Scripted mode** — every feature (AI ATC, AI Instructor, oral examiner) also works with no AI at all.

## Development

```sh
bun install
bun run dev        # start the dev server
bun run test       # run unit tests (includes headless flight-model tests)
bun run build      # production build
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how the pieces fit together.
