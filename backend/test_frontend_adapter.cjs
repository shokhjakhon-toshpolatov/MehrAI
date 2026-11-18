const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../lib/api.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
function client(url, fetch, hostname) {
  const context = { exports: {}, process: { env: { NEXT_PUBLIC_API_URL: url } }, URL, AbortController, fetch, setTimeout, clearTimeout, Intl, console };
  if (hostname) context.window = { location: { hostname } };
  vm.runInNewContext(compiled, context);
  return context.exports;
}
const payload = {
  mode: 'mock', patients: [{ id: 'p1', name: 'Test patient', cohort_type: 'MATERNAL', age: 28, gestational_weeks: 30, clinic: '42-sonli OP' }],
  cases: [{ id: 'p1', patient_id: 'p1', risk_zone: 'REVIEW', risk_reasons: ['Missing observations'], status: 'REVIEW_REQUIRED', observation: { hemoglobin: 115 }, assigned_practitioner_id: 'd1', updated_at: '2026-11-17T12:00:00Z' }],
  calls: [{ id: 'c1', case_id: 'p1', target_role: 'PATIENT', status: 'QUEUED', scheduled_at: '2026-11-18T08:30:00+05:00', attempts: 0, mode: 'simulation' }], audit: [],
};
test('missing configuration rejects without fetching', async () => {
  let fetched = false;
  await assert.rejects(client('', () => { fetched = true; }).loadRegistry(), /NEXT_PUBLIC_API_URL/);
  assert.equal(fetched, false);
});
test('registry preserves REVIEW, pending outreach, persisted fields and source', async () => {
  const api = client('http://localhost:8000/', async url => {
    assert.equal(url, 'http://localhost:8000/api/registry');
    return { ok: true, json: async () => payload };
  });
  const result = await api.loadRegistry();
  assert.equal(result.source, 'mock');
  assert.equal(result.patients[0].zone, 'REVIEW');
  assert.equal(result.patients[0].doctor, 'rahimova');
  assert.equal(result.patients[0].statusCode, 'REVIEW_REQUIRED');
  assert.equal(result.patients[0].updatedAt, payload.cases[0].updated_at);
  assert.equal(result.calls[0].attempts, 0);
  assert.equal(result.calls[0].status, 'QUEUED');
  assert.match(result.calls[0].statusLabel, /simulyatsiya/);
  assert.equal(result.calls[0].simulated, true);
});
test('action posts encoded case ID and propagates failure', async () => {
  let seen;
  const api = client('http://localhost:8000', async (url, options) => {
    seen = [url, options.method];
    return { ok: false, status: 409, json: async () => ({ detail: 'Case cannot be accepted' }) };
  });
  await assert.rejects(api.performCaseAction('p/1', 'accept'), /Case cannot be accepted/);
  assert.deepEqual(seen, ['http://localhost:8000/api/cases/p%2F1/accept', 'POST']);
});
test('unknown mode fails instead of claiming live source', async () => {
  const api = client('http://localhost:8000', async () => ({ ok: true, json: async () => ({ ...payload, mode: 'unknown' }) }));
  await assert.rejects(api.loadRegistry(), /formati/);
});

test('local hostname defaults to the persistent API', async () => {
  let fetchedUrl;
  const api = client('', async url => { fetchedUrl = url; return { ok: true, json: async () => payload }; }, '127.0.0.1');
  await api.loadRegistry();
  assert.equal(fetchedUrl, 'http://127.0.0.1:8000/api/registry');
});
test('remote hostname without configuration stays disconnected', async () => {
  await assert.rejects(client('', () => { throw new Error('must not fetch'); }, 'example.com').loadRegistry(), /NEXT_PUBLIC_API_URL/);
});
