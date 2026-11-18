import type { Patient } from "./demo";

export type Outreach = {
  retryChannel?: string;
  id: string;
  patientId: string;
  patientName: string;
  target: string;
  status: string;
  statusLabel?: string;
  simulated?: boolean;
  scheduledAt: string;
  appointmentId?: string;
  appointmentStart?: string;
  attempts: number;
};
export type AuditEvent = {
  id: string;
  case_id: string;
  action: string;
  at: string;
  actor: string;
  mode: string;
  detail: string;
};
export type Appointment = {
  id: string;
  patient: string;
  start?: string;
  status: string;
  practitioner?: string;
  facility?: string;
};
export type OutreachOutcome =
  "REACHED" | "CONFIRMED" | "RESCHEDULE_REQUESTED" | "NO_ANSWER";
export type ContactAttempt = {
  id: string; case_id: string | null; call_id: string; channel: "doctor" | "ai_demo" | "live_test";
  outcome: OutreachOutcome | "SUBMITTING" | "QUEUED" | "RINGING" | "IN_PROGRESS" | "COMPLETED" | "BUSY" | "FAILED" | "CANCELLED" | "CONFIG_ERROR" | "REJECTED" | "UNKNOWN";
  started_at: string; duration_seconds: number | null;
};
export type AvailabilitySlot = {
  id: string;
  practitioner_id: string;
  facility: string;
  start: string;
  end: string;
  available: boolean;
};
export type DemoAnalysis = {
  status: "PENDING" | "RUNNING" | "COMPLETE" | "SUPERSEDED";
  result?: RiskExplanation | null;
};
export type DemoEvent = {
  id: string;
  patient_id: string;
  patient_name: string;
  received_at: string;
  previous_zone?: Patient["zone"];
  zone: Patient["zone"];
  analysis_status?: DemoAnalysis["status"];
  analysis_source?: RiskExplanation["source"];
  analysis_unavailable?: boolean;
  analysis_reason?: string;
  previous_observation?: Observation;
  observation?: Observation;
};
export type DemoStream = {
  id: string;
  status: "STREAMING" | "COMPLETE";
  total: number;
  events: DemoEvent[];
};
export type RegistryResult = {
  history: ContactAttempt[];
  demoStream: DemoStream | null;
  demoAnalyses: Record<string, DemoAnalysis>;
  appointments: Appointment[];
  availability: AvailabilitySlot[];
  patients: Patient[];
  calls: Outreach[];
  source: "mock" | "live";
  audit: AuditEvent[];
};

type Observation = Record<string, string | number | boolean | null | undefined>;
type ApiPatient = {
  id: string;
  name: string;
  cohort_type: Patient["cohort"];
  mother_id?: string;
  contact?: { mother_name?: string };
  postpartum_days?: number;
  age?: number;
  contact_phone?: string;
  age_days?: number;
  gestational_weeks?: number;
  clinic: string;
};
type ApiCase = {
  analysis_eligible?: boolean;
  demo_analysis?: DemoAnalysis;
  id: string;
  patient_id: string;
  risk_zone: string;
  risk_reasons: string[];
  risk_evidence?: string[];
  status: string;
  observation: Observation;
  assigned_practitioner_id: string | null;
  escalation_deadline?: string;
  updated_at?: string;
  created_at?: string;
  appointment_time?: string | null;
  referral_status?: string;
  referral_approved_at?: string;
  urgent_outreach_approved_at?: string;
  previous_risk_zone?: Patient["zone"];
  previous_observation?: Observation;
  follow_up_at?: string;
  follow_up_completed_at?: string;
  assessment_at?: string;
  assessed_by?: string;
};
type ApiCall = {
  retry_channel?: string;
  id: string;
  case_id: string;
  target_role: string;
  mode: string;
  status: string;
  scheduled_at: string;
  appointment_id?: string;
  appointment_start?: string;
  attempts: number;
};
type ApiRegistry = {
  attempt_history?: ContactAttempt[];
  demo_stream?: DemoStream | null;
  appointments?: Appointment[];
  availability?: AvailabilitySlot[];
  mode: "mock" | "live";
  patients: ApiPatient[];
  cases: ApiCase[];
  calls: ApiCall[];
  audit?: AuditEvent[];
};

