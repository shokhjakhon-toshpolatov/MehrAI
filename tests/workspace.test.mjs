import { JSDOM } from "jsdom";
import React from "react";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3000",
});
for (const key of [
  "window",
  "document",
  "HTMLElement",
  "HTMLInputElement",
  "Element",
  "Node",
  "MutationObserver",
  "getComputedStyle",
])
  globalThis[key] =
    key === "getComputedStyle"
      ? dom.window.getComputedStyle.bind(dom.window)
      : dom.window[key];
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { render, screen, cleanup, waitFor, within } =
  await import("@testing-library/react");
const { default: userEvent } = await import("@testing-library/user-event");
const { default: Dashboard } = await import("../app/page.tsx");
const { default: Registry } = await import("../components/Registry.tsx");
const { seedPatients } = await import("../lib/demo.ts");
afterEach(() => cleanup());
const offline = () => {
  globalThis.fetch = async () => {
    throw new TypeError("offline");
  };
};
const user = () => userEvent.setup({ document: dom.window.document });

test("each navigation destination has a distinct operational screen", async () => {
  offline();
  render(React.createElement(Dashboard));
  const u = user();
  await screen.findByText("Namuna ma’lumotlari · faqat ko‘rish.");
  assert.ok(
    screen.getByRole("heading", { name: "Amal talab qiladigan holatlar" }),
  );
  assert.equal(screen.queryByRole("table"), null);
  const nav = screen.getByRole("navigation", { name: "Asosiy navigatsiya" });
  await u.click(within(nav).getByRole("button", { name: "Bemorlar registri" }));
  assert.ok(screen.getByRole("table"));
  assert.equal(
    screen.queryByRole("heading", { name: "Amal talab qiladigan holatlar" }),
    null,
  );
  await u.click(within(nav).getByRole("button", { name: "Qabullar" }));
  assert.ok(screen.getByRole("heading", { name: "Qabul jadvali" }));
  assert.equal(screen.queryByPlaceholderText("Bemor ismi yoki ID..."), null);
  await u.click(
    within(nav).getByRole("button", { name: "Bemorlar bilan aloqa" }),
  );
  assert.ok(screen.getByRole("heading", { name: "Aloqa xizmati ulanmagan" }));
  assert.equal(screen.queryByRole("heading", { name: "Qabul jadvali" }), null);
  await u.click(within(nav).getByRole("button", { name: "Muassasalar" }));
  assert.ok(
    screen.getByRole("heading", { name: "Muassasalar bo‘yicha kuzatuv" }),
  );
  assert.equal(
    screen.queryByRole("heading", { name: "Aloqa xizmati ulanmagan" }),
    null,
  );
  assert.equal(screen.queryByText(/Demo simulyator/), null);
  assert.equal(screen.queryByText(/qo‘ng‘iroqni tinglash/), null);
});

test("disconnected records cannot be accepted or routed; Escape closes details", async () => {
  offline();
  render(React.createElement(Dashboard));
  const u = user();
  await u.click(screen.getByRole("button", { name: "Holatni ko‘rib chiqish" }));
  const dialog = screen.getByRole("dialog");
  assert.equal(
    within(dialog).getByRole("button", { name: "Holatni qabul qilish" })
      .disabled,
    true,
  );
  assert.equal(
    within(dialog).getByRole("button", { name: /Zaxira mutaxassisga/ })
      .disabled,
    true,
  );
  assert.equal(
    within(dialog).getByRole("button", { name: "Aloqa vazifasini yaratish" })
      .disabled,
    true,
  );
  await u.keyboard("{Escape}");
  assert.equal(screen.queryByRole("dialog"), null);
});

