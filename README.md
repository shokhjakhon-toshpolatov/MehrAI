# Mehr — Perinatal care

A colorful DMED-inspired perinatal monitoring prototype built from the supplied maternal AI agent plan. Next.js 15, React 19, TypeScript, Lucide icons; a separate FastAPI/SQLite backend prototype.

## Run the interface

```sh
npm install
npm run dev
```

Open http://localhost:3000. `npm run build` creates a static production interface in `out/`.

## Demo walkthrough

- Search/filter the registry by patient, clinic, cohort, risk, or doctor.
- Select a patient to inspect observations and accept or transfer a case.
- Open **Demo simulyator** to inject maternal or newborn observations and run accelerated escalation.
- Use **AI qo‘ng‘iroqlar** to hear browser speech and simulate confirmation/rescheduling. Uzbek voice availability depends on the browser/OS.
- Explore appointments, clinic breakdowns, and risk analysis. Export filtered records as CSV.

## Backend

See [backend/README.md](backend/README.md) for installation, endpoints, and tests. The API provides mock DMED endpoints, persistent triage records, routing, scheduling, ETags, idempotency, quiet hours, escalation, and simulated voice webhooks.

**The hosted UI uses independent in-memory demo state and is not connected to the Python API.** Reloading resets it. The backend can be run and evaluated separately. Its four plan seed patients differ from the interface's eight illustrative records. Wiring the UI to the API, authentication, real DMED OAuth, VoiceLab, Telegram, and clinical validation are remaining production integration work.

No real patient data, calls, medical bookings, or emergency notifications are sent. The risk rules are prototype rules supplied in the brief, not a validated clinical decision system. No official DMED affiliation is claimed.

## Checks

```sh
npm run typecheck
npm run build
backend/.venv/bin/python -m unittest backend.test_backend -v
```

Design: blue/cyan DMED-inspired identity, teal care accents, distinct coral/amber/mint risk states, responsive sidebar and registry, patient drawer, and voice workflow panel. Original style reference: https://dmed.uz/en.
