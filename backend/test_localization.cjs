const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../lib/translations.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
const context = { exports: {}, Intl };
vm.runInNewContext(compiled, context);
const { translate, formatDate } = context.exports;

test('Uzbek translates English clinical reasons, doctor titles and export groups', () => {
  assert.equal(translate('uz', 'Severe hypertension · Proteinuria requires review'), 'Og‘ir arterial gipertenziya · Proteinuriya bo‘yicha tekshiruv zarur');
  assert.equal(translate('uz', 'Missing observations: systolic, glucose'), 'Kiritilmagan ko‘rsatkichlar: sistolik qon bosimi, glyukoza');
  assert.equal(translate('uz', 'Dr. Rahimova'), 'Shifokor Rahimova');
  assert.equal(translate('uz', 'MATERNAL'), 'Homilador ayollar');
  assert.equal(translate('uz', 'NEONATAL'), 'Chaqaloqlar');
  assert.equal(translate('uz', 'POSTPARTUM'), 'Tug‘ruqdan keyingi onalar');
  for (const text of ['Qizil zona', 'Madina Karimova', 'My custom facility']) {
    assert.equal(translate('uz', text), text);
  }
});

test('Uzbek translates API error details and variable validation messages', () => {
  assert.equal(translate('uz', 'API xatosi: Case cannot be accepted in current state'), 'API xatosi: Holatni joriy bosqichda qabul qilib bo‘lmaydi');
  assert.equal(translate('uz', 'hemoglobin must be numeric'), 'gemoglobin: son kiritilishi kerak');
  assert.equal(translate('uz', 'glucose must be a finite nonnegative number'), 'glyukoza: chekli va manfiy bo‘lmagan son kiritilishi kerak');
  assert.equal(translate('uz', 'Case/p1 not found'), 'Case/p1 topilmadi');
});
test('Russian handles composed API reasons, missing fields, and failed actions', () => {
  assert.equal(translate('ru', 'Severe hypertension · Proteinuria requires review'), 'Тяжёлая артериальная гипертензия · Протеинурия требует оценки');
  assert.equal(translate('ru', 'Missing observations: systolic, glucose'), 'Отсутствуют наблюдения: систолическое давление, глюкоза');
  assert.equal(translate('ru', 'API xatosi: Case cannot be accepted in current state'), 'Ошибка API: Случай нельзя принять в текущем состоянии');
});

test('Russian localizes clinical values and stages without changing numbers or names', () => {
  assert.equal(translate('ru', 'AQB 165/110 mmHg'), 'АД 165/110 мм рт. ст.');
  assert.equal(translate('ru', 'Bilirubin 238 µmol/L'), 'Билирубин 238 мкмоль/л');
  assert.equal(translate('ru', '34-hafta'), '34 нед.');
  assert.equal(translate('ru', 'Tug‘ruqdan keyin 5 kun'), '5 дн. после родов');
  assert.equal(translate('ru', '{name}: batafsil', { name: 'Madina Karimova' }), 'Madina Karimova: подробнее');
  assert.equal(translate('ru', 'My custom facility'), 'My custom facility');
});

test('dates use the chosen locale and retain the Tashkent time zone', () => {
  const value = '2026-11-18T10:30:00Z';
  assert.match(formatDate(value, 'ru'), /нояб/);
  assert.match(formatDate(value, 'ru'), /15:30/);
  assert.match(formatDate(value, 'uz'), /noy/);
  assert.match(formatDate(value, 'uz'), /15:30/);
});

// Render actual components with each locale, without a browser or a running API.
function localizedModule(file, language, initialState = {}) {
  const filename = path.join(__dirname, '..', file);
  const module = { exports: {} };
  let source = fs.readFileSync(filename, 'utf8');
  // Supply realistic screen states while rendering the actual components.
  const syntax = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name)
      && node.initializer && ts.isCallExpression(node.initializer)
      && node.initializer.expression.getText(syntax) === 'useState') {
      const name = node.name.elements[0].getText(syntax);
      const argument = node.initializer.arguments[0];
      if (argument && Object.hasOwn(initialState, name)) {
        edits.push({ start: argument.getStart(syntax), end: argument.end, text: `__initialState[${JSON.stringify(name)}]` });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(syntax);
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  }
  if (file === 'app/page.tsx') source += '\nexport const __screens = { ObservationFeed, CaseRationale, BookingDialog, UrgentBookingDialog, FacilityResponseForm };';
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const locale = {
    language, setLanguage() {},
    t: (text, values) => translate(language, text ?? '', values),
    date: value => formatDate(value, language),
  };
  const localRequire = name => {
    if (name.includes('LanguageProvider')) return { useLanguage: () => locale };
    if (name.startsWith('@/')) return localizedModule(name.slice(2) + (name.includes('Registry') ? '.tsx' : '.ts'), language, initialState);
    if (name.startsWith('.')) return localizedModule(path.relative(path.join(__dirname, '..'), path.resolve(path.dirname(filename), name)) + '.ts', language, initialState);
    return require(name);
  };
  vm.runInNewContext(compiled, { exports: module.exports, require: localRequire, __initialState: initialState, process, console, setTimeout, clearTimeout, setInterval, clearInterval, URL, AbortController });
  return module.exports;
}

