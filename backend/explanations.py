"""Clinician-facing evidence summaries for the synthetic registry."""
import json
import math
import os

import httpx

DEFAULT_MODEL = "qwen/qwen3.6-27b"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


OBSERVATION_FIELDS = (
    'systolic', 'diastolic', 'hemoglobin', 'glucose', 'bilirubin',
    'temperature', 'spo2', 'weight_loss', 'age_days',
)


def numeric_observations(observation):
    return {
        key: value for key in OBSERVATION_FIELDS
        if type(value := observation.get(key)) in (int, float) and math.isfinite(value)
    }


def explain_case(case: dict) -> dict:
    reasons = case['risk_reasons'] or ['Namuna qoidasi bo‘yicha xavf belgisi topilmadi']
    fallback = {'source': 'rules', 'zone': case['risk_zone'], 'reasons': reasons}
    key = os.getenv('OPENROUTER_API_KEY', '').strip()
    model = os.getenv('MEHRAI_OPENROUTER_MODEL', '').strip() or DEFAULT_MODEL
    current = numeric_observations(case.get('observation') or {})
    previous = numeric_observations(case.get('previous_observation') or {})
    changes = {
        key: {'before': previous[key], 'after': value}
        for key, value in current.items() if key in previous and value != previous[key]
    }
    changed_urgent = case['risk_zone'] == 'RED' and case.get('previous_risk_zone') not in (None, 'RED')
    if ((case['risk_zone'] == 'RED' and not changed_urgent)
            or (len(reasons) < 2 and not changes) or os.getenv('DMED_MODE', 'mock') != 'mock'):
        return fallback
    allowed_focus = ['SCREENING_FINDINGS']
    if changes:
        allowed_focus.append('VERIFY_CHANGE')
    if any(reason.startswith('Missing observations:') for reason in reasons):
        allowed_focus.append('MISSING_OBSERVATIONS')
    if not key:
        return {**fallback, 'analyzer_status': 'not_configured'}

    # The model selects and orders existing evidence only. Free text from
    # the model never appears as a clinical finding or changes the triage zone.
    payload = {
        'model': model,
        'stream': False,
        'max_tokens': 160,
        'temperature': 0,
        'reasoning': {'effort': 'none', 'exclude': True},
        'provider': {'data_collection': 'deny', 'zdr': True, 'require_parameters': True},
        'response_format': {
            'type': 'json_schema',
            'json_schema': {
                'name': 'evidence_priority',
                'strict': True,
                'schema': {
                    'type': 'object',
                    'properties': {
                        'indices': {'type': 'array', 'items': {'type': 'integer'}},
                        'review_focus': {'type': 'string', 'enum': allowed_focus},
                    },
                    'required': ['indices', 'review_focus'],
                    'additionalProperties': False,
                },
            },
        },
        'messages': [
            {
                'role': 'system',
                'content': (
                    'Review the synthetic rule findings and measured changes as a second reviewer. '
                    'Choose up to three existing findings by zero-based index and select one review_focus. '
                    'Do not provide a diagnosis, invent facts, or change the risk zone. '
                    'Choose VERIFY_CHANGE for a change the clinician should verify, '
                    'MISSING_OBSERVATIONS when incomplete information needs review, '
                    'or SCREENING_FINDINGS to highlight the existing evidence.'
                ),
            },
            {'role': 'user', 'content': json.dumps({
                'cohort': case['cohort_type'], 'zone': case['risk_zone'], 'findings': reasons,
                'changes': changes,
            }, ensure_ascii=False)},
        ],
    }
    unavailable = {**fallback, 'analyzer_status': 'unavailable'}
    try:
        with httpx.Client(timeout=15, trust_env=False, follow_redirects=False) as client:
            response = client.post(OPENROUTER_URL, headers={'Authorization': f'Bearer {key}'}, json=payload)
            response.raise_for_status()
        choice = response.json()['choices'][0]
        if choice.get('finish_reason') != 'stop':
            return unavailable
        analysis = json.loads(choice['message']['content'])
        indices, focus = analysis['indices'], analysis['review_focus']
        if focus not in allowed_focus:
            return unavailable
        if not isinstance(indices, list) or not 1 <= len(indices) <= 3:
            return unavailable
        if any(type(index) is not int or not 0 <= index < len(reasons) for index in indices):
            return unavailable
        ranked = list(dict.fromkeys(indices))
        ranked.extend(index for index in range(len(reasons)) if index not in ranked)
        return {**fallback, 'source': 'openrouter', 'model': model,
                'review_focus': focus,
                'reasons': reasons if case['risk_zone'] == 'RED' else [reasons[index] for index in ranked]}
    except (httpx.HTTPError, ValueError, KeyError, TypeError, IndexError, AttributeError):
        return unavailable
