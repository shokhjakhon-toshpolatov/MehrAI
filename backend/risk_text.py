"""Uzbek display text for the existing screening findings."""

FINDING_LABELS = {
    'Severe hypertension': 'Arterial bosim juda yuqori',
    'Hypertension with proteinuria': 'Yuqori arterial bosim va proteinuriya',
    'Severe anemia': 'Og‘ir kamqonlik belgisi',
    'Bleeding': 'Qon ketishi qayd etilgan',
    'Reduced fetal movement': 'Homila harakati kamaygan',
    'Anemia requires clinician review': 'Kamqonlik belgisi',
    'Elevated blood pressure': 'Arterial bosim ko‘tarilgan',
    'Blood pressure increased from baseline': 'Arterial bosim avvalgi darajadan oshgan',
    'Proteinuria requires review': 'Proteinuriya aniqlangan',
    'Endocrine review': 'Endokrinolog ko‘rigi kerak',
    'Cardiac review': 'Yurak ritmi buzilishi qayd etilgan',
    'High bilirubin': 'Bilirubin yuqori',
    'Jaundice in first 24 hours': 'Birinchi 24 soatda sariqlik kuzatilgan',
    'Abnormal neonatal temperature': 'Chaqaloq harorati me’yordan tashqarida',
    'Low oxygen saturation': 'Kislorod bilan to‘yinish past',
    'Neonatal danger sign': 'Chaqaloqda xavf belgisi qayd etilgan',
    'Jaundice requires review': 'Sariqlik bo‘yicha ko‘rik kerak',
    'Weight loss requires review': 'Vazn yo‘qotilishi bo‘yicha ko‘rik kerak',
    'Temperature requires review': 'Haroratni qayta tekshirish kerak',
    'Oxygen saturation requires review': 'Kislorod bilan to‘yinishni tekshirish kerak',
    'Umbilical redness': 'Kindik atrofida qizarish kuzatilgan',
}

OBSERVATION_LABELS = {
    'systolic': 'sistolik bosim', 'diastolic': 'diastolik bosim',
    'hemoglobin': 'gemoglobin', 'glucose': 'glyukoza', 'proteinuria': 'proteinuriya',
    'recognized proteinuria result': 'proteinuriya natijasining tasdig‘i',
    'age_days': 'chaqaloq yoshi', 'bilirubin': 'bilirubin', 'temperature': 'harorat',
    'spo2': 'SpO₂', 'weight_loss': 'vazn yo‘qotilishi', 'feeding': 'emish holati',
    'recognized feeding assessment': 'emish holatining tasdig‘i',
    'age-specific neonatal assessment': 'yoshiga mos neonatal baholash',
}

MEASURED_FINDINGS = {
    'Severe anemia': ('hemoglobin', 'Gemoglobin', ' g/L'),
    'Anemia requires clinician review': ('hemoglobin', 'Gemoglobin', ' g/L'),
    'Endocrine review': ('glucose', 'Glyukoza', ' mmol/L'),
    'High bilirubin': ('bilirubin', 'Bilirubin', ' µmol/L'),
    'Jaundice requires review': ('bilirubin', 'Bilirubin', ' µmol/L'),
    'Abnormal neonatal temperature': ('temperature', 'Harorat', ' °C'),
    'Temperature requires review': ('temperature', 'Harorat', ' °C'),
    'Low oxygen saturation': ('spo2', 'SpO₂', '%'),
    'Oxygen saturation requires review': ('spo2', 'SpO₂', '%'),
    'Weight loss requires review': ('weight_loss', 'Vazn yo‘qotilishi', '%'),
}

PRESSURE_FINDINGS = {
    'Severe hypertension', 'Hypertension with proteinuria', 'Elevated blood pressure',
    'Blood pressure increased from baseline',
}


def finding_text(reason, observation=None):
    missing_prefix = 'Missing observations: '
    if reason.startswith(missing_prefix):
        fields = reason[len(missing_prefix):].split(', ')
        return 'Ma’lumot yetishmaydi: ' + ', '.join(OBSERVATION_LABELS.get(field, field) for field in fields)
    label = FINDING_LABELS.get(reason, reason)
    if observation is None:
        return label
    if reason == 'Endocrine review' and observation.get('abnormal_tsh'):
        return f'TTG natijasida o‘zgarish qayd etilgan. {label}.'
    if reason in MEASURED_FINDINGS:
        field, name, unit = MEASURED_FINDINGS[reason]
        value = observation.get(field)
        if type(value) in (int, float):
            return f'{name} {value:g}{unit}. {label}.'
    if reason in PRESSURE_FINDINGS:
        systolic, diastolic = observation.get('systolic'), observation.get('diastolic')
        if systolic is not None and diastolic is not None:
            pressure = f'AQB {systolic:g}/{diastolic:g} mmHg'
            if reason == 'Hypertension with proteinuria':
                protein = observation.get('proteinuria')
                pressure += f', proteinuriya {protein if isinstance(protein, str) else "musbat"}'
            return f'{pressure}. {label}.'
    return label
