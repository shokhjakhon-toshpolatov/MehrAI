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

## OpenRouter AI analyzer

Set `OPENROUTER_API_KEY` in the backend environment, then restart Uvicorn. The default model is [Qwen3.6 27B](https://openrouter.ai/qwen/qwen3.6-27b). Optionally set `MEHRAI_OPENROUTER_MODEL` to another supported OpenRouter model. The key stays on the server. Keep it out of source control and frontend environment variables.

In a patient drawer, **AI tahlilini olish** asks the model to review existing sample rule findings and measured changes. A newly red case requests this review in the background when its card opens. MehrAI accepts only valid references and keeps every finding visible. Only the sample cohort, risk band, rule findings, and allowlisted numerical changes are sent. The backend requires providers that support the requested parameters and have zero data retention and no data collection. Red findings appear immediately in their original order, independently of the optional agent review. A missing key, incompatible model, or provider failure falls back to the rules.

This analyzer is for synthetic hackathon cases. The screening rules and workflow require clinical validation before any real-world use.

## Red-case hackathon demo

Run the local backend, open **Demo simulyator**, and choose the newborn or maternal observation. Open that patient from the urgent queue or bell. Record the review, switch to the assigned doctor's sample view if prompted, and choose **Aloqani tasdiqlash**. The server automatically moves the simulated call from queued to running to complete. It does not dial a phone. The intended live source is the clinic-recorded contact in DMED, subject to authorized access and endpoint verification.

## Live sample data replay

Open **Demo simulyator → Ma’lumotlar oqimini boshlash** in the local app. The replay feeds four sample observations through the same ingestion function as `POST /dmed/v2/Observation`. The overview shows arrivals, zone changes, and the analysis status. A backend worker runs the optional OpenRouter review without holding up the feed or the red alert. Open the newborn record to see the mother’s name and a masked sample phone number.

MehrAI is designed for future integration with DMED, subject to authorized access and verified endpoints for the facility. The mock feed imitates IT-MED's published integration API. Neither DMED nor the Ministry of Health's live API is connected.

For a newer open-weight candidate on OpenRouter, set `MEHRAI_OPENROUTER_MODEL=qwen/qwen3.8-2.4t-a95b` and restart the backend. The model is configurable so the same sample feed can be used to compare models.
