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
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, Header, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from .risk import evaluate
from .seed import PATIENTS, DOCTORS

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
        if all_of(db,'Patient'): return
        for d in DOCTORS: put(db,'PractitionerRole',d['id'],d)
        for p in PATIENTS:
            put(db,'Patient',p['id'],p)
            put(db,'DispensaryRegistration',p['id'],{'id':p['id'],'patient':p['id'],'organization':p['clinic']})
            put(db,'RelatedPerson',f"family-{p['id']}",{'id':f"family-{p['id']}",'patient':p['id'],'name':p.get('mother_name','Family contact'),'telecom':[{'system':'phone','value':'+998930000000'}]})
            ingest(db,p['id'],{'id':f"seed-{p['id']}",**p['observation']})

def next_slot(db, doctor_id, after=None):
    slot = (after or now()).astimezone(TZ).replace(second=0,microsecond=0)
    slot = slot.replace(minute=0) + timedelta(hours=1)
    occupied = {a.get('start') for a in all_of(db,'Appointment') if a.get('practitioner')==doctor_id and a.get('status')!='cancelled'}
    for _ in range(100):
        if slot.hour < 9: slot = slot.replace(hour=9,minute=0)
        if slot.hour >= 17: slot = (slot+timedelta(days=1)).replace(hour=9,minute=0)
        if stamp(slot) not in occupied: return stamp(slot)
        slot += timedelta(minutes=30)
    raise HTTPException(409,'No available slot')

def ingest(db, patient_id, observation):
    patient,_ = get(db,'Patient',patient_id)
    oid = observation.get('id') or str(uuid4())
    risk = evaluate(patient['cohort_type'],observation)
    key = hashlib.sha256(f"{patient_id}:{oid}:{risk['risk_zone']}".encode()).hexdigest()
    duplicate = db.execute('SELECT case_id FROM idempotency WHERE key=?',(key,)).fetchone()
    if duplicate: return get(db,'Case',duplicate['case_id'])[0]
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
            case['status'] = 'PENDING_DOCTOR_ACK' if risk['risk_zone']=='RED' else 'REVIEW_REQUIRED' if risk['risk_zone']=='REVIEW' else 'APPOINTMENT_BOOKED'
            if risk['risk_zone']=='RED': case['escalation_deadline']=stamp(now()+timedelta(minutes=15))
            elif risk['risk_zone']=='YELLOW':
                aid = f'appointment-{patient_id}'
                old = db.execute('SELECT version FROM resources WHERE kind=? AND id=?',('Appointment',aid)).fetchone()
                version = old['version']+1 if old else 1
                appointment={'id':aid,'patient':patient_id,'practitioner':doctor['id'],'start':next_slot(db,doctor['id']),'status':'proposed'}
                put(db,'Appointment',aid,appointment,version)
                case.update(appointment_id=aid,appointment_time=appointment['start'],appointment_etag=f'W/"{version}"')
            sid = f'referral-{patient_id}'
            put(db,'ServiceRequest',sid,{'id':sid,'patient':patient_id,'practitioner':doctor['id'],'status':'active','specialty':specialty})
            case['service_request_id']=sid
        else: case['status']='UNASSIGNED_REVIEW'
    put(db,'Case',patient_id,case)
    db.execute('INSERT INTO idempotency VALUES(?,?)',(key,patient_id))
    if risk['risk_zone'] in ('RED','YELLOW'): queue_call(db,case,oid)
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
    call={'id':cid,'case_id':case['id'],'mode':'simulation','status':'QUEUED' if due>local else 'READY','scheduled_at':stamp(due), 'target_role':'RELATED_PERSON' if case['risk_zone']=='RED' else 'MOTHER_OF_NEWBORN' if case['cohort_type']=='NEONATAL' else 'PATIENT','attempts':0}
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
        if case.get('appointment_time') and case['status'] not in ('NO_SHOW_ALERTED','ATTENDED') and datetime.fromisoformat(case['appointment_time'])+timedelta(hours=2)<now():
            arrived=any(e.get('patient')==case['patient_id'] and e.get('appointment')==case.get('appointment_id') for e in all_of(db,'Encounter'))
            case['status']='ATTENDED' if arrived else 'NO_SHOW_ALERTED'
            case['nurse_notified']=not arrived
            put(db,'Case',case['id'],case)
    for call in all_of(db,'Call'):
        if call['status']=='QUEUED' and datetime.fromisoformat(call['scheduled_at'])<=now():
            call['status']='READY';put(db,'Call',call['id'],call)


async def worker():
    while True:
        with connect() as db:
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