test('Russian header contains the language selector beside notifications', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const Dashboard = localizedModule('app/page.tsx', 'ru').default;
  const html = renderToStaticMarkup(React.createElement(Dashboard));
  assert.match(html, /Каждая мама\. Каждый малыш\./);
  assert.match(html, /aria-label="Язык интерфейса"/);
  assert.match(html, /<button[^>]*lang="ru"[^>]*aria-pressed="true"/);
  assert.match(html, /aria-label="Уведомления"/);
  assert.match(html, /src="\/flags\/ru\.svg"/);
  assert.ok(html.indexOf('language-picker') < html.indexOf('notification-button'));
});

test('Uzbek header uses the Uzbekistan flag and Uzbek doctor titles', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const Dashboard = localizedModule('app/page.tsx', 'uz').default;
  const html = renderToStaticMarkup(React.createElement(Dashboard));
  assert.match(html, /src="\/flags\/uz\.svg"/);
  assert.match(html, /aria-label="Interfeys tili"/);
  assert.match(html, /Shifokor Dilnoza Rahimova/);
  assert.doesNotMatch(html, /Dr\./);
});

test('Russian registry shows the status badge and keeps clinic filters intact', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const Registry = localizedModule('components/Registry.tsx', 'ru').default;
  const patient = { id: 'p1', name: 'Madina Karimova', age: 26, cohort: 'MATERNAL', stage: '34-hafta', clinic: '42-sonli OP', zone: 'RED', reason: 'Severe hypertension', vitals: ['AQB 165/110 mmHg'], doctor: 'rahimova', status: 'Shifokor tasdig‘i kutilmoqda', time: '—' };
  const html = renderToStaticMarkup(React.createElement(Registry, { patients: [patient], persona: 'district', riskFilter: 'ALL', onSelect() {}, onRiskFilter() {} }));
  assert.doesNotMatch(html, /Тяжёлая артериальная гипертензия/);
  assert.match(html, /Ожидается подтверждение врача/);
  assert.match(html, /value="42-sonli OP">Семейная поликлиника №42/);
  assert.match(html, /Madina Karimova/);
  assert.doesNotMatch(html, /Severe hypertension/);
});

test('Uzbek registry reserves detailed risk reasons for the patient card', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const Registry = localizedModule('components/Registry.tsx', 'uz').default;
  const patient = { id: 'p1', name: 'Madina Karimova', age: 26, cohort: 'MATERNAL', stage: '34-hafta', clinic: '42-sonli OP', zone: 'RED', reason: 'Severe hypertension · Hypertension with proteinuria', vitals: ['AQB 165/110 mmHg'], doctor: 'rahimova', status: 'Shifokor tasdig‘i kutilmoqda', time: '—' };
  const html = renderToStaticMarkup(React.createElement(Registry, { patients: [patient], persona: 'district', riskFilter: 'ALL', onSelect() {}, onRiskFilter() {} }));
  assert.match(html, /Yuqori xavf/);
  assert.doesNotMatch(html, /Og‘ir arterial gipertenziya/);
  assert.match(html, /Shifokor Rahimova/);
  assert.doesNotMatch(html, /Severe hypertension|Hypertension with proteinuria|Dr\./);
});

test('referral spelling, keyboard apostrophes and invalid dates are handled', () => {
  assert.equal(translate('uz', "Yo'llanmalar"), 'Yo‘llanmalar');
  for (const label of ['Yo‘llanmalar', 'Yo’llanmalar', "Yo'llanmalar", 'Yoʻllanmalar']) {
    assert.equal(translate('ru', label), 'Направления');
  }
  assert.equal(translate('ru', "O'Connor"), "O'Connor");
  assert.equal(formatDate('not-a-date', 'ru'), '—');
  assert.equal(formatDate('', 'uz'), '—');
});

