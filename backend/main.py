"""Local, synthetic-data integration simulator. No calls leave this service."""
import asyncio
import hashlib
import json
import os
import sqlite3
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, Header, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from .risk import evaluate
from .explanations import explain_case
from .seed import PATIENTS, DOCTORS, POSTPARTUM_SAMPLE_ASSESSMENTS

DB = os.getenv('DMED_DB', str(Path(__file__).with_name('demo.sqlite3')))
TZ = ZoneInfo('Asia/Tashkent')

def now(): return datetime.now(timezone.utc)
def stamp(dt=None): return (dt or now()).isoformat()
@contextmanager
def connect():
    db = sqlite3.connect(DB, timeout=15)
    db.row_factory = sqlite3.Row
    try:
        with db:
            yield db
    finally:
        db.close()

def put(db, kind, rid, payload, version=1):
    if kind == 'Case': payload['updated_at'] = stamp()
    db.execute('INSERT OR REPLACE INTO resources VALUES(?,?,?,?)', (kind,rid,json.dumps(payload),version))

def get(db, kind, rid):
    r = db.execute('SELECT * FROM resources WHERE kind=? AND id=?',(kind,rid)).fetchone()
    if not r: raise HTTPException(404, f'{kind}/{rid} not found')
    return json.loads(r['payload']), r['version']

def all_of(db, kind):
    return [json.loads(r['payload']) for r in db.execute('SELECT payload FROM resources WHERE kind=? ORDER BY rowid',(kind,))]

def audit(db, case_id, action, detail, actor='local-operator'):
    event = {'id':str(uuid4()),'case_id':case_id,'action':action,'at':stamp(),
             'actor':actor,'mode':'mock','detail':detail}
    put(db,'AuditEvent',event['id'],event)
    return event


def init():
    with connect() as db:
        db.execute('CREATE TABLE IF NOT EXISTS resources(kind TEXT,id TEXT,payload TEXT,version INTEGER,PRIMARY KEY(kind,id))')
        db.execute('CREATE TABLE IF NOT EXISTS idempotency(key TEXT PRIMARY KEY, case_id TEXT)')
        db.execute('BEGIN IMMEDIATE')
        existing = {p['id']: p for p in all_of(db, 'Patient')}
        if existing:
            for kind in ('Patient', 'RelatedPerson'):
                for record in all_of(db, kind):
                    if record.get('telecom'):
                        _, version = get(db, kind, record['id'])
                        record['telecom'] = []
                        put(db, kind, record['id'], record, version + 1)
            retire_legacy_slots(db)
            for case in all_of(db, 'Case'):
                if (case['risk_zone'] == 'YELLOW' and case.get('referral_status') == 'AWAITING_FACILITY'
                        and not case.get('referral_approved_at')):
                    case.update(status='REFERRAL_REVIEW', referral_status='AWAITING_CLINICIAN')
                    referral_id = case.get('service_request_id')
                    if referral_id:
                        referral, version = get(db, 'ServiceRequest', referral_id)
                        referral['status'] = 'draft'
                        put(db, 'ServiceRequest', referral_id, referral, version + 1)
                    put(db, 'Case', case['id'], case)
        else:
            for doctor in DOCTORS:
                put(db, 'PractitionerRole', doctor['id'], doctor)
        for sample in PATIENTS:
            patient_id = sample['id']
            if patient_id not in existing:
                put(db, 'Patient', patient_id, dict(sample))
                put(db, 'DispensaryRegistration', patient_id, {
                    'id': patient_id, 'patient': patient_id, 'organization': sample['clinic'],
                })
                family_id = f'family-{patient_id}'
                put(db, 'RelatedPerson', family_id, {
                    'id': family_id, 'patient': patient_id,
                    'name': sample.get('mother_name', 'Family contact'), 'telecom': [],
                })
                assessment = POSTPARTUM_SAMPLE_ASSESSMENTS.get(patient_id)
                if assessment:
                    put(db, 'PostpartumAssessment', patient_id, {**assessment, 'assessed_at': stamp(now() - timedelta(days=1))})
                ingest(db, patient_id, {'id': f'seed-{patient_id}', **sample['observation']})
            elif sample.get('mother_id'):
                patient, version = get(db, 'Patient', patient_id)
                if not patient.get('mother_id'):
                    patient['mother_id'] = sample['mother_id']
                    put(db, 'Patient', patient_id, patient, version + 1)


