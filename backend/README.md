# Perinatal API simulator

A local synthetic-data FastAPI/SQLite backend implementing the supplied hackathon brief. It is not an official DMED integration or a clinically validated triage engine. This service is intentionally unauthenticated for loopback development: do not expose it or enter real patient data.

From the repository root:

```sh
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
backend/.venv/bin/uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
backend/.venv/bin/python -m unittest backend.test_backend -v
```

Open `http://127.0.0.1:8000/docs` for interactive API documentation. Data persists in `backend/demo.sqlite3`; set `DMED_DB` to another path or delete the database while stopped to reseed. `DMED_MODE` must be `mock`; other modes fail explicitly.

## API

- `GET /api/registry`: four seed patients, cases, doctors and simulated call queue.
- `POST /api/simulate/maternal-red`, `/neonatal-red`, `/fast-forward`.
- `POST /api/cases/{patient_id}/accept`, `/busy`, `/call`.
- `POST /webhooks/voicelab/status`: `{ "case_id": "p2", "intent": "CONFIRMED", "event_id": "unique-event" }`. Also supports `RESCHEDULE_REQUESTED`, `NO_ANSWER`.
- `GET /dmed/v2/{resource}` and `/{resource}/{id}` for mock resources; individual reads return weak ETags.
- `POST /dmed/v2/Observation`: `{ "patient": "p4", "id": "unique-observation", "age_days": 5, "bilirubin": 295, "temperature": 38.4, "spo2": 98, "weight_loss": 8.4, "feeding": "active" }` evaluates and routes.
- `POST /dmed/v2/ServiceRequest`, `/Appointment`, `/Encounter`.
- `PUT /dmed/v2/Appointment/{id}` requires current `If-Match`; stale/missing ETags return 412.

The persisted worker checks emergency acknowledgment deadlines, quiet-hours call release, and appointment no-shows each second. A missing neonatal backup alerts the department head without inventing a doctor. Yellow calls are queued overnight until 08:30 Asia/Tashkent; red calls remain immediately ready. All call and notification activity is simulated; no actual voice, SMS, Telegram, nurse or family messages are sent. Encounter no-show matching requires the patient and appointment IDs.

## Deliberate integration limits

Resource envelopes and simplified observations are demo contracts, not verified SSV/FHIR profiles. Sandbox OAuth, authenticated webhooks, real VoiceLab/Telegram transport, production authorization, multi-organization tenancy, secure clinical storage, and clinical validation require a separate integration stage. The four seed doctors have a simple deterministic local roster and weekday-independent 09:00–17:00 half-hour booking window, not a real availability feed. Multi-pathology records show all reasons but assign one primary specialty; missing observations enter `REVIEW` rather than being declared healthy. Neonatal thresholds mirror the brief and do not substitute for age/gestation-specific clinical guidance.

## Connect the frontend

Set the public API origin before starting or building the Next.js frontend:

```sh
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000 npm run dev
```

For a static export, supply `NEXT_PUBLIC_API_URL` to `npm run build`; it is embedded in the browser bundle, so changing it requires a rebuild. Do not put secrets in this variable. Without it, a browser on `localhost` or `127.0.0.1` connects to `http://127.0.0.1:8000`. On other hosts `lib/api.ts` rejects reads and writes explicitly; the UI may provide a separately labeled, read-only reference preview. The adapter maps actual API cases and outreach records, including the `REVIEW` state, rather than mutating local sample records. This backend always identifies its source as `mock` even when connected successfully.

`CORS_ORIGINS` is a comma-separated allowlist of exact frontend origins, defaulting to localhost ports 3000, 5173 and 8000, and 127.0.0.1 ports 3000 and 8000. Example for a different local origin:

```sh
CORS_ORIGINS=http://127.0.0.1:3001 backend/.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Case acceptance, pending-emergency handover, and outreach queue requests persist to SQLite and append audit records returned by `/api/registry`. The audit actor `local-operator` is a development label, not an authenticated identity. Rejected actions do not append success audit records. A call action only queues simulated outreach; `READY` does not mean a call occurred. Run adapter tests with `node --test backend/test_frontend_adapter.cjs` after installing the frontend dependencies.

## One-process local application

Build the static frontend, then start the backend. FastAPI serves `out/` after all API routes when that directory exists at startup:

```sh
npm run build
backend/.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000`. The adapter detects the local hostname and connects to this same backend; no public environment variable is necessary. Restart the server after creating `out/` for the first time. A separately hosted frontend without an API URL remains an explicitly disconnected reference view. Persisted actions only become available after the API responds successfully.
