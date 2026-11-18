# DMED-inspired perinatal workspace

Next.js/React clinical workflow interface and a connected FastAPI/SQLite development backend. The workspace prioritizes urgent cases, patient records, appointments, outreach tasks, and facility-level monitoring. Bright red, yellow, and green encode risk, reinforced by explicit labels and icons.

## Run the connected application locally

```sh
npm install
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
npm run build
backend/.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Open **http://127.0.0.1:8000**. FastAPI serves the built interface and API. Local browser sessions automatically use port 8000. For frontend hot reload, also run `npm run dev` and open http://localhost:3000.

Accepting a case, handing it over, and creating an outreach task use the API, persist in SQLite, and record operator audit events. UI changes are confirmed only after the API returns. Pending emergency deadlines come from the server. The UI refreshes every 30 seconds and supports manual refresh.

## Distinct work areas

- **Ish stoli:** actionable emergencies, review-required cases, planned specialist reviews, and accepted cases.
- **Bemorlar registri:** all records, sorted by clinical priority, with cohort/clinic/risk/doctor/search filters and CSV export.
- **Qabullar:** proposed/confirmed appointments, attendance, and missed-visit status from records.
- **Bemorlar bilan aloqa:** provider queue records and outcomes, without browser speech or invented call results.
- **Muassasalar:** monitored patients and risk distribution per facility.

## Remote connection

Set `NEXT_PUBLIC_API_URL` to the full HTTPS API origin **before building**. Configure `DMED_CORS_ORIGINS` on the backend to allow that frontend origin (comma-separated).

Without an API origin, the hosted interface explicitly displays a read-only reference registry and disables clinical mutations. Failed connections retain the last loaded records with a stale-connection notice. The private Sites publication hosts the static frontend only; the Python service is not deployed there.

## Current boundary

The backend operates only in `mock` mode with synthetic patients and simplified supplied risk rules. No real DMED credentials, provider calls, SMS, Telegram notifications, or emergency dispatch are configured. It is a development system, not a clinically validated or nationally deployable service. Do not expose the unauthenticated development API or enter real patient information.

Production work still includes verified DMED/FHIR contracts, identity and role-based authorization, tenancy, clinical validation, authenticated provider webhooks, operational monitoring, secure production storage, and scale/reliability engineering. The interface no longer includes simulator controls or decorative voice widgets.

See [backend/README.md](backend/README.md) for API setup, persistence, endpoints, and implementation limits.

## Validation

```sh
npm test
npm run typecheck
npm run build
backend/.venv/bin/python -m unittest backend.test_backend -v
```

Tests cover distinct navigation screens, filtering, disconnected-state write prevention, API acceptance, failed mutation handling, outreach filtering, adapter contracts, and backend persistence/routing safeguards. Visual browser QA requires a connected browser; it was unavailable in this session.