def retire_legacy_slots(db):
    """Move generated sample slots back to the referral queue."""
    for case in all_of(db, 'Case'):
        if case['risk_zone'] != 'YELLOW' or not case.get('appointment_id'):
            continue
        visit, version = get(db, 'Appointment', case['appointment_id'])
        if visit.get('source') == 'facility' or case['status'] == 'ATTENDED':
            continue
        visit['status'] = 'cancelled'
        put(db, 'Appointment', visit['id'], visit, version + 1)
        for key in ('appointment_id', 'appointment_time', 'appointment_etag', 'nurse_notified'):
            case.pop(key, None)
        case.update(status='REFERRED', referral_status='AWAITING_FACILITY')
        put(db, 'Case', case['id'], case)
        audit(db, case['id'], 'referral', 'Legacy generated slot retired')

def ingest(db, patient_id, observation):
    patient,_ = get(db,'Patient',patient_id)
    oid = observation.get('id') or str(uuid4())
    risk = evaluate(patient['cohort_type'], observation)
    assessment = None
    if patient['cohort_type'] == 'POSTPARTUM':
        stored = db.execute("SELECT payload FROM resources WHERE kind='PostpartumAssessment' AND id=?", (patient_id,)).fetchone()
        if stored:
            assessment = json.loads(stored['payload'])
            risk.update(risk_zone=assessment['zone'], risk_reasons=[assessment['reason']])
    key = hashlib.sha256(f"{patient_id}:{oid}:{risk['risk_zone']}".encode()).hexdigest()
    duplicate = db.execute('SELECT case_id FROM idempotency WHERE key=?',(key,)).fetchone()
    if duplicate: return get(db,'Case',duplicate['case_id'])[0]
    prior = next((row for row in all_of(db, 'Case') if row['id'] == patient_id), None)
    preserve_visit = (
        prior and prior.get('appointment_id') and risk['risk_zone'] == 'YELLOW'
        and prior.get('required_specialty') == risk['required_specialty']
    )
    for task in all_of(db, 'Call'):
        if task['case_id'] == patient_id and task['status'] in ('READY', 'QUEUED', 'NO_ANSWER', 'RESCHEDULE_REQUESTED'):
            task['status'] = 'SUPERSEDED'
            put(db, 'Call', task['id'], task)
    if not preserve_visit:
        for appointment in all_of(db, 'Appointment'):
            if appointment['patient'] == patient_id and appointment['status'] in ('proposed', 'booked', 'untimed', 'reschedule_requested'):
                _, version = get(db, 'Appointment', appointment['id'])
                appointment['status'] = 'cancelled'
                put(db, 'Appointment', appointment['id'], appointment, version + 1)
    put(db,'Observation',oid,{'id':oid,'patient':patient_id,**observation})
    case = {'id':patient_id,'patient_id':patient_id,'cohort_type':patient['cohort_type'],**risk,
            'observation':observation,'created_at':stamp(),'status':'ROUTINE','assigned_practitioner_id':None}
    if risk['risk_zone'] in ('RED','YELLOW','REVIEW'):
        specialty = risk['required_specialty']
        candidates = [d for d in all_of(db,'PractitionerRole') if specialty in d.get('specialties',[d['specialty']])]
        candidates.sort(key=lambda d:(d['duty_role']!='primary_navbatchi',d['id']))
        doctor = candidates[0] if candidates else None
        if doctor:
            case['assigned_practitioner_id'] = doctor['id']
            case['status'] = {
                'RED': 'PENDING_DOCTOR_ACK', 'REVIEW': 'REVIEW_REQUIRED', 'YELLOW': 'REFERRAL_REVIEW',
            }[risk['risk_zone']]
            if risk['risk_zone'] == 'RED':
                case['escalation_deadline'] = stamp(now() + timedelta(minutes=15))
            elif risk['risk_zone'] == 'YELLOW':
                case['referral_status'] = 'AWAITING_CLINICIAN'
                if preserve_visit:
                    for key in ('appointment_id', 'appointment_time', 'appointment_etag', 'referral_status', 'referral_approved_at', 'referral_approved_by', 'status'):
                        if key in prior:
                            case[key] = prior[key]
            sid = f'referral-{patient_id}'
            referral_state = 'draft' if case.get('referral_status') == 'AWAITING_CLINICIAN' else 'active'
            put(db, 'ServiceRequest', sid, {
                'id': sid, 'patient': patient_id, 'practitioner': doctor['id'],
                'status': referral_state, 'specialty': specialty,
            })
            case['service_request_id']=sid
        else: case['status']='UNASSIGNED_REVIEW'
    if patient['cohort_type'] == 'POSTPARTUM':
        if assessment:
            case.update(assessment_at=assessment['assessed_at'],
                        assessed_by=assessment['practitioner_id'],
                        assigned_practitioner_id=assessment['practitioner_id'])
        case['status'] = 'POSTPARTUM_FOLLOW_UP'
        case['follow_up_at'] = (prior or {}).get('follow_up_at') or stamp(now() + timedelta(days=1))
        if prior and prior.get('follow_up_completed_at'):
            case['status'] = 'POSTPARTUM_FOLLOWED_UP'
            case['follow_up_completed_at'] = prior['follow_up_completed_at']
    put(db,'Case',patient_id,case)
    db.execute('INSERT INTO idempotency VALUES(?,?)',(key,patient_id))
    if preserve_visit and case.get('referral_approved_at') and case['status'] == 'VISIT_PROPOSED':
        queue_call(db, case, oid)
    return case