test('Russian translates measured backend findings without losing numbers', () => {
  assert.equal(translate('ru', 'Gemoglobin 89 g/L. Kamqonlik belgisi.'), 'Гемоглобин 89 г/л. Признак анемии.');
  assert.equal(translate('ru', 'Bilirubin 295 µmol/L. Bilirubin yuqori.'), 'Билирубин 295 мкмоль/л. Высокий билирубин.');
  assert.equal(translate('ru', 'AQB 165/110 mmHg, proteinuriya ++. Yuqori arterial bosim va proteinuriya.'), 'АД 165/110 мм рт. ст., протеинурия ++. Высокое артериальное давление и протеинурия.');
  assert.equal(translate('ru', 'Vazn yo‘qotilishi 8.4%. Vazn yo‘qotilishi bo‘yicha ko‘rik kerak.'), 'Потеря массы тела 8.4%. Необходим осмотр из-за потери массы тела.');
  assert.equal(translate('ru', 'Ma’lumot yetishmaydi: sistolik bosim, emish holati'), 'Отсутствуют наблюдения: систолическое давление, кормление');
  assert.equal(translate('ru', 'API xatosi: Bu vaqt band. Boshqa vaqtni tanlang'), 'Ошибка API: Это время занято. Выберите другое время');
});

function render(Component, props) {
  return require('react-dom/server').renderToStaticMarkup(require('react').createElement(Component, props));
}

function assertRussian(html) {
  const visible = html.replace(/<[^>]*>/g, ' ');
  assert.doesNotMatch(visible, /Yo\?llanmalar|Yo‘llan|Qabul|Shifokor|kutilmo|ko‘rik|Ma’lumot|Avvalgi|Yangi o‘lchov|Bilirubin|Harorat|Kamqonlik|Namuna|Saqlanmo|Toshkent vaqti|Bemor|Dr\./);
}

test('every dashboard section renders in both languages with populated records', () => {
  const patients = localizedModule('lib/demo.ts', 'ru').seedPatients;
  const slot = { id: 's1', practitioner_id: 'd1', facility: 'OVaBMU markazi', start: '2026-11-19T10:00:00+05:00', end: '2026-11-19T10:30:00+05:00', available: true };
  const data = {
    patients, calls: [{ id: 'c1', patientId: patients[0].id, patientName: patients[0].name, target: 'Bemor', status: 'DEMO_CALL_RUNNING', statusLabel: 'AI sinov qo‘ng‘irog‘i davom etmoqda', attempts: 1, scheduledAt: slot.start }],
    appointments: [{ id: 'a1', patient: patients[0].id, practitioner: 'rahimova', facility: slot.facility, start: slot.start, status: 'proposed' }],
    availability: [slot], history: [], audit: [], demoStream: null, demoAnalyses: {}, source: 'mock',
  };
  for (const language of ['uz', 'ru']) {
    for (const tab of ['overview', 'registry', 'appointments', 'referrals', 'voice', 'clinics', 'analytics']) {
      const Dashboard = localizedModule('app/page.tsx', language, { tab, data, offline: false }).default;
      const html = render(Dashboard);
      if (language === 'ru') assertRussian(html);
      assert.match(html, language === 'ru' ? /Направления/ : /Yo‘llanmalar/);
      assert.doesNotMatch(html, /Yo\?|\uFFFD/);
    }
    for (const state of [{ sim: true }, { selected: patients[0] }, { notifications: true }, { dark: true }]) {
      const Dashboard = localizedModule('app/page.tsx', language, { data, offline: false, ...state }).default;
      const html = render(Dashboard);
      if (language === 'ru') assertRussian(html);
      assert.doesNotMatch(html, /Yo\?|\uFFFD/);
    }
  }
});

