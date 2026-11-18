"""Repeatable, synthetic mock IT-MED observation feed."""

OBSERVATION_FEED = (
    ('p1', {}),
    ('p4', {}),
    ('p2', {'hemoglobin': 89, 'glucose': 6.0}),
    ('p4', {'bilirubin': 295, 'temperature': 38.4}),
)
EVENT_INTERVAL_SECONDS = 4
SAMPLE_PHONE = '+998 •• ••• •• ••'


def sample_contact(patient: dict) -> dict:
    return {
        'mother_name': patient.get('mother_name'),
        'phone_display': SAMPLE_PHONE,
    }