def queue_call(db,case,observation_id='manual'):
    cid = hashlib.sha256(f"{case['id']}:{observation_id}:call".encode()).hexdigest()[:20]
    existing=db.execute('SELECT payload FROM resources WHERE kind=? AND id=?',('Call',cid)).fetchone()
    if existing: return json.loads(existing['payload'])
    local=now().astimezone(TZ)
    due=local
    if case['risk_zone']!='RED' and (local.hour>=21 or (local.hour,local.minute)<(8,30)):
        due=local.replace(hour=8,minute=30,second=0,microsecond=0)
        if due<local: due+=timedelta(days=1)
    call={'id':cid,'case_id':case['id'],'mode':'simulation','status':'QUEUED' if due>local else 'READY','scheduled_at':stamp(due), 'target_role':'RELATED_PERSON' if case['risk_zone']=='RED' else 'MOTHER_OF_NEWBORN' if case['cohort_type']=='NEONATAL' else 'PATIENT','attempts':0,'case_version':case['created_at'],'appointment_id':case.get('appointment_id')}
    put(db,'Call',cid,call)
    return call

def escalate(db,case):
    if case['status']!='PENDING_DOCTOR_ACK': return case
    doctors=[d for d in all_of(db,'PractitionerRole') if d['specialty']==case['required_specialty'] and d['duty_role']=='backup_navbatchi']
    case.update(status='ESCALATED',department_head_notified=True,escalated_at=stamp())
    if doctors: case['assigned_practitioner_id']=doctors[0]['id']
    else: case['escalation_note']='No backup in roster; department head review required'
    put(db,'Case',case['id'],case)
    return case

def process_due(db):
    for case in all_of(db,'Case'):
        if case['status']=='PENDING_DOCTOR_ACK' and datetime.fromisoformat(case['escalation_deadline'])<=now(): escalate(db,case)
        if not case.get('appointment_id') or case['status'] in ('NO_SHOW_ALERTED', 'ATTENDED'):
            continue
        visit, _ = get(db, 'Appointment', case['appointment_id'])
        if visit.get('source') != 'facility' or visit['status'] not in ('booked', 'untimed'):
            continue
        arrived = any(
            e.get('patient') == case['patient_id'] and e.get('appointment') == visit['id']
            for e in all_of(db, 'Encounter')
        )
        overdue = (
            visit['status'] == 'booked' and visit.get('start')
            and datetime.fromisoformat(visit['start']) + timedelta(hours=2) <= now()
        )
        if arrived or overdue:
            case['status'] = 'ATTENDED' if arrived else 'NO_SHOW_ALERTED'
            case['follow_up_required'] = not arrived
            put(db, 'Case', case['id'], case)
            audit(db, case['id'], 'attendance', case['status'])
    for call in all_of(db,'Call'):
        if call['status']=='QUEUED' and datetime.fromisoformat(call['scheduled_at'])<=now():
            call['status']='READY';put(db,'Call',call['id'],call)


