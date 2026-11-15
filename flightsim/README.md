# SkyReady Flight Simulator

A free flight simulator that runs in the web browser — no install, no account. It is a learning
aid for student pilots built around one aircraft (a Cessna 172-class trainer), real terrain and
airports of the whole world, real weather, and a training mode with scored lessons.

> **Not an FAA-approved training device.** Time spent in this simulator cannot be logged.
> Always follow your instructor and the real aircraft's Pilot's Operating Handbook.

- How it is built and the rules for changing it: [ARCHITECTURE.md](ARCHITECTURE.md)
- Why things were done this way: [DECISIONS.md](DECISIONS.md)
- Every open-source project and open data source used: [CREDITS.md](CREDITS.md)
- Where the work stands: [PROGRESS.md](PROGRESS.md)
- How the flight model compares with the real aircraft: [docs/PHYSICS-VALIDATION.md](docs/PHYSICS-VALIDATION.md)
- How to use the simulator: [docs/USER-GUIDE.md](docs/USER-GUIDE.md)
- **Tests mode** (scored failures, weather, preflight and skill tests): [docs/notes/tests.md](docs/notes/tests.md)

## Putting it online (Vercel, free)

The repository already contains everything Vercel needs (`vercel.json` in the repository root).

1. Go to <https://vercel.com>, sign in with your GitHub account.
2. **Add New → Project**, pick this repository, press **Deploy**. Do not change any setting.
3. After a few minutes Vercel shows the address of the simulator (something like
   `https://your-project.vercel.app`). From then on every change pushed to the `main` branch
   goes live automatically.

Vercel's free "Hobby" plan is for personal, non-commercial use.

## Running it on your own computer

```bash
cd flightsim
npm install
npm run dev
```

Then open the address it prints (normally <http://127.0.0.1:5173>).

```bash
npm test         # checks the flight physics and the logic
npm run build    # makes the static site in flightsim/dist
npm run data     # rebuilds the airport database from OurAirports (optional)
```

## Embedding it in another page

The built site works from any folder. Link to it, or embed it:

```html
<iframe src="https://your-simulator-address/?embed=1" allow="fullscreen; gamepad; accelerometer; gyroscope" style="width:100%;height:80vh;border:0"></iframe>
```
