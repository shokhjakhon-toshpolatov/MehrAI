# MehrAI

Perinatal registry and follow-up workflow using synthetic patient, clinician, and appointment records.

```sh
npm ci
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
npm run build
backend/.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000. FastAPI serves the app and API from the same process. Case acceptance, reassignment, appointments and manual outreach outcomes persist in SQLite. Run an independent sample session with `DMED_DB=/path/to/sample.sqlite3` before starting the server.

The private static site shows an explicitly read-only preview. Local mutations require the sample API. No live DMED connection or phone transport is configured. Staff can record the outcome of a sample contact; a reschedule request leaves the appointment time unchanged until a new time is agreed.

See [backend/README.md](backend/README.md) for the local API contract and limits. Use only sample data with this unauthenticated local service.

## Clinician review and appointments

In the local sample workspace, open a yellow case from the bell or **Yo‘llanmalar**, switch to the assigned doctor's view, and approve the referral. Record the facility's response before creating a sample appointment or opening planned outreach. **Qabullar** filters by the clinician seeing the patient. The doctor selector is a demo view switch, not a login.

## Optional local AI evidence summary

Install and start [Ollama](https://ollama.com/), then pull the open-weight [Qwen3 8B model](https://ollama.com/library/qwen3:8b) and restart MehrAI with:

```sh
ollama pull qwen3:8b
MEHRAI_OLLAMA_MODEL=qwen3:8b backend/.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

In a patient drawer, **AI yordamida dalillarni tartiblash** asks the local model to prioritize existing rule findings. The backend accepts only valid references to those findings. It keeps the original risk flag and falls back to the rule evidence if the model is unavailable. Use synthetic cases only. The model is an optional presentation aid and has not been clinically validated.