async def worker():
    while True:
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            process_due(db)
        await asyncio.sleep(1)

@asynccontextmanager
async def lifespan(app):
    if os.getenv('DMED_MODE','mock')!='mock': raise RuntimeError('Only mock mode implemented; sandbox requires verified API contract and credentials')
    init()
    task=asyncio.create_task(worker())
    yield
    task.cancel()
    try: await task
    except asyncio.CancelledError: pass

app=FastAPI(title='MehrAI — sample perinatal workspace',lifespan=lifespan)
CORS_ORIGINS = [origin.strip() for origin in os.getenv('CORS_ORIGINS','http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://localhost:8000,http://127.0.0.1:8000').split(',') if origin.strip()]
app.add_middleware(CORSMiddleware,allow_origins=CORS_ORIGINS,allow_methods=['*'],allow_headers=['*'],expose_headers=['ETag'])

@app.get('/api/registry')
def registry():
    with connect() as db: return {'mode':'mock','patients':[{k: v for k, v in p.items() if k != 'telecom'} for p in all_of(db,'Patient')],'cases':all_of(db,'Case'),'doctors':all_of(db,'PractitionerRole'),'calls':all_of(db,'Call'),'appointments':all_of(db,'Appointment'),'audit':all_of(db,'AuditEvent')}

@app.post('/api/simulate/{scenario}')
def simulate(scenario:str):
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        if scenario=='fast-forward': return [escalate(db,c) for c in all_of(db,'Case') if c['status']=='PENDING_DOCTOR_ACK']
        if scenario not in ('maternal-red','neonatal-red'): raise HTTPException(404,'Unknown scenario')
        pid='p3' if scenario=='maternal-red' else 'p4'
        patient,_=get(db,'Patient',pid)
        obs={**patient['observation'],'id':str(uuid4())}
        obs.update({'systolic':165,'diastolic':110,'proteinuria':'++'} if pid=='p3' else {'bilirubin':295,'temperature':38.4})
        return ingest(db,pid,obs)

@app.post('/api/cases/{case_id}/explanation')
def case_explanation(case_id: str):
    with connect() as db:
        case, _ = get(db, 'Case', case_id)
    return explain_case(case)

class ReferralApproval(BaseModel):
    practitioner_id: str

@app.post('/api/referrals/{case_id}/approve')
def approve_referral(case_id: str, approval: ReferralApproval):
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        case, _ = get(db, 'Case', case_id)
        if case['risk_zone'] != 'YELLOW' or not case.get('service_request_id'):
            raise HTTPException(409, 'Faqat rejali yo‘llanma tasdiqlanishi mumkin')
        if approval.practitioner_id != case.get('assigned_practitioner_id'):
            raise HTTPException(409, 'Yo‘llanmani mas’ul shifokor tasdiqlaydi')
        if case.get('referral_approved_at'):
            return case
        referral, version = get(db, 'ServiceRequest', case['service_request_id'])
        referral['status'] = 'active'
        put(db, 'ServiceRequest', referral['id'], referral, version + 1)
        case.update(referral_approved_at=stamp(), referral_approved_by=approval.practitioner_id)
        if case['referral_status'] == 'AWAITING_CLINICIAN':
            case.update(status='REFERRED', referral_status='AWAITING_FACILITY')
        put(db, 'Case', case_id, case)
        audit(db, case_id, 'referral_approved', 'Sample clinician approved referral', actor=approval.practitioner_id)
        if case['status'] == 'VISIT_PROPOSED':
            queue_call(db, case, str(uuid4()))
        return case

def require_planned_contact_approval(case):
    if case['risk_zone'] == 'YELLOW' and (
        not case.get('referral_approved_at') or not case.get('appointment_id')
        or case.get('referral_status') == 'RESCHEDULE_REQUESTED'
    ):
        raise HTTPException(409, 'Avval yo‘llanmani tasdiqlang va muassasa tashrifini qayd eting')