test("registry priority, cohort, search and empty state filters work", async () => {
  const u = user();
  render(
    React.createElement(Registry, {
      patients: seedPatients,
      onSelect: () => {},
      persona: "district",
      riskFilter: "ALL",
      onRiskFilter: () => {},
    }),
  );
  assert.match(screen.getAllByRole("row")[1].textContent, /Mohira Rustamova/);
  await u.click(screen.getByRole("button", { name: /Chaqaloqlar/ }));
  assert.equal(screen.getAllByRole("row").length, 4);
  await u.type(screen.getByRole("textbox"), "Amirbek");
  assert.equal(screen.getAllByRole("row").length, 2);
  await u.clear(screen.getByRole("textbox"));
  await u.type(screen.getByRole("textbox"), "No such person");
  assert.ok(screen.getByRole("heading", { name: "Bemor topilmadi" }));
  await u.click(screen.getByRole("button", { name: "Filtrlarni tozalash" }));
  assert.equal(screen.getAllByRole("row").length, 9);
});

function apiFixture() {
  return {
    mode: "mock",
    patients: [
      {
        id: "p3",
        name: "Mohira Rustamova",
        age: 31,
        cohort_type: "MATERNAL",
        gestational_weeks: 34,
        clinic: "42-sonli OP",
      },
    ],
    cases: [
      {
        id: "p3",
        patient_id: "p3",
        risk_zone: "RED",
        risk_reasons: ["Preeklampsiya xavfi"],
        status: "PENDING_DOCTOR_ACK",
        observation: { systolic: 165, diastolic: 110, proteinuria: "++" },
        assigned_practitioner_id: "d1",
        created_at: "2026-11-17T12:00:00Z",
      },
    ],
    calls: [
      {
        id: "c3",
        case_id: "p3",
        target_role: "RELATED_PERSON",
        status: "READY",
        scheduled_at: "2026-11-18T08:00:00+05:00",
        attempts: 0,
        mode: "simulation",
      },
    ],
  };
}
test("acceptance waits for API persistence and refreshed state", async () => {
  const state = apiFixture();
  let posts = 0;
  globalThis.fetch = async (url, opts) => {
    if (opts?.method === "POST") {
      assert.match(url, /\/api\/cases\/p3\/accept$/);
      posts++;
      state.cases[0].status = "DOCTOR_ACCEPTED";
      return { ok: true, json: async () => state.cases[0] };
    }
    return { ok: true, json: async () => structuredClone(state) };
  };
  render(React.createElement(Dashboard));
  const u = user();
  await screen.findByText("Sinov API.");
  await u.click(screen.getByRole("button", { name: "Qabul qilish" }));
  await screen.findByText("Holat qabul qilindi. Yozuv serverda saqlandi.");
  assert.equal(posts, 1);
  assert.ok(screen.getByRole("heading", { name: "Bu navbatda holat yo‘q" }));
  await u.click(screen.getByRole("tab", { name: /Qabul qilingan/ }));
  assert.ok(screen.getByRole("button", { name: /Mohira Rustamova/ }));
});

test("failed writes keep the case pending and show the server error", async () => {
  const state = apiFixture();
  globalThis.fetch = async (url, opts) =>
    opts?.method === "POST"
      ? {
          ok: false,
          status: 409,
          json: async () => ({ detail: "Holat allaqachon o‘zgargan" }),
        }
      : { ok: true, json: async () => structuredClone(state) };
  render(React.createElement(Dashboard));
  const u = user();
  await screen.findByText("Sinov API.");
  await u.click(screen.getByRole("button", { name: "Qabul qilish" }));
  await screen.findByText("API xatosi: Holat allaqachon o‘zgargan");
  assert.ok(screen.getByRole("button", { name: /Mohira Rustamova/ }));
});

test("outreach filters use server status codes, not fabricated call results", async () => {
  const state = apiFixture();
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => structuredClone(state),
  });
  render(React.createElement(Dashboard));
  const u = user();
  await screen.findByText("Sinov API.");
  await u.click(
    within(screen.getByRole("navigation")).getByRole("button", {
      name: "Bemorlar bilan aloqa",
    }),
  );
  await u.click(screen.getByRole("tab", { name: "Navbatda" }));
  assert.ok(screen.getByRole("cell", { name: "Yuborishni kutmoqda" }));
  await u.click(screen.getByRole("tab", { name: "Javobsiz / xatolik" }));
  assert.ok(screen.getByRole("heading", { name: "Aloqa vazifasi yo‘q" }));
});
