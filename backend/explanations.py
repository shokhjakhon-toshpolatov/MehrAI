"""Clinician-facing evidence summaries for the synthetic registry."""
import json
import os

import httpx


def explain_case(case: dict) -> dict:
    reasons = case['risk_reasons'] or ['Namuna qoidasi bo‘yicha xavf belgisi topilmadi']
    fallback = {'source': 'rules', 'zone': case['risk_zone'], 'reasons': reasons[:3]}
    model = os.getenv('MEHRAI_OLLAMA_MODEL')
    if not model or len(reasons) < 2:
        return fallback

    # The local model selects and orders existing evidence only. Free text from
    # the model never appears as a clinical finding or changes the triage zone.
    payload = {
        'model': model, 'stream': False, 'think': False,
        'format': {
            'type': 'object',
            'properties': {'indices': {'type': 'array', 'items': {'type': 'integer'}}},
            'required': ['indices'],
            'additionalProperties': False,
        },
        'options': {'temperature': 0, 'num_predict': 96},
        'messages': [
            {
                'role': 'system',
                'content': (
                    'Prioritize up to three existing rule findings for clinician review. '
                    'For RED include the urgent findings first. Return only zero-based '
                    'indices of the supplied findings, without changing or adding findings.'
                ),
            },
            {'role': 'user', 'content': json.dumps({
                'cohort': case['cohort_type'], 'zone': case['risk_zone'], 'findings': reasons,
            }, ensure_ascii=False)},
        ],
    }
    try:
        with httpx.Client(timeout=15, trust_env=False, follow_redirects=False) as client:
            response = client.post('http://127.0.0.1:11434/api/chat', json=payload)
            response.raise_for_status()
        indices = json.loads(response.json()['message']['content'])['indices']
        if not isinstance(indices, list) or not 1 <= len(indices) <= 3:
            return fallback
        if any(type(index) is not int or not 0 <= index < len(reasons) for index in indices):
            return fallback
        # Ensure AI prioritization cannot hide the leading rule finding.
        if 0 not in indices:
            return fallback
        return {**fallback, 'source': 'local-model', 'model': model,
                'reasons': [reasons[index] for index in dict.fromkeys(indices)]}
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        return fallback