app=FastAPI(title='DMED Perinatal — synthetic integration simulator',lifespan=lifespan)
CORS_ORIGINS = [origin.strip() for origin in os.getenv('CORS_ORIGINS','http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://localhost:8000,http://127.0.0.1:8000').split(',') if origin.strip()]
app.add_middleware(CORSMiddleware,allow_origins=CORS_ORIGINS,allow_methods=['*'],allow_headers=['*'],expose_headers=['ETag'])

@app.get('/api/registry')
def registry():
    with connect() as db: return {'mode':'mock','patients':all_of(db,'Patient'),'cases':all_of(db,'Case'),'doctors':all_of(db,'PractitionerRole'),'calls':all_of(db,'Call'),'audit':all_of(db,'AuditEvent')}

@app.post('/api/simulate/{scenario}')
def simulate(scenario:str):
    with connect() as db:
        if scenario=='fast-forward': return [escalate(db,c) for c in all_of(db,'Case') if c['status']=='PENDING_DOCTOR_ACK']
        if scenario not in ('maternal-red','neonatal-red'): raise HTTPException(404,'Unknown scenario')
        pid='p3' if scenario=='maternal-red' else 'p4'
        patient,_=get(db,'Patient',pid)
        obs={**patient['observation'],'id':str(uuid4())}
        obs.update({'systolic':165,'diastolic':110,'proteinuria':'++'} if pid=='p3' else {'bilirubin':295,'temperature':38.4})
        return ingest(db,pid,obs)

@app.post('/api/cases/{case_id}/{action}')
def case_action(case_id:str,action:str):
    with connect() as db:
        case,_=get(db,'Case',case_id)
        if action=='busy':
            if case['status']!='PENDING_DOCTOR_ACK': raise HTTPException(409,'Only a pending emergency can be handed over')
            result=escalate(db,case)
            audit(db,case_id,'busy','Case handed over; notification transport is simulated')
            return result
        if action=='call':
            if case['risk_zone'] not in ('RED','YELLOW'): raise HTTPException(409,'Outreach requires an assessed red or yellow case')
            result=queue_call(db,case)
            audit(db,case_id,'call','Simulated outreach queued; no external call placed')
            return result
        if action!='accept': raise HTTPException(404,'Unknown action')
        if case['status'] not in ('PENDING_DOCTOR_ACK','ESCALATED','APPOINTMENT_BOOKED','REVIEW_REQUIRED'): raise HTTPException(409,'Case cannot be accepted in current state')
        case.update(status='DOCTOR_ACCEPTED',accepted_at=stamp())
        put(db,'Case',case_id,case)
        audit(db,case_id,'accept','Case acknowledgment recorded')
        return case

class VoiceEvent(BaseModel):
    case_id:str
    intent:str
    event_id:str

@app.post('/webhooks/voicelab/status')
def voice_event(event:VoiceEvent):
    if event.intent not in ('CONFIRMED','RESCHEDULE_REQUESTED','NO_ANSWER'): raise HTTPException(422,'Unknown intent')
    with connect() as db:
        case,_=get(db,'Case',event.case_id)
        key=f'voice:{event.event_id}'
        if db.execute('SELECT 1 FROM idempotency WHERE key=?',(key,)).fetchone(): return case
        if event.intent in ('CONFIRMED','RESCHEDULE_REQUESTED'):
            if not case.get('appointment_id'): raise HTTPException(409,'Emergency cases cannot be converted into routine appointments')
            appointment,version=get(db,'Appointment',case['appointment_id'])
            if case['appointment_etag']!=f'W/"{version}"': raise HTTPException(412,'Appointment changed; refresh before applying voice response')
            if event.intent=='RESCHEDULE_REQUESTED': appointment['start']=next_slot(db,appointment['practitioner'],datetime.fromisoformat(appointment['start'])+timedelta(minutes=30))
            appointment['status']='booked'
            put(db,'Appointment',appointment['id'],appointment,version+1)
            case.update(status='PATIENT_CONFIRMED',appointment_time=appointment['start'],appointment_etag=f'W/"{version+1}"')
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
        if kind=='Observation':
            try: return ingest(db,payload['patient'].split('/')[-1],payload)
            except (KeyError,ValueError) as exc: raise HTTPException(422,str(exc))
        rid=payload.get('id') or str(uuid4())
        if db.execute('SELECT 1 FROM resources WHERE kind=? AND id=?',(kind,rid)).fetchone(): raise HTTPException(409,'Resource exists')
        payload={**payload,'id':rid}
        put(db,kind,rid,payload)
        response.headers['ETag']='W/"1"'
        return payload

@app.put('/dmed/v2/Appointment/{rid}')
def update_appointment(rid:str,payload:dict,response:Response,if_match:str|None=Header(None)):
    with connect() as db:
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
