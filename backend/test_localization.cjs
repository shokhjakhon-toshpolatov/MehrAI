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
function localizedModule(file, language) {
  const filename = path.join(__dirname, '..', file);
  const module = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const locale = {
    language, setLanguage() {},
    t: (text, values) => translate(language, text ?? '', values),
    date: value => formatDate(value, language),
  };
  const localRequire = name => {
    if (name.includes('LanguageProvider')) return { useLanguage: () => locale };
    if (name.startsWith('@/')) return localizedModule(name.slice(2) + (name.includes('Registry') ? '.tsx' : '.ts'), language);
    if (name.startsWith('.')) return localizedModule(path.relative(path.join(__dirname, '..'), path.resolve(path.dirname(filename), name)) + '.ts', language);
    return require(name);
  };
  vm.runInNewContext(compiled, { exports: module.exports, require: localRequire, process, console, setTimeout, clearTimeout, setInterval, clearInterval, URL, AbortController });
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
