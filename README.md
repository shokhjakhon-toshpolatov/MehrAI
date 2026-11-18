# MehrAI

Perinatal registry and follow-up workflow using synthetic patient, clinician, and appointment records.

For one-click startup, open `run.py` and press your editor's **Run** button (or run `python run.py`). Install Python 3.10+ and Node.js first. The launcher installs dependencies on first use, builds the frontend, starts the local server, and opens your browser. Keep it running while using the app; press **Ctrl+C** to stop.

Manual setup:

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
