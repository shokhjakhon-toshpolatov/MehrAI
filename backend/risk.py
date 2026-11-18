"""Hackathon rules from the supplied brief, not a validated clinical guideline."""
import math

def evaluate(cohort: str, o: dict) -> dict:
    if cohort == 'POSTPARTUM':
        return {
            'risk_zone': 'REVIEW',
            'required_specialty': 'OBGYN',
            'risk_reasons': ['Tug‘ruqdan keyingi ko‘rikni mutaxassis baholaydi'],
        }
    red, yellow, missing = [], [], []
    specialty = 'OBGYN' if cohort == 'MATERNAL' else 'NEONATOLOGY'
    def value(key):
        v = o.get(key)
        if v is not None and (not isinstance(v, (int, float)) or isinstance(v, bool)):
            raise ValueError(f'{key} must be numeric')
        if v is not None and (not math.isfinite(v) or v < 0):
            raise ValueError(f'{key} must be a finite nonnegative number')
        return v
    if cohort == 'MATERNAL':
        sys, dia, hb, glucose = [value(k) for k in ('systolic', 'diastolic', 'hemoglobin', 'glucose')]
        baseline_sys, baseline_dia = value('baseline_systolic'), value('baseline_diastolic')
        protein = o.get('proteinuria')
        missing = [k for k in ('systolic','diastolic','hemoglobin','glucose','proteinuria') if o.get(k) is None]
        if protein not in (None, False, True, 'negative', '-', '+', '++', '+++'):
            missing.append('recognized proteinuria result')
        if (sys is not None and sys >= 160) or (dia is not None and dia >= 110): red.append('Severe hypertension')
        if ((sys is not None and sys >= 140) or (dia is not None and dia >= 90)) and protein in (True, '+', '++', '+++'): red.append('Hypertension with proteinuria')
        if hb is not None and hb < 70: red.append('Severe anemia')
        for key in ('bleeding', 'reduced_fetal_movement'):
            if o.get(key): red.append(key.replace('_', ' ').capitalize())
        if hb is not None and 70 <= hb < 110: yellow.append('Anemia requires clinician review')
        if (sys is not None and 130 <= sys < 160) or (dia is not None and 85 <= dia < 110): yellow.append('Elevated blood pressure')
        if (sys is not None and baseline_sys is not None and sys-baseline_sys >= 25) or (dia is not None and baseline_dia is not None and dia-baseline_dia >= 15): yellow.append('Blood pressure increased from baseline')
        if protein in (True, '+', '++', '+++'): yellow.append('Proteinuria requires review')
        if glucose is not None and glucose >= 5.1 or o.get('abnormal_tsh'):
            yellow.append('Endocrine review'); specialty = 'ENDOCRINOLOGY'
        if o.get('arrhythmia'):
            yellow.append('Cardiac review'); specialty = 'CARDIOLOGY'
        if red: specialty = 'OBGYN'
    elif cohort == 'NEONATAL':
        age, bilirubin, temp, spo2, loss = [value(k) for k in ('age_days','bilirubin','temperature','spo2','weight_loss')]
        missing = [k for k in ('age_days','bilirubin','temperature','spo2','weight_loss','feeding') if o.get(k) is None]
        if spo2 is not None and spo2 > 100: raise ValueError('SpO2 cannot exceed 100%')
        if loss is not None and loss > 100: raise ValueError('Weight loss cannot exceed 100%')
        if o.get('feeding') not in (None,'active','refused'):
            missing.append('recognized feeding assessment')
        if age is not None and age < 2:
            missing.append('age-specific neonatal assessment')
        if age is not None and not 0 <= age <= 28: raise ValueError('Neonatal age must be 0–28 days')
        if bilirubin is not None and bilirubin > 250: red.append('High bilirubin')
        if age is not None and age < 1 and o.get('jaundice'): red.append('Jaundice in first 24 hours')
        if temp is not None and (temp >= 38 or temp < 36): red.append('Abnormal neonatal temperature')
        if spo2 is not None and spo2 < 92: red.append('Low oxygen saturation')
        if o.get('grunting') or o.get('lethargy') or o.get('feeding') == 'refused': red.append('Neonatal danger sign')
        if bilirubin is not None and 170 <= bilirubin <= 250: yellow.append('Jaundice requires review')
        if loss is not None and loss >= 7: yellow.append('Weight loss requires review')
        if temp is not None and (36 <= temp < 36.5 or 37.5 < temp < 38): yellow.append('Temperature requires review')
        if spo2 is not None and 92 <= spo2 < 95: yellow.append('Oxygen saturation requires review')
        if o.get('umbilical_redness'): yellow.append('Umbilical redness')
    else: raise ValueError('Unknown cohort')
    zone = 'RED' if red else 'YELLOW' if yellow else 'REVIEW' if missing else 'GREEN'
    return {'risk_zone':zone, 'required_specialty':specialty if zone != 'GREEN' else None,
            'risk_reasons':red+yellow+([f'Missing observations: {", ".join(missing)}'] if missing else [])}