@app.post('/api/cases/{case_id}/{action}')
def case_action(case_id:str,action:str):
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        case,_=get(db,'Case',case_id)
        if action=='busy':
            if case['status']!='PENDING_DOCTOR_ACK': raise HTTPException(409,'Only a pending emergency can be handed over')
            result=escalate(db,case)
            audit(db,case_id,'busy','Case handed over; notification transport is simulated')
            return result
        if action == 'postpartum-follow-up':
            if case['cohort_type'] != 'POSTPARTUM':
                raise HTTPException(409, 'Bu tug‘ruqdan keyingi kuzatuv yozuvi emas')
            if case.get('follow_up_completed_at'):
                return case
            case.update(status='POSTPARTUM_FOLLOWED_UP', follow_up_completed_at=stamp())
            put(db, 'Case', case_id, case)
            audit(db, case_id, 'postpartum_follow_up', 'Staff recorded the postpartum follow-up')
            return case
        if action == 'call':
            require_planned_contact_approval(case)
            for task in all_of(db, 'Call'):
                if (task['case_id'] == case_id and task.get('case_version') == case['created_at']
                        and task.get('appointment_id') == case.get('appointment_id')
                        and task['status'] in ('READY', 'QUEUED', 'NO_ANSWER')):
                    return task
            result = queue_call(db, case, str(uuid4()))
            audit(db, case_id, 'call', 'Manual contact task created; no external call placed')
            return result
        if action!='accept': raise HTTPException(404,'Unknown action')
        if case['status'] not in ('PENDING_DOCTOR_ACK','ESCALATED','REVIEW_REQUIRED'): raise HTTPException(409,'Case cannot be accepted in current state')
        case.update(status='DOCTOR_ACCEPTED',accepted_at=stamp())
        put(db,'Case',case_id,case)
        audit(db,case_id,'accept','Case acknowledgment recorded')
        return case

class FacilityResponse(BaseModel):
    mode: Literal['timed', 'untimed']
    facility: str = Field(min_length=1, max_length=160)
    practitioner_id: str | None = None
    start: datetime | None = None
    confirmed: bool = False

@app.post('/api/referrals/{case_id}/response')
def record_facility_response(case_id: str, response: FacilityResponse):
    facility = response.facility.strip()
    if not facility:
        raise HTTPException(422, 'Muassasa nomini kiriting')
    start = response.start
    if response.mode == 'timed':
        if not start or start.utcoffset() is None:
            raise HTTPException(422, 'Qabul va vaqt mintaqasini kiriting')
        if not response.practitioner_id or start <= now():
            raise HTTPException(422, 'Qabul shifokori va kelajakdagi vaqtni kiriting')
    elif start or response.confirmed:
        raise HTTPException(422, 'Vaqtsiz tashrif uchun sana yoki tasdiq kiritilmaydi')
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        case, _ = get(db, 'Case', case_id)
        if case['risk_zone'] != 'YELLOW' or not case.get('referral_approved_at'):
            raise HTTPException(409, 'Avval mas’ul shifokor yo‘llanmani tasdiqlashi kerak')
        if case.get('referral_status') not in ('AWAITING_FACILITY', 'RESCHEDULE_REQUESTED'):
            raise HTTPException(409, 'Muassasa javobi allaqachon qayd etilgan')
        if response.practitioner_id:
            get(db, 'PractitionerRole', response.practitioner_id)
        if case.get('appointment_id'):
            old, version = get(db, 'Appointment', case['appointment_id'])
            old['status'] = 'cancelled'
            put(db, 'Appointment', old['id'], old, version + 1)
        for task in all_of(db, 'Call'):
            if task['case_id'] == case_id and task['status'] in ('READY', 'QUEUED', 'NO_ANSWER'):
                task['status'] = 'SUPERSEDED'
                put(db, 'Call', task['id'], task)
        visit_id = str(uuid4())
        visit = {
            'id': visit_id, 'patient': case_id, 'practitioner': response.practitioner_id,
            'facility': facility, 'mode': response.mode, 'source': 'facility',
            'status': 'untimed' if response.mode == 'untimed' else 'booked' if response.confirmed else 'proposed',
        }
        if start:
            visit['start'] = stamp(start)
        put(db, 'Appointment', visit_id, visit)
        case.pop('follow_up_required', None)
        case.update(appointment_id=visit_id, appointment_time=visit.get('start'), appointment_etag='W/"1"',
                    referral_status='FACILITY_RESPONDED',
                    status={'untimed': 'VISIT_UNTIMED', 'booked': 'PATIENT_CONFIRMED', 'proposed': 'VISIT_PROPOSED'}[visit['status']])
        put(db, 'Case', case_id, case)
        if visit['status'] == 'proposed':
            queue_call(db, case, visit_id)
        audit(db, case_id, 'facility_response', visit['status'])
        return visit

