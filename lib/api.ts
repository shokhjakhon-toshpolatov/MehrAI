import type { Patient } from "./demo";

export type Outreach = {
  id: string;
  patientId: string;
  patientName: string;
  target: string;
  status: string;
  statusLabel?: string;
  simulated?: boolean;
  scheduledAt: string;
  appointmentId?: string;
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
export type RegistryResult = {
  appointments: Appointment[];
  patients: Patient[];
  calls: Outreach[];
  source: "mock" | "live";
  audit: AuditEvent[];
};

type Observation = Record<string, string | number | boolean | null | undefined>;
type ApiPatient = {
  id: string;
  name: string;
  cohort_type: "MATERNAL" | "NEONATAL";
  age?: number;
  age_days?: number;
  gestational_weeks?: number;
  clinic: string;
};
type ApiCase = {
  id: string;
  patient_id: string;
  risk_zone: string;
  risk_reasons: string[];
  status: string;
  observation: Observation;
  assigned_practitioner_id: string | null;
  escalation_deadline?: string;
  updated_at?: string;
  created_at?: string;
  appointment_time?: string | null;
  referral_status?: string;
};
type ApiCall = {
  id: string;
  case_id: string;
  target_role: string;
  mode: string;
  status: string;
  scheduled_at: string;
  appointment_id?: string;
  attempts: number;
};
type ApiRegistry = {
  appointments?: Appointment[];
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
  PENDING_DOCTOR_ACK: "Shifokor tasdig‘i kutilmoqda",
  ESCALATED: "Eskalatsiya qilindi",
  DOCTOR_ACCEPTED: "Shifokor qabul qildi",
  REFERRED: "Yo‘llanma berildi",
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
  READY: "Qo‘ng‘iroqqa tayyor",
  CONFIRMED: "Tasdiqlangan",
  RESCHEDULE_REQUESTED: "Boshqa vaqt so‘ralgan",
  NO_ANSWER: "Javob olinmagan",
  REACHED: "Bog‘lanildi",
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
): Promise<T> {
  const base = apiBase();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
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
function observationVitals(o: Observation): string[] {
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
          : `${p.gestational_weeks ?? "—"}-hafta`,
      clinic: p.clinic,
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
      time: displayDate(c.appointment_time ?? undefined),
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
    appointmentId: c.appointment_id,
    attempts: c.attempts,
  }));
  return {
    patients,
    calls,
    appointments: (data.appointments ?? []).map((visit) => ({
      ...visit,
      practitioner: visit.practitioner
        ? (doctorIds[visit.practitioner] ?? visit.practitioner)
        : undefined,
    })),
    source: data.mode,
    audit: data.audit ?? [],
  };
}

export async function performCaseAction(
  id: string,
  action: "accept" | "busy" | "call",
): Promise<void> {
  await request(`/api/cases/${encodeURIComponent(id)}/${action}`, "POST");
}

export function recordOutcome(
  id: string,
  outcome: OutreachOutcome,
  attemptId: string,
) {
  return request(`/api/outreach/${encodeURIComponent(id)}/outcome`, "POST", {
    outcome,
    attempt_id: attemptId,
  });
}
export function runScenario(
  scenario: "maternal-red" | "neonatal-red" | "fast-forward",
) {
  return request(`/api/simulate/${scenario}`, "POST");
}

export type FacilityResponse = {
  mode: "timed" | "untimed";
  facility: string;
  practitioner_id?: string;
  start?: string;
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
