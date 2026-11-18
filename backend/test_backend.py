import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient
from . import main
from .risk import evaluate

class BackendTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        main.DB=str(Path(self.tmp.name)/'test.db')
        self.client=TestClient(main.app)
        self.client.__enter__()
    def tearDown(self):
        self.client.__exit__(None,None,None)
        self.tmp.cleanup()
    def facility_visit(self, case_id='p2', *, confirmed=False, mode='timed'):
        from datetime import timedelta
        payload = {'mode': mode, 'facility': 'Namuna poliklinikasi', 'practitioner_id': 'd1', 'confirmed': confirmed}
        if mode == 'timed':
            payload['start'] = main.stamp(main.now() + timedelta(days=1))
        response = self.client.post(f'/api/referrals/{case_id}/response', json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_manual_outreach_keeps_rescheduling_in_the_referral_queue(self):
        original = self.facility_visit()
        data = self.client.get('/api/registry').json()
        call = next(c for c in data['calls'] if c['case_id'] == 'p2')
        path = f"/api/outreach/{call['id']}/outcome"
        request = {'outcome': 'RESCHEDULE_REQUESTED', 'attempt_id': 'a1'}
        self.assertEqual(self.client.post(path, json=request).json()['attempts'], 1)
        self.assertEqual(self.client.post(path, json=request).json()['attempts'], 1)
        updated = self.client.get(f"/dmed/v2/Appointment/{original['id']}").json()
        self.assertEqual(updated['status'], 'reschedule_requested')
        self.assertEqual(updated['start'], original['start'])
        replacement = self.facility_visit(confirmed=True)
        self.assertNotEqual(replacement['id'], original['id'])
        self.assertEqual(replacement['practitioner'], 'd1')
        registry = self.client.get('/api/registry').json()
        self.assertEqual(next(c for c in registry['cases'] if c['id'] == 'p2')['assigned_practitioner_id'], 'd3')

    def test_new_emergency_supersedes_old_outreach_and_appointment(self):
        visit = self.facility_visit('p4')
        call = next(c for c in self.client.get('/api/registry').json()['calls'] if c['case_id'] == 'p4')
        self.client.post('/api/simulate/neonatal-red')
        response = self.client.post(f"/api/outreach/{call['id']}/outcome", json={'outcome':'CONFIRMED','attempt_id':'stale'})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.client.get(f"/dmed/v2/Appointment/{visit['id']}").json()['status'], 'cancelled')

    def test_untimed_visit_has_no_slot_and_can_record_attendance(self):
        visit = self.facility_visit('p4', mode='untimed')
        self.assertNotIn('start', visit)
        with main.connect() as db:
            main.process_due(db)
            self.assertEqual(main.get(db, 'Case', 'p4')[0]['status'], 'VISIT_UNTIMED')
        self.assertEqual(self.client.post(f"/api/visits/{visit['id']}/attended").json()['status'], 'ATTENDED')

    def test_contact_can_be_logged_without_exposing_phone_fields(self):
        first = self.client.post('/api/cases/p1/call').json()
        self.assertEqual(first['target_role'], 'PATIENT')
        self.assertEqual(first['id'], self.client.post('/api/cases/p1/call').json()['id'])
        result = self.client.post(f"/api/outreach/{first['id']}/outcome", json={'outcome':'REACHED','attempt_id':'first'})
        self.assertEqual(result.json()['status'], 'REACHED')
        self.assertTrue(all('telecom' not in p for p in self.client.get('/api/registry').json()['patients']))
        self.assertNotEqual(first['id'], self.client.post('/api/cases/p1/call').json()['id'])

    def test_postpartum_follow_up_is_linked_and_independent(self):
        data = self.client.get('/api/registry').json()
        patients = {p['id']: p for p in data['patients']}
        self.assertEqual(patients['p4']['mother_id'], 'p5')
        self.assertEqual(patients['p5']['cohort_type'], 'POSTPARTUM')
        self.assertEqual(evaluate('POSTPARTUM', {'systolic': 180, 'reduced_fetal_movement': True})['risk_zone'], 'REVIEW')
        self.assertEqual(self.client.post('/api/cases/p4/postpartum-follow-up').status_code, 409)
        complete = self.client.post('/api/cases/p5/postpartum-follow-up').json()
        self.assertEqual(complete['status'], 'POSTPARTUM_FOLLOWED_UP')
        self.assertEqual(self.client.post('/api/cases/p5/postpartum-follow-up').json(), complete)
        main.init()
        refreshed = {c['id']: c for c in self.client.get('/api/registry').json()['cases']}
        self.assertEqual(refreshed['p5']['follow_up_completed_at'], complete['follow_up_completed_at'])
        self.assertEqual(refreshed['p4']['referral_status'], 'AWAITING_FACILITY')

    def test_postpartum_sample_assessment_does_not_complete_follow_up(self):
        data = self.client.get('/api/registry').json()
        cases = {record['id']: record for record in data['cases']}
        patients = {record['id']: record for record in data['patients']}
        self.assertEqual(cases['p5']['risk_zone'], 'REVIEW')
        self.assertEqual(cases['p6']['risk_zone'], 'GREEN')
        self.assertEqual(cases['p6']['assessed_by'], 'd1')
        self.assertIn('assessment_at', cases['p6'])
        self.assertEqual(cases['p6']['status'], 'POSTPARTUM_FOLLOW_UP')
        self.assertEqual(patients['p7']['mother_id'], 'p6')
        self.assertEqual(cases['p7']['status'], 'ROUTINE')

    def test_seed_and_routing(self):
        data=self.client.get('/api/registry').json()
        cases={c['id']:c for c in data['cases']}
        self.assertEqual([cases[f'p{i}']['risk_zone'] for i in range(1,5)],['GREEN','YELLOW','RED','YELLOW'])
        self.assertEqual(cases['p2']['assigned_practitioner_id'],'d3')
        self.assertEqual(cases['p2']['referral_status'],'AWAITING_FACILITY')
        self.assertEqual(data['appointments'],[])
        self.assertEqual(cases['p4']['assigned_practitioner_id'],'d4')
    def test_red_escalates_but_accepted_does_not(self):
        self.client.post('/api/simulate/fast-forward')
        c={c['id']:c for c in self.client.get('/api/registry').json()['cases']}['p3']
        self.assertEqual(c['assigned_practitioner_id'],'d2')
        self.client.post('/api/cases/p3/accept')
        self.assertEqual(self.client.post('/api/simulate/fast-forward').json(),[])
    def test_neonatal_emergency_and_no_fake_backup(self):
        self.assertEqual(self.client.post('/api/simulate/neonatal-red').json()['risk_zone'],'RED')
        c=self.client.post('/api/cases/p4/busy').json()
        self.assertTrue(c['department_head_notified'])
        self.assertEqual(c['assigned_practitioner_id'],'d4')
    def test_optimistic_lock(self):
        url='/dmed/v2/Appointment/' + self.facility_visit()['id']
        r=self.client.get(url)
        self.assertEqual(self.client.put(url,json={'status':'booked'}).status_code,412)
        self.assertEqual(self.client.put(url,json={'status':'booked'},headers={'If-Match':r.headers['etag']}).status_code,200)
        self.assertEqual(self.client.put(url,json={'status':'cancelled'},headers={'If-Match':r.headers['etag']}).status_code,412)
    def test_duplicate_observation_does_not_duplicate_calls(self):
        p=main.PATIENTS[1]
        payload={'patient':'p2','id':'same-observation',**p['observation']}
        self.client.post('/dmed/v2/Observation',json=payload)
        before=self.client.get('/api/registry').json()
        self.client.post('/dmed/v2/Observation',json=payload)
        after=self.client.get('/api/registry').json()
        self.assertEqual(len(before['calls']),len(after['calls']))
    def test_voice_idempotency_and_fallback(self):
        event={'case_id':'p2','intent':'NO_ANSWER','event_id':'first'}
        self.client.post('/webhooks/voicelab/status',json=event)
        r=self.client.post('/webhooks/voicelab/status',json=event).json()
        self.assertEqual(r['unanswered_attempts'],1)
        event['event_id']='second'
        self.assertTrue(self.client.post('/webhooks/voicelab/status',json=event).json()['nurse_notified'])
    def test_voice_confirm_and_reschedule(self):
        visit = self.facility_visit()
        event={'case_id':'p2','intent':'CONFIRMED','event_id':'confirm'}
        r=self.client.post('/webhooks/voicelab/status',json=event).json()
        self.assertEqual(r['status'],'PATIENT_CONFIRMED')
        event.update(intent='RESCHEDULE_REQUESTED',event_id='reschedule')
        new=self.client.post('/webhooks/voicelab/status',json=event).json()
        self.assertIsNone(new['appointment_time'])
        self.assertEqual(new['referral_status'], 'RESCHEDULE_REQUESTED')
        self.assertEqual(self.client.get(f"/dmed/v2/Appointment/{visit['id']}").json()['start'], r['appointment_time'])
    def test_quiet_hours(self):
        from datetime import datetime,timezone
        from unittest.mock import patch
        with main.connect() as db, patch.object(main,'now',return_value=datetime(2026,11,17,18,0,tzinfo=timezone.utc)):
            c,_=main.get(db,'Case','p2')
            call=main.queue_call(db,c,'quiet-hours')
            self.assertEqual(call['status'],'QUEUED')
            self.assertTrue(call['scheduled_at'].startswith('2026-11-18T08:30'))
            c,_=main.get(db,'Case','p3')
            self.assertEqual(main.queue_call(db,c,'red-night')['status'],'READY')
    def test_missing_data_never_green(self):
        self.assertEqual(evaluate('MATERNAL',{})['risk_zone'],'REVIEW')
        self.assertEqual(evaluate('NEONATAL',{})['risk_zone'],'REVIEW')
    def test_isolated_severe_systolic_and_threshold_gaps(self):
        self.assertEqual(evaluate('MATERNAL',{'systolic':165,'diastolic':70})['risk_zone'],'RED')
        self.assertEqual(evaluate('MATERNAL',{'hemoglobin':80})['risk_zone'],'YELLOW')
        self.assertEqual(evaluate('NEONATAL',{'temperature':36.2})['risk_zone'],'YELLOW')

    def test_reject_invalid_numeric_inputs(self):
        for invalid in (-1, float('nan'), float('inf'), 'high', True):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                evaluate('MATERNAL',{'systolic':invalid})
        self.assertEqual(self.client.post('/dmed/v2/Observation',json={'patient':'p1','systolic':-1}).status_code,422)
        with self.assertRaises(ValueError): evaluate('NEONATAL',{'spo2':101})
        with self.assertRaises(ValueError): evaluate('MATERNAL',{'baseline_systolic':'normal'})
    def test_unknown_categories_and_early_neonate_require_review(self):
        maternal={**main.PATIENTS[0]['observation'],'proteinuria':'unknown'}
        self.assertEqual(evaluate('MATERNAL',maternal)['risk_zone'],'REVIEW')
        normal={'age_days':5,'bilirubin':100,'temperature':37,'spo2':98,'weight_loss':3,'feeding':'active'}
        self.assertEqual(evaluate('NEONATAL',normal)['risk_zone'],'GREEN')
        self.assertEqual(evaluate('NEONATAL',{**normal,'feeding':'unknown'})['risk_zone'],'REVIEW')
        self.assertEqual(evaluate('NEONATAL',{**normal,'age_days':0.5})['risk_zone'],'REVIEW')
    def test_emergency_voice_cannot_book_routine_visit(self):
        for intent in ('CONFIRMED','RESCHEDULE_REQUESTED'):
            r=self.client.post('/webhooks/voicelab/status',json={'case_id':'p3','intent':intent,'event_id':intent})
            self.assertEqual(r.status_code,409)
    def test_stale_voice_booking_rejected(self):
        url='/dmed/v2/Appointment/' + self.facility_visit()['id']
        etag=self.client.get(url).headers['etag']
        self.client.put(url,json={'status':'cancelled'},headers={'If-Match':etag})
        r=self.client.post('/webhooks/voicelab/status',json={'case_id':'p2','intent':'CONFIRMED','event_id':'stale'})
        self.assertEqual(r.status_code,412)
    def test_worker_counts_only_confirmed_timed_visits_as_no_show(self):
        from datetime import timedelta
        confirmed = self.facility_visit('p2', confirmed=True)
        proposed = self.facility_visit('p4')
        with main.connect() as db:
            for visit in (confirmed, proposed):
                visit['start'] = main.stamp(main.now() - timedelta(hours=3))
                main.put(db, 'Appointment', visit['id'], visit)
            main.put(db, 'Encounter', 'other-visit', {'patient':'p2', 'appointment':'unrelated'})
            main.process_due(db)
            self.assertEqual(main.get(db, 'Case', 'p2')[0]['status'], 'NO_SHOW_ALERTED')
            self.assertEqual(main.get(db, 'Case', 'p4')[0]['status'], 'VISIT_PROPOSED')
        self.assertEqual(self.client.post(f"/api/visits/{confirmed['id']}/attended").json()['status'], 'ATTENDED')

    def test_due_worker_escalation_and_queue_release(self):
        from datetime import timedelta
        with main.connect() as db:
            case,_=main.get(db,'Case','p3')
            case['escalation_deadline']=main.stamp(main.now()-timedelta(seconds=1))
            main.put(db,'Case','p3',case)
            main.put(db,'Call','due',{'id':'due','status':'QUEUED','scheduled_at':main.stamp(main.now()-timedelta(seconds=1))})
            main.process_due(db)
            self.assertEqual(main.get(db,'Case','p3')[0]['assigned_practitioner_id'],'d2')
            self.assertEqual(main.get(db,'Call','due')[0]['status'],'READY')

    def test_case_mutations_persist_and_audit(self):
        self.assertEqual(self.client.post('/api/cases/p3/busy').status_code,200)
        self.assertEqual(self.client.post('/api/cases/p3/accept').status_code,200)
        self.assertEqual(self.client.post('/api/cases/p2/call').status_code,200)
        registry=self.client.get('/api/registry').json()
        case=next(c for c in registry['cases'] if c['id']=='p3')
        self.assertEqual(case['status'],'DOCTOR_ACCEPTED')
        self.assertEqual(case['assigned_practitioner_id'],'d2')
        self.assertIn('updated_at',case)
        self.assertEqual([e['action'] for e in registry['audit']],['busy','accept','call'])
        with main.connect() as db:
            self.assertEqual(main.get(db,'Case','p3')[0]['status'],'DOCTOR_ACCEPTED')
            self.assertEqual(len(main.all_of(db,'AuditEvent')),3)
        call=next(c for c in registry['calls'] if c['case_id']=='p2')
        self.assertIn(call['status'],('QUEUED','READY'))
        self.assertEqual(call['attempts'],0)
        self.assertEqual(call['mode'],'simulation')
    def test_rejected_actions_do_not_create_audit(self):
        self.assertEqual(self.client.post('/api/cases/p1/accept').status_code,409)
        self.assertEqual(self.client.post('/api/cases/p2/busy').status_code,409)
        self.assertEqual(self.client.post('/api/cases/p1/accept').status_code,409)
        self.assertEqual(self.client.get('/api/registry').json()['audit'],[])
    def test_cors_local_frontend(self):
        r=self.client.options('/api/registry',headers={'Origin':'http://localhost:3000','Access-Control-Request-Method':'GET'})
        self.assertEqual(r.headers.get('access-control-allow-origin'),'http://localhost:3000')
        blocked=self.client.options('/api/registry',headers={'Origin':'https://unconfigured.example','Access-Control-Request-Method':'GET'})
        self.assertEqual(blocked.status_code,400)

if __name__=='__main__': unittest.main()