const doctorIds: Record<string, string> = {
  d1: "rahimova",
  d2: "karimov",
  d3: "umarova",
  d4: "alimov",
};
const statuses: Record<string, string> = {
  ROUTINE: "Rejali kuzatuv",
  POSTPARTUM_FOLLOW_UP: "Kuzatuv kutilmoqda",
  POSTPARTUM_FOLLOWED_UP: "Kuzatuv qayd etildi",
  PENDING_DOCTOR_ACK: "Shifokor tasdig‘i kutilmoqda",
  ESCALATED: "Eskalatsiya qilindi",
  DOCTOR_ACCEPTED: "Shifokor qabul qildi",
  REFERRED: "Yo‘llanma tasdiqlandi",
  REFERRAL_REVIEW: "Shifokor ko‘rigi kutilmoqda",
  VISIT_PROPOSED: "Qabul vaqti taklif qilindi",
  VISIT_UNTIMED: "Vaqtsiz tashrif kelishildi",
  PATIENT_CONFIRMED: "Bemor qabulni tasdiqladi",
  REVIEW_REQUIRED: "Ma’lumotlarni ko‘rib chiqish zarur",
  UNASSIGNED_REVIEW: "Mutaxassis biriktirilmagan",
  NO_SHOW_ALERTED: "Qabulga kelmagan · tekshiruv zarur",
  ATTENDED: "Qabulga kelgan",
};
const targets: Record<string, string> = {
  RELATED_PERSON: "Oila a’zosi",
  MOTHER_OF_NEWBORN: "Chaqaloqning onasi",
  PATIENT: "Bemor",
};
const callStatuses: Record<string, string> = {
  QUEUED: "Navbatda",
  DEMO_CALL_QUEUED: "AI sinov qo‘ng‘irog‘i navbatda",
  DEMO_CALL_RUNNING: "AI sinov qo‘ng‘irog‘i davom etmoqda",
  DEMO_CALL_COMPLETE: "AI sinov qo‘ng‘irog‘i yakunlandi",
  READY: "Qo‘ng‘iroqqa tayyor",
  CONFIRMED: "Tasdiqlangan",
  RESCHEDULE_REQUESTED: "Boshqa vaqt so‘ralgan",
  NO_ANSWER: "Javob olinmagan",
  REACHED: "Bog‘lanildi",
  STAFF_FOLLOW_UP: "Xodim bog‘lanishi kerak",
  CANCELLED: "Bekor qilindi",
  SUPERSEDED: "Yangi kuzatuv bilan almashtirildi",
};

function apiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  const isLocal =
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const value = configured || (isLocal ? "http://127.0.0.1:8000" : "");
  if (!value)
    throw new Error(
      "API manzili sozlanmagan. NEXT_PUBLIC_API_URL ni kiriting va ilovani qayta yig‘ing.",
    );
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("API manzili to‘liq HTTP yoki HTTPS URL bo‘lishi kerak.");
  }
  if (!["http:", "https:"].includes(parsed.protocol))
    throw new Error("API manzili HTTP yoki HTTPS bo‘lishi kerak.");
  return value.replace(/\/+$/, "");
}