@app.post('/api/visits/{visit_id}/attended')
def record_attendance(visit_id: str):
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        visit, _ = get(db, 'Appointment', visit_id)
        case, _ = get(db, 'Case', visit['patient'])
        if case.get('appointment_id') != visit_id or visit['status'] not in ('booked', 'untimed', 'proposed'):
            raise HTTPException(409, 'Joriy tashrifni tanlang')
        if case['status'] == 'ATTENDED':
            return case
        encounter_id = f'attendance-{visit_id}'
        put(db, 'Encounter', encounter_id, {
            'id': encounter_id, 'patient': case['id'], 'appointment': visit_id,
            'status': 'finished', 'recorded_at': stamp(),
        })
        case.update(status='ATTENDED', follow_up_required=False)
        put(db, 'Case', case['id'], case)
        audit(db, case['id'], 'attendance', 'ATTENDED')
        return case

def apply_appointment_outcome(db, case, outcome):
    require_planned_contact_approval(case)
    if case['risk_zone'] != 'YELLOW' or not case.get('appointment_id'):
        raise HTTPException(409, 'Bu holatda rejali qabul mavjud emas')
    visit, version = get(db, 'Appointment', case['appointment_id'])
    if case['appointment_etag'] != f'W/"{version}"':
        raise HTTPException(412, 'Qabul o‘zgargan. Joriy yozuvni tekshiring.')
    if (visit.get('source') != 'facility' or not visit.get('start')
            or visit['status'] not in ('proposed', 'booked') or case['status'] == 'ATTENDED'):
        raise HTTPException(409, 'Joriy qabul uchun bu natijani qayd etib bo‘lmaydi')
    if outcome == 'CONFIRMED':
        if datetime.fromisoformat(visit['start']) <= now():
            raise HTTPException(409, 'Qabul vaqti o‘tgan')
        visit['status'] = 'booked'
        case['status'] = 'PATIENT_CONFIRMED'
    else:
        visit['status'] = 'reschedule_requested'
        case.update(status='REFERRED', referral_status='RESCHEDULE_REQUESTED', appointment_time=None)
    put(db, 'Appointment', visit['id'], visit, version + 1)
    case['appointment_etag'] = f'W/"{version + 1}"'
    put(db, 'Case', case['id'], case)

class OutreachOutcome(BaseModel):
    outcome: Literal['REACHED', 'CONFIRMED', 'RESCHEDULE_REQUESTED', 'NO_ANSWER']
    attempt_id: str

@app.post('/api/outreach/{call_id}/outcome')
def record_outreach(call_id: str, attempt: OutreachOutcome):
    """Record a staff-reported result against a sample outreach task."""
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        call, _ = get(db, 'Call', call_id)
        case, _ = get(db, 'Case', call['case_id'])
        key = f'outreach:{call_id}:{attempt.attempt_id}'
        if db.execute('SELECT 1 FROM idempotency WHERE key=?', (key,)).fetchone():
            return call
        require_planned_contact_approval(case)
        if call['status'] not in ('READY', 'QUEUED', 'NO_ANSWER'):
            raise HTTPException(409, 'Aloqa vazifasi yakunlangan')
        if call.get('case_version') and call['case_version'] != case['created_at']:
            raise HTTPException(409, 'Yangi kuzatuv kiritilgan. Joriy aloqa vazifasini oching.')
        if attempt.outcome in ('CONFIRMED', 'RESCHEDULE_REQUESTED'):
            if call.get('appointment_id') != case.get('appointment_id'):
                raise HTTPException(409, 'Bu aloqa vazifasi joriy qabulga tegishli emas')
            apply_appointment_outcome(db, case, attempt.outcome)
        call.update(status=attempt.outcome, attempts=call['attempts']+1, recorded_at=stamp(), mode='manual')
        put(db, 'Call', call_id, call)
        audit(db, case['id'], 'outreach', attempt.outcome)
        db.execute('INSERT INTO idempotency VALUES(?,?)', (key, case['id']))
        return call

class VoiceEvent(BaseModel):
    case_id:str
    intent:str
    event_id:str

