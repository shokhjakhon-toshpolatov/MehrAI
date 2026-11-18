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

Resource envelopes and simplified observations are demo contracts, not verified SSV/FHIR profiles. Sandbox OAuth, authenticated webhooks, real VoiceLab/Telegram transport, production authorization, multi-organization tenancy, secure clinical storage, and clinical validation require a separate integration stage. The four seed doctors have a deterministic sample roster. Facilities supply visit details manually. Multi-pathology records show all reasons but assign one primary specialty; missing observations enter `REVIEW` rather than being declared healthy. Neonatal thresholds mirror the brief and do not substitute for age/gestation-specific clinical guidance.

## Connected MehrAI interface

Run `npm run build` before starting Uvicorn. The backend serves the built UI from `out/` at the same origin. DMed is disconnected. The workspace uses local sample records.

`POST /api/outreach/{call_id}/outcome` accepts `{"outcome":"CONFIRMED","attempt_id":"unique-id"}`. Staff can record a confirmation, a request for a different time, a successful urgent contact, or no answer. Duplicate attempt IDs are ignored. A confirmation books the existing proposed slot, while a request for another time stays open. The endpoint records an outcome only and does not dial a phone.

Yellow cases enter the referral queue without a visit time. Staff record the facility, receiving clinician, and either a proposed or confirmed fixed time, or an untimed visit, through `POST /api/referrals/{case_id}/response`. `POST /api/visits/{visit_id}/attended` records attendance. The worker checks only confirmed timed visits for no-shows. A request for another time returns the case to the referral queue. Previous automatically generated sample slots are retired at startup.

The sample registry omits phone fields, and startup clears legacy sample phone values. Contact actions create tasks and record staff-reported results without dialing.