async function request<T>(
  path: string,
  method = "GET",
  payload?: object,
  timeoutMs = 12_000,
): Promise<T> {
  const base = apiBase();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${base}${path}`, {
      method,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(payload ? { "Content-Type": "application/json" } : {}),
      },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        detail?: unknown;
      } | null;
      const detail =
        typeof body?.detail === "string"
          ? body.detail
          : `HTTP ${response.status}`;
      throw new Error(`API xatosi: ${detail}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError")
      throw new Error("API javob berish vaqti tugadi. Qayta urinib ko‘ring.");
    if (error instanceof TypeError)
      throw new Error(
        "API bilan bog‘lanib bo‘lmadi. Server va CORS sozlamalarini tekshiring.",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function displayDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("uz-UZ", {
    timeZone: "Asia/Tashkent",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
export function observationVitals(o: Observation): string[] {
  const list: string[] = [];
  if (o.systolic != null && o.diastolic != null)
    list.push(`AQB ${o.systolic}/${o.diastolic} mmHg`);
  if (o.hemoglobin != null) list.push(`Hb ${o.hemoglobin} g/L`);
  if (o.glucose != null) list.push(`Glyukoza ${o.glucose} mmol/L`);
  if (o.proteinuria && o.proteinuria !== "negative" && o.proteinuria !== "-")
    list.push(`Proteinuriya ${o.proteinuria === true ? "+" : o.proteinuria}`);
  if (o.bilirubin != null) list.push(`Bilirubin ${o.bilirubin} µmol/L`);
  if (o.temperature != null) list.push(`Harorat ${o.temperature} °C`);
  if (o.spo2 != null) list.push(`SpO₂ ${o.spo2}%`);
  if (o.weight_loss != null) list.push(`Vazn −${o.weight_loss}%`);
  return list;
}

export async function loadRegistry(): Promise<RegistryResult> {
  const data = await request<ApiRegistry>("/api/registry");
  if (
    !data ||
    !["mock", "live"].includes(data.mode) ||
    !Array.isArray(data.patients) ||
    !Array.isArray(data.cases) ||
    !Array.isArray(data.calls)
  ) {
    throw new Error("API registr formati kutilgan shartnomaga mos emas.");
  }
  const cases = new Map(data.cases.map((c) => [c.patient_id, c]));
  const patients = data.patients.map((p) => {
    const c = cases.get(p.id);
    if (!c || !["RED", "YELLOW", "GREEN", "REVIEW"].includes(c.risk_zone))
      throw new Error(`Bemor ${p.id} uchun xavf bahosi topilmadi.`);
    return {
      id: c.id,
      name: p.name,
      age: p.cohort_type === "NEONATAL" ? (p.age_days ?? 0) : (p.age ?? 0),
      cohort: p.cohort_type,
      stage:
        p.cohort_type === "NEONATAL"
          ? `${p.age_days ?? "—"} kunlik`
          : p.cohort_type === "POSTPARTUM"
            ? `Tug‘ruqdan keyin ${p.postpartum_days ?? "—"} kun`
            : `${p.gestational_weeks ?? "—"}-hafta`,
      motherId: p.mother_id,
      motherName: p.contact?.mother_name,
      assessedAt: c.assessment_at,
      assessedBy: c.assessed_by
        ? (doctorIds[c.assessed_by] ?? c.assessed_by)
        : undefined,
      followUpAt: c.follow_up_at,
      followUpCompletedAt: c.follow_up_completed_at,
      clinic: p.clinic,
      contactPhone: p.contact_phone,
      zone: c.risk_zone as Patient["zone"],
      reason: c.risk_reasons.length
        ? c.risk_reasons.join(" · ")
        : "Ko‘rsatkichlar me’yorda",
      vitals: observationVitals(c.observation),
      doctor: c.assigned_practitioner_id
        ? (doctorIds[c.assigned_practitioner_id] ?? c.assigned_practitioner_id)
        : "",
      status: statuses[c.status] ?? c.status,
      statusCode: c.status,
      deadline: c.escalation_deadline,
      updatedAt: c.updated_at ?? c.created_at,
      appointmentAt: c.appointment_time ?? undefined,
      referralStatus: c.referral_status,
      timeAt: c.follow_up_completed_at ?? c.follow_up_at ?? c.appointment_time ?? undefined,
      referralApprovedAt: c.referral_approved_at,
      urgentOutreachApprovedAt: c.urgent_outreach_approved_at,
      analysisEligible: c.analysis_eligible,
      riskEvidence: c.risk_evidence ?? c.risk_reasons,
      previousZone: c.previous_risk_zone,
      observationVersion: c.created_at,
      previousVitals: c.previous_observation
        ? observationVitals(c.previous_observation)
        : undefined,
      time: displayDate(
        c.follow_up_completed_at ??
          c.follow_up_at ??
          c.appointment_time ??
          undefined,
      ),
    };
  });
  const names = new Map(
    data.cases.map((c) => [
      c.id,
      data.patients.find((p) => p.id === c.patient_id)?.name ?? c.patient_id,
    ]),
  );
  const calls = data.calls.map((c) => ({
    id: c.id,
    patientId: c.case_id,
    patientName: names.get(c.case_id) ?? c.case_id,
    target: targets[c.target_role] ?? c.target_role,
    status: c.status,
    statusLabel: `${callStatuses[c.status] ?? c.status}`,
    simulated: c.mode === "simulation",
    scheduledAt: c.scheduled_at,
    retryChannel: c.retry_channel,
    appointmentId: c.appointment_id,
    appointmentStart: c.appointment_start,
    attempts: c.attempts,
  }));
  return {
    patients,
    calls,
    demoStream: data.demo_stream ?? null,
    demoAnalyses: Object.fromEntries(
      data.cases.flatMap((c) =>
        c.demo_analysis ? [[c.id, c.demo_analysis]] : [],
      ),
    ),
    appointments: (data.appointments ?? []).map((visit) => ({
      ...visit,
      practitioner: visit.practitioner
        ? (doctorIds[visit.practitioner] ?? visit.practitioner)
        : undefined,
    })),
    history: (data.attempt_history ?? []).sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at)),
    availability: data.availability ?? [],
    source: data.mode,
    audit: data.audit ?? [],
  };
}

export async function performCaseAction(
  id: string,
  action: "accept" | "busy" | "call" | "postpartum-follow-up",
): Promise<void> {
  await request(`/api/cases/${encodeURIComponent(id)}/${action}`, "POST");
}

export function openContact(id: string) {
  return request<{ id: string }>(`/api/cases/${encodeURIComponent(id)}/call`, "POST");
}
export function phoneSetup() {
  return request<{ missing: string[]; last_four: string }>("/api/phone/setup");
}
export function ringHandset(requestId: string, patientId?: string) {
  return request<{ outcome: ContactAttempt["outcome"] }>("/api/phone/ring", "POST",
    { request_id: requestId, patient_id: patientId });
}
export function cancelRetries(id: string) {
  return request(`/api/outreach/${encodeURIComponent(id)}/cancel-retries`, "POST");
}
export function savePhone(id: string, phone: string) {
  return request(`/api/patients/${encodeURIComponent(id)}/contact`, "PUT", { phone });
}
export function checkVoiceLab() {
  return request<{ status: "connected" | "missing_key" | "permission_denied" | "unavailable" }>("/api/voicelab/connection");
}
export function recordOutcome(
  id: string,
  outcome: OutreachOutcome,
  attemptId: string,
  details?: { duration_seconds?: number; channel?: "doctor" | "ai_demo"; started_at?: string },
) {
  return request(`/api/outreach/${encodeURIComponent(id)}/outcome`, "POST", {
    outcome,
    attempt_id: attemptId,
    ...details,
  });
}
export function runScenario(
  scenario: "maternal-red" | "neonatal-red" | "fast-forward",
) {
  return request(`/api/simulate/${scenario}`, "POST");
}

export type FacilityResponse = {
  mode: "timed" | "untimed";
  facility?: string;
  practitioner_id?: string;
  start?: string;
  slot_id?: string;
  confirmed: boolean;
};
export function recordFacilityResponse(
  caseId: string,
  response: FacilityResponse,
) {
  return request(
    `/api/referrals/${encodeURIComponent(caseId)}/response`,
    "POST",
    response,
  );
}
export function recordAttendance(visitId: string) {
  return request(`/api/visits/${encodeURIComponent(visitId)}/attended`, "POST");
}

export function approveReferral(caseId: string, practitionerId: string) {
  return request(
    `/api/referrals/${encodeURIComponent(caseId)}/approve`,
    "POST",
    { practitioner_id: practitionerId },
  );
}

export type RiskExplanation = {
  source: "rules" | "openrouter";
  analyzer_status?: "not_configured" | "unavailable";
  review_focus?:
    "VERIFY_CHANGE" | "MISSING_OBSERVATIONS" | "SCREENING_FINDINGS";
  zone: Patient["zone"];
  reasons: string[];
  model?: string;
};
export function explainRisk(caseId: string) {
  return request<RiskExplanation>(
    `/api/cases/${encodeURIComponent(caseId)}/explanation`,
    "POST",
    undefined,
    20_000,
  );
}

export function bookUrgentVisit(
  caseId: string,
  practitionerId: string,
  start: string,
) {
  return request(
    `/api/cases/${encodeURIComponent(caseId)}/urgent-visit`,
    "POST",
    { practitioner_id: practitionerId, start },
  );
}

export function startDemoStream() {
  return request<DemoStream>("/api/simulation/start", "POST");
}