@app.post('/webhooks/voicelab/status')
def voice_event(event:VoiceEvent):
    if event.intent not in ('CONFIRMED','RESCHEDULE_REQUESTED','NO_ANSWER'): raise HTTPException(422,'Unknown intent')
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        case,_=get(db,'Case',event.case_id)
        key=f'voice:{event.event_id}'
        if db.execute('SELECT 1 FROM idempotency WHERE key=?',(key,)).fetchone(): return case
        require_planned_contact_approval(case)
        if event.intent in ('CONFIRMED','RESCHEDULE_REQUESTED'):
            apply_appointment_outcome(db, case, event.intent)
        else:
            case['unanswered_attempts']=case.get('unanswered_attempts',0)+1
            if case['unanswered_attempts']>=2: case.update(nurse_notified=True,family_contact_queued=True)
        put(db,'VoiceLog',event.event_id,{**event.model_dump(),'created_at':stamp(),'mode':'simulation'})
        put(db,'Case',case['id'],case)
        db.execute('INSERT INTO idempotency VALUES(?,?)',(key,case['id']))
        return case

KINDS={'Patient','RelatedPerson','Observation','Condition','DispensaryRegistration','PractitionerRole','ServiceRequest','Appointment','Encounter'}
@app.get('/dmed/v2/{kind}')
def list_resources(kind:str,patient:str|None=None,practitioner:str|None=None,organization:str|None=None,specialty:str|None=None):
    if kind not in KINDS: raise HTTPException(404,'Unknown resource')
    with connect() as db:
        rows=all_of(db,kind)
        for field,value in [('patient',patient),('practitioner',practitioner),('organization',organization),('specialty',specialty)]:
            if value is not None: rows=[r for r in rows if r.get(field)==value.split('/')[-1] or r.get(field)==value]
        return {'resourceType':'Bundle','type':'searchset','total':len(rows),'entry':[{'resource':r} for r in rows]}

@app.get('/dmed/v2/{kind}/{rid}')
def get_resource(kind:str,rid:str,response:Response):
    if kind not in KINDS: raise HTTPException(404,'Unknown resource')
    with connect() as db:
        payload,version=get(db,kind,rid)
        response.headers['ETag']=f'W/"{version}"'
        return payload

@app.post('/dmed/v2/{kind}')
def create_resource(kind:str,payload:dict,response:Response):
    if kind not in {'Observation','ServiceRequest','Appointment','Encounter'}: raise HTTPException(405,'Unsupported create')
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        if kind=='Observation':
            try: return ingest(db,payload['patient'].split('/')[-1],payload)
            except (KeyError,ValueError) as exc: raise HTTPException(422,str(exc))
        if kind == 'Appointment':
            patient_id = payload.get('patient', '')
            if not isinstance(patient_id, str) or not patient_id:
                raise HTTPException(422, 'Bemor identifikatori kerak')
            case = db.execute("SELECT 1 FROM resources WHERE kind='Case' AND id=?", (patient_id.split('/')[-1],)).fetchone()
            if case:
                raise HTTPException(409, 'Boshqariladigan holat uchun muassasa javobi orqali qabulni yozing')
        rid=payload.get('id') or str(uuid4())
        if db.execute('SELECT 1 FROM resources WHERE kind=? AND id=?',(kind,rid)).fetchone(): raise HTTPException(409,'Resource exists')
        payload={**payload,'id':rid}
        put(db,kind,rid,payload)
        response.headers['ETag']='W/"1"'
        return payload

@app.put('/dmed/v2/Appointment/{rid}')
def update_appointment(rid:str,payload:dict,response:Response,if_match:str|None=Header(None)):
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        old,version=get(db,'Appointment',rid)
        if if_match!=f'W/"{version}"': raise HTTPException(412,'If-Match must match the current ETag')
        updated={**old,**payload,'id':rid}
        put(db,'Appointment',rid,updated,version+1)
        response.headers['ETag']=f'W/"{version+1}"'
        return updated


# Mount last so API routes keep precedence; build the UI before starting the server.
FRONTEND_OUTPUT = Path(__file__).resolve().parent.parent / 'out'
if FRONTEND_OUTPUT.is_dir():
    from fastapi.staticfiles import StaticFiles
    app.mount('/', StaticFiles(directory=str(FRONTEND_OUTPUT), html=True), name='frontend')
