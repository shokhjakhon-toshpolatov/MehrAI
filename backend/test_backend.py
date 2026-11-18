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
    def facility_visit(self, case_id='p2', *, confirmed=False, mode='timed', practitioner_id='d1'):
        from datetime import timedelta
        case = next(c for c in self.client.get('/api/registry').json()['cases'] if c['id'] == case_id)
        approval = self.client.post(f'/api/referrals/{case_id}/approve', json={'practitioner_id': case['assigned_practitioner_id']})
        self.assertEqual(approval.status_code, 200, approval.text)
        payload = {'mode': mode, 'facility': 'Namuna poliklinikasi',
                   'practitioner_id': practitioner_id, 'confirmed': confirmed}
        if mode == 'timed':
            payload['start'] = main.stamp(main.now() + timedelta(days=1))
        response = self.client.post(f'/api/referrals/{case_id}/response', json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_sample_slot_booking_persists_and_cannot_be_double_booked(self):
        data = self.client.get('/api/registry').json()
        slot = next(slot for slot in data['availability'] if slot['available'])
        payload = {'mode': 'timed', 'slot_id': slot['id']}
        case_path = '/api/referrals/p2'
        self.assertEqual(self.client.post(f'{case_path}/response', json=payload).status_code, 409)
        for case_id in ('p2', 'p4'):
            case = next(case for case in data['cases'] if case['id'] == case_id)
            response = self.client.post(f'/api/referrals/{case_id}/approve',
                                        json={'practitioner_id': case['assigned_practitioner_id']})
            self.assertEqual(response.status_code, 200, response.text)
        response = self.client.post(f'{case_path}/response', json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        visit = response.json()
        self.assertEqual((visit['start'], visit['practitioner'], visit['facility']),
                         (slot['start'], slot['practitioner_id'], slot['facility']))
        registry = self.client.get('/api/registry').json()
        self.assertIn(visit, registry['appointments'])
        self.assertFalse(next(item for item in registry['availability'] if item['id'] == slot['id'])['available'])
        self.assertEqual(self.client.post('/api/referrals/p4/response', json=payload).status_code, 409)

    def test_call_result_keeps_rescheduling_in_the_referral_queue(self):
        original = self.facility_visit()
        data = self.client.get('/api/registry').json()
        call = next(c for c in data['calls'] if c['case_id'] == 'p2')
        self.assertEqual(self.client.post(f"/api/outreach/{call['id']}/outcome",
                                         json={'outcome': 'RESCHEDULE_REQUESTED', 'attempt_id': 'a1'}).status_code, 409)
        callback = {'case_id': 'p2', 'intent': 'RESCHEDULE_REQUESTED', 'event_id': 'a1'}
        for _ in range(2):
            self.assertEqual(self.client.post('/webhooks/voicelab/status', json=callback).status_code, 200)
        logged = next(row for row in self.client.get('/api/registry').json()['calls'] if row['id'] == call['id'])
        self.assertEqual((logged['status'], logged['attempts']), ('RESCHEDULE_REQUESTED', 1))
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
        self.assertEqual(refreshed['p4']['referral_status'], 'AWAITING_CLINICIAN')

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

    def test_referral_requires_assigned_clinician_and_facility_before_contact(self):
        from datetime import timedelta
        path = '/api/referrals/p2'
        visit = {'mode':'timed', 'facility':'Namuna', 'practitioner_id':'d1',
                 'start':main.stamp(main.now()+timedelta(days=1))}
        self.assertEqual(self.client.post(path+'/response', json=visit).status_code, 409)
        self.assertEqual(self.client.post('/api/cases/p2/call').status_code, 409)
        self.assertEqual(self.client.post(path+'/approve', json={'practitioner_id':'d1'}).status_code, 409)
        approved = self.client.post(path+'/approve', json={'practitioner_id':'d3'}).json()
        self.assertEqual(approved['referral_status'], 'AWAITING_FACILITY')
        self.assertEqual(self.client.post('/api/cases/p2/call').status_code, 409)
        result = self.client.post(path+'/response', json=visit).json()
        state = self.client.get('/api/registry').json()
        self.assertEqual(result['practitioner'], 'd1')
        self.assertEqual(next(c for c in state['cases'] if c['id']=='p2')['assigned_practitioner_id'], 'd3')
        self.assertTrue(any(c.get('appointment_id') == result['id'] for c in state['calls']))
        self.assertEqual(self.client.post('/api/referrals/p3/response', json=visit).status_code, 409)

    def test_planned_call_runs_after_booking_without_confirming_attendance_or_acceptance(self):
        from datetime import datetime, timedelta
        from unittest.mock import patch
        visit = self.facility_visit()
        self.assertEqual(self.client.post('/api/cases/p2/call').status_code, 409)
        with main.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            call = next(task for task in main.all_of(db, 'Call') if task['appointment_id'] == visit['id'])
            self.assertEqual(call['status'], 'DEMO_CALL_QUEUED')
            queued_until = datetime.fromisoformat(call['next_transition_at'])
            with patch.object(main, 'now', return_value=queued_until):
                main.process_due(db)
                self.assertEqual(main.get(db, 'Call', call['id'])[0]['status'], 'DEMO_CALL_RUNNING')
            with patch.object(main, 'now', return_value=queued_until + timedelta(seconds=4)):
                main.process_due(db)
                result, _ = main.get(db, 'Call', call['id'])
                self.assertEqual((result['status'], result['attempts']), ('DEMO_CALL_COMPLETE', 1))
                self.assertEqual(main.get(db, 'Appointment', visit['id'])[0]['status'], 'proposed')

    def test_openrouter_can_only_reorder_existing_evidence(self):
        from unittest.mock import patch
        from backend.explanations import explain_case
        evidence = ['First', 'Second', 'Third', 'Fourth']
        case = {'cohort_type': 'MATERNAL', 'risk_zone': 'YELLOW', 'risk_reasons': evidence}
        with patch.dict('os.environ', {'OPENROUTER_API_KEY':'test-key', 'MEHRAI_OPENROUTER_MODEL':''}), patch('backend.explanations.httpx.Client') as client:
            post = client.return_value.__enter__.return_value.post
            provider = post.return_value
            provider.json.return_value = {'choices': [{'finish_reason':'stop', 'message': {'content':'{"indices":[1,0],"review_focus":"SCREENING_FINDINGS"}'}}]}
            result = explain_case({**case, 'name':'Private name', 'patient_id':'private-id'})
            self.assertEqual(result['source'], 'openrouter')
            self.assertEqual(result['reasons'], ['Second', 'First', 'Third', 'Fourth'])
            args, kwargs = post.call_args
            self.assertEqual(args, ('https://openrouter.ai/api/v1/chat/completions',))
            self.assertEqual(kwargs['headers']['Authorization'], 'Bearer test-key')
            self.assertEqual(kwargs['json']['model'], 'qwen/qwen3.6-27b')
            self.assertEqual(kwargs['json']['provider'], {'data_collection':'deny','zdr':True,'require_parameters':True})
            self.assertNotIn('Private name', str(kwargs['json']))
            self.assertNotIn('private-id', str(kwargs['json']))
            provider.json.return_value = {'choices': [{'finish_reason':'stop', 'message': {'content':'{"indices":[1,9],"review_focus":"SCREENING_FINDINGS"}'}}]}
            self.assertEqual(explain_case(case), {'source':'rules','zone':'YELLOW','reasons':evidence,'analyzer_status':'unavailable'})
            client.reset_mock()
            self.assertEqual(explain_case({**case, 'risk_zone':'RED'}),
                             {'source':'rules','zone':'RED','reasons':evidence})
            client.assert_not_called()
        with patch.dict('os.environ', {'OPENROUTER_API_KEY':''}), patch('backend.explanations.httpx.Client') as client:
            self.assertEqual(explain_case(case)['analyzer_status'], 'not_configured')
            client.assert_not_called()

    def test_registry_only_offers_model_review_when_there_is_reviewable_evidence(self):
        from unittest.mock import patch
        cases = {case['id']: case for case in self.client.get('/api/registry').json()['cases']}
        self.assertFalse(cases['p1']['analysis_eligible'])
        self.assertTrue(cases['p2']['analysis_eligible'])
        self.assertFalse(cases['p3']['analysis_eligible'])
        with patch('backend.explanations.httpx.Client') as client:
            self.assertEqual(self.client.post('/api/cases/p1/explanation').json()['source'], 'rules')
            client.assert_not_called()

    def test_red_change_requires_review_then_runs_one_simulated_call(self):
        from datetime import timedelta
        from unittest.mock import patch
        change = self.client.post('/api/simulate/neonatal-red').json()
        self.assertEqual(change['previous_risk_zone'], 'YELLOW')
        self.assertEqual(change['previous_observation']['bilirubin'], 238)
        self.assertEqual(change['risk_zone'], 'RED')
        path = '/api/cases/p4/approve-urgent-outreach'
        clinician = {'practitioner_id':'d4'}
        self.assertEqual(self.client.post(path, json=clinician).status_code, 409)
        self.assertEqual(self.client.post('/api/cases/p4/call').status_code, 409)
        self.assertEqual(self.client.post('/api/cases/p4/accept').status_code, 200)
        self.assertEqual(self.client.post(path, json={'practitioner_id':'d1'}).status_code, 409)
        self.assertEqual(self.client.post(path, json=clinician).status_code, 200)
        self.assertEqual(self.client.post(path, json=clinician).status_code, 200)
        initial = main.now()
        with main.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            tasks = [c for c in main.all_of(db, 'Call') if c['case_id'] == 'p4']
            self.assertEqual(len(tasks), 1)
            call_id = tasks[0]['id']
            self.assertEqual(tasks[0]['target_role'], 'MOTHER_OF_NEWBORN')
            with patch('backend.main.now', return_value=initial+timedelta(seconds=2)):
                main.process_due(db)
                self.assertEqual(main.get(db, 'Call', call_id)[0]['status'], 'DEMO_CALL_RUNNING')
            with patch('backend.main.now', return_value=initial+timedelta(seconds=7)):
                main.process_due(db)
                self.assertEqual(main.get(db, 'Call', call_id)[0]['status'], 'DEMO_CALL_COMPLETE')
        self.assertFalse(self.client.get('/api/registry').json()['appointments'])

    def test_urgent_visit_saves_clinician_time_and_queues_one_patient_reminder(self):
        from datetime import datetime, timedelta
        from unittest.mock import patch
        case_id = 'p3'
        start = main.stamp(main.now() + timedelta(hours=2))
        path = f'/api/cases/{case_id}/urgent-visit'
        self.assertEqual(self.client.post(path, json={'practitioner_id': 'd2', 'start': start}).status_code, 409)
        request = {'practitioner_id': 'd1', 'start': start}
        response = self.client.post(path, json=request)
        self.assertEqual(response.status_code, 200, response.text)
        visit = response.json()
        self.assertEqual(self.client.post(path, json=request).json()['id'], visit['id'])
        with main.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            call, = [task for task in main.all_of(db, 'Call') if task.get('appointment_id') == visit['id']]
            self.assertEqual((call['target_role'], call['appointment_start']), ('PATIENT', start))
            due = datetime.fromisoformat(call['next_transition_at'])
            prior, _ = main.get(db, 'Case', case_id)
            main.ingest(db, case_id, {**prior['observation'], 'id': 'urgent-repeat-observation'})
            with patch.object(main, 'now', return_value=due):
                main.process_due(db)
                self.assertEqual(main.get(db, 'Call', call['id'])[0]['status'], 'DEMO_CALL_RUNNING')
            with patch.object(main, 'now', return_value=due + timedelta(seconds=4)):
                main.process_due(db)
                self.assertEqual(main.get(db, 'Call', call['id'])[0]['status'], 'DEMO_CALL_COMPLETE')
                self.assertEqual(main.get(db, 'Appointment', visit['id'])[0]['status'], 'proposed')

    def test_agent_reviews_measured_change_without_reclassifying_red(self):
        import json
        from unittest.mock import patch
        from backend.explanations import explain_case
        case = self.client.post('/api/simulate/neonatal-red').json()
        with patch.dict('os.environ', {'OPENROUTER_API_KEY':'test-key'}), patch('backend.explanations.httpx.Client') as client:
            post = client.return_value.__enter__.return_value.post
            post.return_value.json.return_value = {'choices': [{
                'finish_reason':'stop', 'message': {'content':'{"indices":[1],"review_focus":"VERIFY_CHANGE"}'},
            }]}
            result = explain_case(case)
            self.assertEqual(result['zone'], 'RED')
            self.assertEqual(result['reasons'], case['risk_reasons'])
            self.assertEqual(result['review_focus'], 'VERIFY_CHANGE')
            messages = post.call_args.kwargs['json']['messages']
            self.assertEqual(json.loads(messages[1]['content'])['changes']['bilirubin'], {'before':238,'after':295})

    def test_stream_delivers_mock_observations_and_queues_analysis(self):
        from datetime import timedelta
        from unittest.mock import patch
        start = self.client.post('/api/simulation/start').json()
        self.assertEqual(start['events'], [])
        self.assertEqual(self.client.post('/api/simulation/start').json()['id'], start['id'])
        tick = main.now() + timedelta(seconds=2)
        with main.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            for index in range(start['total']):
                with patch('backend.main.now', return_value=tick):
                    main.advance_demo_feed(db)
                    main.advance_demo_feed(db)
                run, _ = main.get(db, 'DemoRun', start['id'])
                self.assertEqual(len(run['events']), index + 1)
                event = run['events'][-1]
                observation, _ = main.get(db, 'Observation', event['id'])
                self.assertEqual(observation['patient'], event['patient_id'])
                job, _ = main.get(db, 'DemoAnalysis', event['id'])
                self.assertEqual(job['status'], 'PENDING')
                tick += timedelta(seconds=4)
            self.assertEqual(run['status'], 'COMPLETE')
            self.assertEqual((run['events'][-1]['previous_zone'], run['events'][-1]['zone']), ('YELLOW', 'RED'))
        data = self.client.get('/api/registry').json()
        newborn = next(p for p in data['patients'] if p['id'] == 'p4')
        self.assertEqual(newborn['contact']['mother_name'], 'Nigora Nazarova')
        self.assertEqual(newborn['contact']['phone_display'], '+998 •• ••• •• ••')
        self.assertEqual(data['demo_stream']['events'][-1]['zone'], 'RED')
        last = data['demo_stream']['events'][-1]
        self.assertEqual(last['previous_observation']['bilirubin'], 238)
        self.assertEqual(last['observation']['bilirubin'], 295)

    def test_registry_display_explains_findings_in_uzbek_using_recorded_values(self):
        cases = {case['id']: case for case in self.client.get('/api/registry').json()['cases']}
        self.assertEqual(cases['p2']['risk_reasons'], ['Kamqonlik belgisi', 'Endokrinolog ko‘rigi kerak'])
        self.assertEqual(cases['p2']['risk_evidence'], [
            'Gemoglobin 94 g/L. Kamqonlik belgisi.',
            'Glyukoza 5.8 mmol/L. Endokrinolog ko‘rigi kerak.',
        ])

    def test_seed_and_routing(self):
        data=self.client.get('/api/registry').json()
        cases={c['id']:c for c in data['cases']}
        self.assertEqual([cases[f'p{i}']['risk_zone'] for i in range(1,5)],['GREEN','YELLOW','RED','YELLOW'])
        self.assertEqual(cases['p2']['assigned_practitioner_id'],'d3')
        self.assertEqual(cases['p2']['referral_status'],'AWAITING_CLINICIAN')
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
        self.facility_visit()
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
        proposed = self.facility_visit('p4', practitioner_id='d4')
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
        self.assertEqual(self.client.post('/api/cases/p1/call').status_code,200)
        registry=self.client.get('/api/registry').json()
        case=next(c for c in registry['cases'] if c['id']=='p3')
        self.assertEqual(case['status'],'DOCTOR_ACCEPTED')
        self.assertEqual(case['assigned_practitioner_id'],'d2')
        self.assertIn('updated_at',case)
        self.assertEqual([e['action'] for e in registry['audit']],['busy','accept','call'])
        with main.connect() as db:
            self.assertEqual(main.get(db,'Case','p3')[0]['status'],'DOCTOR_ACCEPTED')
            self.assertEqual(len(main.all_of(db,'AuditEvent')),3)
        call=next(c for c in registry['calls'] if c['case_id']=='p1')
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
