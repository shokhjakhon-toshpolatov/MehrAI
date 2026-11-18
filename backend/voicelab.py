"""Read-only VoiceLab connectivity check. No patient data is sent."""
import os
from pathlib import Path

import httpx


def check_connection():
    key = os.getenv("VOICELAB_API_KEY", "").strip()
    config = Path(__file__).with_name(".env.local")
    if not key and config.exists():
        for line in config.read_text(encoding="utf-8-sig").splitlines():
            name, _, value = line.partition("=")
            if name.strip() == "VOICELAB_API_KEY":
                key = value.strip().strip("\"'")
                break
    if not key:
        return {"status": "missing_key"}
    try:
        response = httpx.get("https://api.voicelab.uz/v1/models",
                             headers={"Authorization": f"Bearer {key}"}, timeout=8)
        if response.status_code in (401, 403):
            return {"status": "permission_denied"}
        response.raise_for_status()
        if isinstance(response.json().get("data"), list):
            return {"status": "connected"}
    except (httpx.HTTPError, ValueError, AttributeError):
        pass
    return {"status": "unavailable"}