test('analysis feed and booking dialogs translate dynamic content and errors', () => {
  const screens = localizedModule('app/page.tsx', 'ru').__screens;
  const patient = { ...localizedModule('lib/demo.ts', 'ru').seedPatients[0], reason: 'Bilirubin yuqori', riskEvidence: ['Bilirubin 295 µmol/L. Bilirubin yuqori.'], analysisEligible: true };
  const slot = { id: 's1', practitioner_id: 'd1', facility: 'OVaBMU markazi', start: '2026-11-19T10:00:00+05:00', end: '2026-11-19T10:30:00+05:00', available: true };
  const error = 'API xatosi: Bu vaqt band. Boshqa vaqtni tanlang';
  const cases = [
    [screens.ObservationFeed, { active: true, disabled: false, onStart() {}, onOpen() {}, stream: { id: 'r1', status: 'STREAMING', total: 4, events: [{ id: 'e1', patient_id: patient.id, patient_name: patient.name, previous_zone: 'YELLOW', zone: 'RED', analysis_status: 'RUNNING', analysis_reason: patient.riskEvidence[0], previous_observation: { bilirubin: 238 }, observation: { bilirubin: 295, temperature: 38.4 } }] } }],
    [screens.CaseRationale, { patient, offline: false, analysis: { status: 'COMPLETE', result: { source: 'openrouter', zone: 'RED', model: 'demo-model', review_focus: 'VERIFY_CHANGE', reasons: patient.riskEvidence } } }],
    [screens.BookingDialog, { initialSlot: slot, initialPatientId: patient.id, patients: [patient], slots: [slot], offline: false, working: false, error, onClose() {}, onBook() {} }],
    [screens.UrgentBookingDialog, { patient, slots: [], disabled: false, working: false, error, onClose() {}, onBook() {} }],
    [screens.FacilityResponseForm, { offline: false, working: false, slots: [slot], rescheduling: false, onSave() {} }],
  ];
  for (const [Component, props] of cases) assertRussian(render(Component, props));
  const html = render(screens.BookingDialog, cases[2][1]);
  assert.match(html, /Ошибка API: Это время занято/);
  assert.match(html, /Билирубин 295 мкмоль\/л/);
});

test('UI labels stay translated and contain no broken apostrophes', () => {
  const unchanged = new Set(['Mehr', 'AI', 'MehrAI', 'v1.0', 'NA', 'Nodira Ahmedova', 'O‘zbekcha']);
  for (const name of ['app/page.tsx', 'components/Registry.tsx']) {
    const source = fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
    const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isJsxText(node) && /[a-z]/i.test(node.text)) {
        assert.ok(unchanged.has(node.text.trim()), `Untranslated JSX in ${name}: ${node.text.trim()}`);
      }
      if (ts.isStringLiteral(node) || ts.isJsxText(node)) {
        assert.doesNotMatch(node.text, /\p{L}\?\p{L}|\uFFFD/u, `Broken characters in ${name}`);
      }
      if (ts.isCallExpression(node) && node.expression.getText(file) === 't'
        && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        const key = node.arguments[0].text;
        if (/[a-z]/i.test(key) && !unchanged.has(key.trim())) {
          assert.notEqual(translate('ru', key), key, `Missing Russian translation: ${key}`);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
  }
});

test('backend clinical labels and literal errors have Russian translations', () => {
  const riskText = fs.readFileSync(path.join(__dirname, 'risk_text.py'), 'utf8');
  const labels = riskText.split('FINDING_LABELS = {')[1].split('}')[0];
  for (const match of labels.matchAll(/:\s*'([^']+)'/g)) {
    assert.notEqual(translate('ru', match[1]), match[1], `Untranslated finding: ${match[1]}`);
  }
  const backend = fs.readFileSync(path.join(__dirname, 'main.py'), 'utf8');
  for (const match of backend.matchAll(/raise HTTPException\(\d+,\s*'([^']+)'/g)) {
    assert.notEqual(translate('ru', match[1]), match[1], `Untranslated API error: ${match[1]}`);
  }
});

test('analytics includes pending assessments and handles empty or doctor-scoped registries', () => {
  const patients = localizedModule('lib/demo.ts', 'ru').seedPatients;
  for (const language of ['uz', 'ru']) {
    const Empty = localizedModule('app/page.tsx', language, { tab: 'analytics', patients: [] }).default;
    assert.doesNotMatch(render(Empty), /NaN|Infinity/);
  }
  const patient = { ...patients[0], zone: 'REVIEW' };
  const Dashboard = localizedModule('app/page.tsx', 'ru', { tab: 'analytics', persona: patient.doctor, patients: [patient, { ...patients[1], doctor: 'alimov' }] }).default;
  const html = render(Dashboard);
  assert.match(html, /Требуется клиническая оценка/);
  assert.match(html, /class="review" style="width:100%"/);
  assert.doesNotMatch(html, /NaN|Infinity/);
});
