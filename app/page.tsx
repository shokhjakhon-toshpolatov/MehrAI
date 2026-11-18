"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Baby,
  Building2,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  FileCheck2,
  HeartPulse,
  LayoutDashboard,
  ListFilter,
  LoaderCircle,
  Menu,
  Phone,
  PhoneMissed,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Stethoscope,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import Registry from "@/components/Registry";
import { doctors, Patient, seedPatients, Zone } from "@/lib/demo";
import { loadRegistry, performCaseAction, Outreach } from "@/lib/api";

type View =
  "overview" | "registry" | "appointments" | "outreach" | "facilities";
const titles: Record<View, string> = {
  overview: "Klinik ish stoli",
  registry: "Perinatal registr",
  appointments: "Qabullar va tashriflar",
  outreach: "Bemorlar bilan aloqa",
  facilities: "Tibbiyot muassasalari",
};
const subtitles: Record<View, string> = {
  overview:
    "E’tibor talab qiladigan holatlar va bajarilishi kerak bo‘lgan ishlar.",
  registry: "Homilador ayollar va chaqaloqlarning yagona kuzatuv registri.",
  appointments:
    "Mutaxassis qabullari, tasdiqlash holati va bemorlarning tashrifi.",
  outreach:
    "Aloqa natijalari, javobsiz qo‘ng‘iroqlar va qayta bog‘lanish navbati.",
  facilities: "Muassasalar bo‘yicha kuzatuv yuklamasi va xavfli holatlar.",
};
const zoneNames: Record<Zone, string> = {
  RED: "QIZIL · Shoshilinch",
  YELLOW: "SARIQ · Ko‘rik zarur",
  GREEN: "YASHIL · Barqaror",
  REVIEW: "TEKSHIRISH ZARUR",
};
const doctorName = (id: string) => {
  const d = doctors.find((d) => d.id === id);
  return d ? `Dr. ${d.name}` : "Shifokor biriktirilmagan";
};
const pending = (p: Patient) =>
  p.zone === "RED" &&
  ["PENDING_DOCTOR_ACK", "ESCALATED"].includes(p.statusCode || "");
function Deadline({ value }: { value?: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!value) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [value]);
  if (!value) return <span>Tasdiqlash zarur</span>;
  const diff = Math.max(0, Math.floor((Date.parse(value) - now) / 1000));
  return (
    <span>
      {diff === 0
        ? "Muddat tugadi"
        : `${String(Math.floor(diff / 60)).padStart(2, "0")}:${String(diff % 60).padStart(2, "0")}`}
    </span>
  );
}

export default function Dashboard() {
  const [view, setView] = useState<View>("overview");
  const [patients, setPatients] = useState<Patient[]>(seedPatients);
  const [calls, setCalls] = useState<Outreach[]>([]);
  const [persona, setPersona] = useState("district");
  const [risk, setRisk] = useState("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const [source, setSource] = useState<"reference" | "mock" | "live">(
    "reference",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [queueTab, setQueueTab] = useState("urgent");
  const [appointmentFilter, setAppointmentFilter] = useState("all");
  const [outreachFilter, setOutreachFilter] = useState("all");
  const [help, setHelp] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 5500);
  };
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadRegistry();
      setPatients(data.patients);
      setCalls(data.calls);
      setSource(data.source);
      setLastSync(new Date());
      setError("");
    } catch {
      setError("Server bilan aloqa yo‘q");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => {
      clearInterval(interval);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [refresh]);
  useEffect(() => {
    if (!selectedId && !help) return;
    const previous = document.activeElement as HTMLElement | null;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedId(null);
        setHelp(false);
      }
      if (e.key === "Tab" && dialogRef.current) {
        const nodes = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not(:disabled),a[href],input,select,[tabindex="0"]',
          ),
        );
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", listener);
    return () => {
      window.removeEventListener("keydown", listener);
      document.body.style.overflow = bodyOverflow;
      previous?.focus();
    };
  }, [selectedId, help]);
  const selected = patients.find((p) => p.id === selectedId);
  const canWrite = source !== "reference" && !error && !loading;
  const scoped = patients.filter(
    (p) => persona === "district" || p.doctor === persona,
  );
  const urgent = scoped.filter(pending);
  const review = scoped.filter((p) => p.zone === "REVIEW");
  const planned = scoped.filter((p) => p.zone === "YELLOW");
  const stable = scoped.filter((p) => p.zone === "GREEN");
  const accepted = scoped.filter((p) => p.statusCode === "DOCTOR_ACCEPTED");
  const queue =
    queueTab === "urgent"
      ? urgent
      : queueTab === "review"
        ? review
        : queueTab === "planned"
          ? planned
          : accepted;
  async function act(p: Patient, action: "accept" | "busy" | "call") {
    if (!canWrite) {
      notify("Serverga ulanmasdan o‘zgartirish kiritib bo‘lmaydi.");
      return;
    }
    setBusy(true);
    try {
      await performCaseAction(p.id, action);
      await refresh();
      notify(
        action === "accept"
          ? "Holat qabul qilindi. Yozuv serverda saqlandi."
          : action === "busy"
            ? "Holat navbatchilik tartibi bo‘yicha yo‘naltirildi."
            : source === "mock"
              ? "Aloqa vazifasi sinov serverida navbatga qo‘shildi."
              : "Aloqa vazifasi navbatga qo‘shildi.",
      );
    } catch (e) {
      notify(
        e instanceof Error
          ? e.message
          : "Saqlash amalga oshmadi. Qayta urinib ko‘ring.",
      );
    } finally {
      setBusy(false);
    }
  }
  const navigate = (next: View) => {
    setView(next);
    setMobile(false);
  };
  const openRegistry = (zone = "ALL") => {
    setRisk(zone);
    navigate("registry");
  };
  const appointmentPatients = scoped.filter(
    (p) =>
      (p.appointmentAt || p.zone === "YELLOW") &&
      (appointmentFilter === "all" ||
        (appointmentFilter === "confirmed"
          ? p.statusCode === "PATIENT_CONFIRMED" ||
            p.status.includes("tasdiqlandi")
          : appointmentFilter === "missed"
            ? p.statusCode === "NO_SHOW_ALERTED"
            : p.statusCode === "ATTENDED")),
  );
  const scopedCalls = calls.filter((c) =>
    scoped.some((p) => p.id === c.patientId),
  );
  const visibleCalls = scopedCalls.filter(
    (c) =>
      outreachFilter === "all" ||
      (outreachFilter === "failed"
        ? c.status === "NO_ANSWER" || c.status === "FAILED"
        : c.status === "QUEUED" || c.status === "READY"),
  );
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <a href="/" className="brand" aria-label="DMED bosh sahifa">
          <span className="brand-mark">
            <Plus strokeWidth={4} size={25} />
          </span>
          dmed<span className="brand-dot">.</span>
        </a>
        <div className="product-name">
          <HeartPulse size={22} />
          <div>
            <strong>Perinatal nazorat</strong>
            <span>Onalik va bolalik</span>
          </div>
        </div>
        <div className="nav-label">KLINIK ISH MAYDONI</div>
        <nav aria-label="Asosiy navigatsiya">
          {(
            [
              { id: "overview", icon: LayoutDashboard, label: "Ish stoli" },
              { id: "registry", icon: Users, label: "Bemorlar registri" },
              { id: "appointments", icon: CalendarDays, label: "Qabullar" },
              { id: "outreach", icon: Phone, label: "Bemorlar bilan aloqa" },
              { id: "facilities", icon: Building2, label: "Muassasalar" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              aria-current={view === item.id ? "page" : undefined}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.id === "overview" && urgent.length > 0 && (
                <b className="nav-counter">{urgent.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="district-label">
            <Building2 size={18} />
            <div>
              <strong>Yunusobod tumani</strong>
              <span>Toshkent shahri · OVaBMU</span>
            </div>
          </div>
          <button className="connection-button" onClick={() => setHelp(true)}>
            <span className={`connection-dot ${canWrite ? "connected" : ""}`} />
            <div>
              <strong>
                {source === "reference"
                  ? "Ma’lumot manbasi ulanmagan"
                  : error
                    ? "Ulanish uzildi"
                    : source === "mock"
                      ? "Sinov API ulangan"
                      : "API ulangan"}
              </strong>
              <span>Ulanish tafsilotlari</span>
            </div>
            <ChevronRight size={15} />
          </button>
        </div>
      </aside>
      {mobile && (
        <button
          aria-label="Menyuni yopish"
          className="mobile-scrim"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              aria-label="Menyu"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={22} />
            </button>
            <span>DMED</span>
            <ChevronRight size={14} />
            <span>Onalik va bolalik</span>
            <ChevronRight size={14} />
            <strong>{titles[view]}</strong>
          </div>
          <div className="scope-control">
            <Stethoscope size={17} />
            <select
              value={persona}
              aria-label="Mas’ul shifokor bo‘yicha ko‘rinish"
              onChange={(e) => setPersona(e.target.value)}
            >
              <option value="district">Tuman bo‘yicha</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  Dr. {d.name}
                </option>
              ))}
            </select>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">PERINATAL MONITORING</div>
              <h1>{titles[view]}</h1>
              <p>{subtitles[view]}</p>
            </div>
            <div className="heading-actions">
              {lastSync && !error && (
                <span className="sync-time">
                  Yangilandi{" "}
                  {lastSync.toLocaleTimeString("uz-UZ", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Tashkent",
                  })}
                </span>
              )}
              <button className="button" onClick={refresh} disabled={loading}>
                <RefreshCw size={16} className={loading ? "spin" : ""} />
                Yangilash
              </button>
            </div>
          </div>
          {(source === "reference" || error) && (
            <div className="source-banner">
              <WifiOff size={16} />
              <span>
                {source === "reference" ? (
                  <>
                    <strong>Namuna ma’lumotlari · faqat ko‘rish.</strong> Klinik
                    server ulanmagan. O‘zgartirishlar va qo‘ng‘iroqlar
                    o‘chirilgan.
                  </>
                ) : (
                  <>
                    <strong>Server bilan aloqa uzildi.</strong> Oxirgi yuklangan
                    ma’lumotlar. O‘zgartirish kiritish vaqtincha o‘chirilgan.
                  </>
                )}
              </span>
              <button onClick={() => setHelp(true)}>
                Tafsilotlar
                <ArrowUpRight size={13} />
              </button>
            </div>
          )}
          {source === "mock" && !error && (
            <div className="source-banner test-source">
              <ShieldCheck size={16} />
              <span>
                <strong>Sinov API.</strong> Yozuvlar serverda saqlanadi.
                Bemorlar sun’iy, tashqi qo‘ng‘iroqlar yuborilmaydi.
              </span>
            </div>
          )}
          {view === "overview" && (
            <>
              <section className="risk-summary" aria-label="Xavf darajalari">
                <button
                  className="risk-card urgent"
                  onClick={() => {
                    setQueueTab("urgent");
                  }}
                >
                  <div className="risk-card-top">
                    <span>QIZIL ZONA</span>
                    <CircleAlert size={23} />
                  </div>
                  <div className="risk-card-count">
                    {scoped.filter((p) => p.zone === "RED").length}
                    <span>shoshilinch holat</span>
                  </div>
                  <div className="risk-card-footer">
                    <strong>{urgent.length} ta tasdiqlash kutilmoqda</strong>
                    <ArrowRight size={18} />
                  </div>
                </button>
                <button
                  className="risk-card warning"
                  onClick={() => setQueueTab("planned")}
                >
                  <div className="risk-card-top">
                    <span>SARIQ ZONA</span>
                    <Clock3 size={23} />
                  </div>
                  <div className="risk-card-count">
                    {planned.length}
                    <span>ko‘rik talab qilinadi</span>
                  </div>
                  <div className="risk-card-footer">
                    <strong>Belgilangan muddatda ko‘rik</strong>
                    <ArrowRight size={18} />
                  </div>
                </button>
                <button
                  className="risk-card healthy"
                  onClick={() => openRegistry("GREEN")}
                >
                  <div className="risk-card-top">
                    <span>YASHIL ZONA</span>
                    <ShieldCheck size={23} />
                  </div>
                  <div className="risk-card-count">
                    {stable.length}
                    <span>barqaror holat</span>
                  </div>
                  <div className="risk-card-footer">
                    <strong>Rejali kuzatuv davom etadi</strong>
                    <ArrowRight size={18} />
                  </div>
                </button>
                <button
                  className="risk-card total"
                  onClick={() => openRegistry()}
                >
                  <div className="risk-card-top">
                    <span>JAMI KUZATUVDA</span>
                    <Users size={23} />
                  </div>
                  <div className="risk-card-count">
                    {scoped.length}
                    <span>bemor</span>
                  </div>
                  <div className="risk-card-footer">
                    <strong>
                      {scoped.filter((p) => p.cohort === "MATERNAL").length}{" "}
                      homilador ·{" "}
                      {scoped.filter((p) => p.cohort === "NEONATAL").length}{" "}
                      chaqaloq
                    </strong>
                    <ArrowRight size={18} />
                  </div>
                </button>
              </section>
              <div className="work-grid">
                <section className="panel action-queue">
                  <div className="panel-heading">
                    <div>
                      <h2>Amal talab qiladigan holatlar</h2>
                      <p>Shoshilinchlik bo‘yicha tartiblangan</p>
                    </div>
                    <span className="panel-count">
                      {urgent.length + review.length + planned.length} holat
                    </span>
                  </div>
                  <div
                    className="work-tabs"
                    role="tablist"
                    aria-label="Ish navbati"
                  >
                    {[
                      {
                        id: "urgent",
                        label: "Shoshilinch",
                        count: urgent.length,
                      },
                      {
                        id: "review",
                        label: "Tekshirish",
                        count: review.length,
                      },
                      {
                        id: "planned",
                        label: "Ko‘rik zarur",
                        count: planned.length,
                      },
                      {
                        id: "accepted",
                        label: "Qabul qilingan",
                        count: accepted.length,
                      },
                    ].map((t) => (
                      <button
                        key={t.id}
                        role="tab"
                        aria-selected={queueTab === t.id}
                        className={queueTab === t.id ? "active" : ""}
                        onClick={() => setQueueTab(t.id)}
                      >
                        {t.label}
                        <span
                          className={
                            t.id === "urgent" && t.count ? "count-danger" : ""
                          }
                        >
                          {t.count}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="queue-content">
                    {queue.length ? (
                      queue.map((p) => (
                        <article
                          key={p.id}
                          className={`case-card case-${p.zone.toLowerCase()}`}
                        >
                          <div className="case-heading">
                            <span
                              className={`zone-badge zone-${p.zone.toLowerCase()}`}
                            >
                              {p.zone === "RED" ? (
                                <CircleAlert size={14} />
                              ) : (
                                <Clock3 size={14} />
                              )}{" "}
                              {zoneNames[p.zone]}
                            </span>
                            {p.zone === "RED" && pending(p) && (
                              <span className="case-deadline">
                                <Clock3 size={14} />
                                <Deadline value={p.deadline} />
                              </span>
                            )}
                          </div>
                          <div className="case-patient">
                            <div>
                              <button onClick={() => setSelectedId(p.id)}>
                                {p.name}
                                <ArrowUpRight size={17} />
                              </button>
                              <p>
                                {p.cohort === "NEONATAL" ? (
                                  <Baby size={14} />
                                ) : (
                                  <Users size={14} />
                                )}{" "}
                                {p.stage}
                                <span>·</span>
                                {p.clinic}
                                <span>·</span>
                                {p.id}
                              </p>
                            </div>
                          </div>
                          <div className="clinical-reason">
                            <strong>{p.reason}</strong>
                            <div>
                              {p.vitals.map((v) => (
                                <span key={v}>{v}</span>
                              ))}
                            </div>
                          </div>
                          <div className="case-assignment">
                            <Stethoscope size={16} />
                            <span>{doctorName(p.doctor)}</span>
                            <span className="assignment-label">
                              Mas’ul mutaxassis
                            </span>
                          </div>
                          <div className="case-actions">
                            <button
                              className={`button ${p.zone === "RED" ? "danger" : "primary"}`}
                              onClick={() => setSelectedId(p.id)}
                            >
                              Holatni ko‘rib chiqish
                              <ArrowRight size={16} />
                            </button>
                            {canWrite && pending(p) && (
                              <button
                                className="button"
                                disabled={busy}
                                onClick={() => act(p, "accept")}
                              >
                                <CheckCheck size={16} />
                                Qabul qilish
                              </button>
                            )}
                          </div>
                        </article>
                      ))
                    ) : (
                      <div className="empty-state">
                        <CheckCheck size={30} />
                        <h3>Bu navbatda holat yo‘q</h3>
                        <p>
                          Tanlangan shifokor bo‘yicha ushbu turdagi ishlar
                          mavjud emas.
                        </p>
                      </div>
                    )}
                  </div>
                </section>
                <aside className="operational-rail">
                  <section className="panel followup-panel">
                    <div className="panel-heading">
                      <h2>Keyingi ishlar</h2>
                      <ListFilter size={18} />
                    </div>
                    <button
                      className="task-row"
                      onClick={() => setQueueTab("urgent")}
                    >
                      <span className="task-symbol red-symbol">
                        <CircleAlert size={19} />
                      </span>
                      <div>
                        <strong>Shifokor tasdig‘i</strong>
                        <p>Shoshilinch holatni qabul qilish</p>
                      </div>
                      <b>{urgent.length}</b>
                      <ChevronRight size={16} />
                    </button>
                    <button
                      className="task-row"
                      onClick={() => navigate("appointments")}
                    >
                      <span className="task-symbol yellow-symbol">
                        <CalendarDays size={19} />
                      </span>
                      <div>
                        <strong>Rejalashtirilgan ko‘riklar</strong>
                        <p>Qabul va kelish holatini tekshirish</p>
                      </div>
                      <b>{planned.length}</b>
                      <ChevronRight size={16} />
                    </button>
                    <button
                      className="task-row"
                      onClick={() => navigate("outreach")}
                    >
                      <span className="task-symbol blue-symbol">
                        <PhoneMissed size={19} />
                      </span>
                      <div>
                        <strong>Aloqa nazorati</strong>
                        <p>
                          {source === "reference"
                            ? "Aloqa xizmati ulanmagan"
                            : "Qo‘ng‘iroq navbatini ko‘rish"}
                        </p>
                      </div>
                      {source !== "reference" && (
                        <b>
                          {
                            scopedCalls.filter(
                              (c) =>
                                c.status === "READY" ||
                                c.status === "QUEUED" ||
                                c.status === "NO_ANSWER",
                            ).length
                          }
                        </b>
                      )}
                      <ChevronRight size={16} />
                    </button>
                  </section>
                  <section className="panel duty-panel">
                    <div className="panel-heading">
                      <h2>Navbatchi mutaxassislar</h2>
                      <Stethoscope size={18} />
                    </div>
                    {doctors
                      .filter((d) => d.role !== "Konsultant")
                      .map((d) => (
                        <div className="duty-row" key={d.id}>
                          <span className="doctor-initials">{d.initials}</span>
                          <div>
                            <strong>Dr. {d.name}</strong>
                            <p>{d.specialty}</p>
                            <span>{d.role}</span>
                          </div>
                        </div>
                      ))}
                    <div className="roster-note">
                      {source === "reference"
                        ? "Namunaviy navbatchilik ro‘yxati"
                        : "API navbatchilik ro‘yxati"}
                    </div>
                  </section>
                  <div className="escalation-policy">
                    <Clock3 size={19} />
                    <div>
                      <strong>15 daqiqalik tasdiqlash muddati</strong>
                      <p>
                        Tasdiqlanmagan shoshilinch holat navbatchilik tartibi
                        bo‘yicha zaxira mutaxassisga yo‘naltiriladi.
                      </p>
                    </div>
                  </div>
                </aside>
              </div>
            </>
          )}
          {view === "registry" && (
            <Registry
              patients={patients}
              onSelect={(p) => setSelectedId(p.id)}
              persona={persona}
              riskFilter={risk}
              onRiskFilter={setRisk}
            />
          )}
          {view === "appointments" && (
            <section className="panel appointments-panel">
              <div className="panel-heading">
                <div>
                  <h2>Qabul jadvali</h2>
                  <p>
                    Shoshilinch yordam holatlari rejali qabulga kiritilmaydi
                  </p>
                </div>
                <span className="panel-count">
                  {appointmentPatients.length} qabul
                </span>
              </div>
              <div
                className="work-tabs"
                role="tablist"
                aria-label="Qabul holati"
              >
                {[
                  { id: "all", label: "Barcha qabullar" },
                  { id: "confirmed", label: "Tasdiqlangan" },
                  { id: "missed", label: "Kelmagan" },
                  { id: "attended", label: "Tashrif buyurgan" },
                ].map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={appointmentFilter === t.id}
                    className={appointmentFilter === t.id ? "active" : ""}
                    onClick={() => setAppointmentFilter(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="schedule-list">
                {appointmentPatients.length ? (
                  appointmentPatients.map((p) => (
                    <article className="appointment-row" key={p.id}>
                      <div className="appointment-time">
                        <CalendarDays size={19} />
                        <strong>
                          {p.appointmentAt
                            ? new Date(p.appointmentAt).toLocaleDateString(
                                "uz-UZ",
                                {
                                  day: "numeric",
                                  month: "short",
                                  timeZone: "Asia/Tashkent",
                                },
                              )
                            : p.time.split(",")[0]}
                        </strong>
                        <span>
                          {p.appointmentAt
                            ? new Date(p.appointmentAt).toLocaleTimeString(
                                "uz-UZ",
                                {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  timeZone: "Asia/Tashkent",
                                },
                              )
                            : p.time.split(",")[1]?.trim() ||
                              "Vaqt belgilanmagan"}
                        </span>
                      </div>
                      <div className="appointment-patient">
                        <button onClick={() => setSelectedId(p.id)}>
                          {p.name}
                        </button>
                        <p>
                          {p.stage} · {p.reason}
                        </p>
                      </div>
                      <div className="appointment-doctor">
                        <strong>{doctorName(p.doctor)}</strong>
                        <p>{p.clinic}</p>
                      </div>
                      <span
                        className={`appointment-status ${p.statusCode === "PATIENT_CONFIRMED" || p.status.includes("tasdiqlandi") ? "confirmed" : ""}`}
                      >
                        {p.status}
                      </span>
                      <button
                        className="icon-button"
                        aria-label={`${p.name}: qabul tafsilotlari`}
                        onClick={() => setSelectedId(p.id)}
                      >
                        <ChevronRight size={19} />
                      </button>
                    </article>
                  ))
                ) : (
                  <div className="empty-state">
                    <CalendarDays size={32} />
                    <h3>Ushbu holatda qabul yo‘q</h3>
                    <p>Tanlangan filtrga mos qabul topilmadi.</p>
                  </div>
                )}
              </div>
            </section>
          )}
          {view === "outreach" && (
            <>
              <div className="outreach-summary">
                <div>
                  <Phone size={20} />
                  <span>Jami aloqa vazifalari</span>
                  <strong>
                    {source === "reference" ? "—" : scopedCalls.length}
                  </strong>
                </div>
                <div>
                  <Clock3 size={20} />
                  <span>Navbatda</span>
                  <strong>
                    {source === "reference"
                      ? "—"
                      : scopedCalls.filter(
                          (c) => c.status === "READY" || c.status === "QUEUED",
                        ).length}
                  </strong>
                </div>
                <div>
                  <PhoneMissed size={20} />
                  <span>Bog‘lanish talab qilinadi</span>
                  <strong>
                    {source === "reference"
                      ? "—"
                      : scopedCalls.filter(
                          (c) =>
                            c.status === "NO_ANSWER" || c.status === "FAILED",
                        ).length}
                  </strong>
                </div>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Aloqa vazifalari</h2>
                    <p>Bemor va oila bilan bog‘lanish natijalari</p>
                  </div>
                </div>
                <div
                  className="work-tabs"
                  role="tablist"
                  aria-label="Aloqa holati"
                >
                  {[
                    { id: "all", label: "Barchasi" },
                    { id: "queued", label: "Navbatda" },
                    { id: "failed", label: "Javobsiz / xatolik" },
                  ].map((t) => (
                    <button
                      key={t.id}
                      role="tab"
                      aria-selected={outreachFilter === t.id}
                      className={outreachFilter === t.id ? "active" : ""}
                      onClick={() => setOutreachFilter(t.id)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                {source === "reference" ? (
                  <div className="empty-state connection-empty">
                    <PhoneMissed size={34} />
                    <h3>Aloqa xizmati ulanmagan</h3>
                    <p>
                      Qo‘ng‘iroq natijalari faqat xizmatdan kelgan tasdiqlangan
                      ma’lumotlar asosida ko‘rsatiladi.
                    </p>
                    <button className="button" onClick={() => setHelp(true)}>
                      Ulanish holatini ko‘rish
                      <ArrowRight size={15} />
                    </button>
                  </div>
                ) : visibleCalls.length ? (
                  <div className="outreach-table-wrap">
                    <table className="outreach-table">
                      <thead>
                        <tr>
                          <th>Bemor</th>
                          <th>Aloqa oluvchi</th>
                          <th>Rejalashtirilgan</th>
                          <th>Urinishlar</th>
                          <th>Holat</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {visibleCalls.map((c) => (
                          <tr key={c.id}>
                            <td>
                              <strong>{c.patientName}</strong>
                              <small>{c.patientId}</small>
                            </td>
                            <td>{c.target}</td>
                            <td>
                              {new Date(c.scheduledAt).toLocaleString("uz-UZ", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                                timeZone: "Asia/Tashkent",
                              })}
                            </td>
                            <td>{c.attempts}</td>
                            <td>
                              <span className="call-status">
                                {{
                                  QUEUED: "Rejalashtirilgan",
                                  READY: "Yuborishni kutmoqda",
                                  NO_ANSWER: "Javob yo‘q",
                                  FAILED: "Xatolik",
                                  COMPLETED: "Yakunlangan",
                                }[c.status] || c.status}
                              </span>
                            </td>
                            <td>
                              <button
                                className="button compact"
                                onClick={() => setSelectedId(c.patientId)}
                              >
                                Bemor kartasi
                                <ChevronRight size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-state">
                    <CheckCheck size={30} />
                    <h3>Aloqa vazifasi yo‘q</h3>
                    <p>Ushbu filtr bo‘yicha yozuv mavjud emas.</p>
                  </div>
                )}
              </section>
            </>
          )}
          {view === "facilities" && (
            <section className="panel facilities-panel">
              <div className="panel-heading">
                <div>
                  <h2>Muassasalar bo‘yicha kuzatuv</h2>
                  <p>Joriy registrdagi bemorlar va mas’ul mutaxassislar</p>
                </div>
                <span className="panel-count">
                  {new Set(scoped.map((p) => p.clinic)).size} muassasa
                </span>
              </div>
              {Array.from(new Set(scoped.map((p) => p.clinic))).map(
                (clinic) => {
                  const group = scoped.filter((p) => p.clinic === clinic);
                  return (
                    <article className="facility" key={clinic}>
                      <div className="facility-title">
                        <span className="facility-icon">
                          <Building2 size={25} />
                        </span>
                        <div>
                          <h3>{clinic}</h3>
                          <p>
                            {group.length} bemor ·{" "}
                            {
                              group.filter((p) => p.cohort === "MATERNAL")
                                .length
                            }{" "}
                            homilador ·{" "}
                            {
                              group.filter((p) => p.cohort === "NEONATAL")
                                .length
                            }{" "}
                            chaqaloq
                          </p>
                        </div>
                      </div>
                      <div className="facility-risk">
                        {(["RED", "YELLOW", "GREEN", "REVIEW"] as Zone[])
                          .filter(
                            (z) =>
                              z !== "REVIEW" ||
                              group.some((p) => p.zone === "REVIEW"),
                          )
                          .map((z) => (
                            <span
                              key={z}
                              className={`facility-zone ${z.toLowerCase()}`}
                            >
                              <b>{group.filter((p) => p.zone === z).length}</b>
                              {zoneNames[z].split(" · ")[0]}
                            </span>
                          ))}
                      </div>
                      <div className="facility-doctors">
                        <span>Mas’ul shifokorlar</span>
                        {Array.from(new Set(group.map((p) => p.doctor))).map(
                          (d) => (
                            <strong key={d}>{doctorName(d)}</strong>
                          ),
                        )}
                      </div>
                    </article>
                  );
                },
              )}
            </section>
          )}
          <footer className="main-footer">
            <span>DMED · Perinatal nazorat</span>
            <span>
              {source === "reference"
                ? "Namunaviy registr — klinik ma’lumot emas"
                : source === "mock"
                  ? "Sinov API · sun’iy bemorlar"
                  : error
                    ? "Ma’lumotlar yangilanmayapti"
                    : "Server ma’lumotlari"}
            </span>
          </footer>
        </main>
      </div>
      {(selected || help) && (
        <div
          className="overlay"
          onClick={() => {
            setSelectedId(null);
            setHelp(false);
          }}
        >
          <section
            ref={dialogRef}
            tabIndex={-1}
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-header">
              <span>{help ? "MA’LUMOT MANBASI" : "BEMOR KARTASI"}</span>
              <button
                className="icon-button"
                aria-label="Yopish"
                onClick={() => {
                  setSelectedId(null);
                  setHelp(false);
                }}
              >
                <X size={22} />
              </button>
            </div>
            {help ? (
              <>
                <h2 id="drawer-title">Ulanish holati</h2>
                <div
                  className={`connection-detail ${error ? "unavailable" : ""}`}
                >
                  <span className="connection-dot" />
                  <strong>
                    {source === "reference"
                      ? "Klinik server ulanmagan"
                      : error
                        ? "Serverga ulanish uzilgan"
                        : source === "mock"
                          ? "Sinov API ulangan"
                          : "API ulangan"}
                  </strong>
                </div>
                <p className="drawer-description">
                  {source === "reference"
                    ? "Hozir namunaviy registr ko‘rsatilmoqda. Qabul qilish, yo‘naltirish va aloqa yaratish uchun server ulanishi talab etiladi."
                    : "Bemor kartalari va holat o‘zgarishlari API orqali yuklanadi. Server javobi olinmaguncha o‘zgarish tasdiqlanmaydi."}
                </p>
                <div className="detail-section">
                  <h3>Xizmatlar</h3>
                  <dl className="connection-services">
                    <div>
                      <dt>Registr API</dt>
                      <dd>
                        {source === "reference"
                          ? "Ulanmagan"
                          : error
                            ? "Ulanish uzilgan"
                            : "Ulangan"}
                      </dd>
                    </div>
                    <div>
                      <dt>DMED integratsiyasi</dt>
                      <dd>
                        {source === "live" ? "API manbasi" : "Sozlanmagan"}
                      </dd>
                    </div>
                    <div>
                      <dt>Ovozli aloqa provayderi</dt>
                      <dd>Tasdiqlanmagan</dd>
                    </div>
                  </dl>
                </div>
                <button
                  className="button primary"
                  disabled={loading}
                  onClick={refresh}
                >
                  <RefreshCw size={16} />
                  Ulanishni qayta tekshirish
                </button>
              </>
            ) : (
              selected && (
                <>
                  <span
                    className={`zone-badge zone-${selected.zone.toLowerCase()}`}
                  >
                    <CircleAlert size={14} />
                    {zoneNames[selected.zone]}
                  </span>
                  <h2 id="drawer-title">{selected.name}</h2>
                  <p className="patient-subtitle">
                    {selected.id} · {selected.stage} · {selected.clinic}
                  </p>
                  <div
                    className={`clinical-alert ${selected.zone.toLowerCase()}`}
                  >
                    <strong>{selected.reason}</strong>
                    <p>
                      {selected.zone === "RED"
                        ? "Navbatchi mutaxassis tomonidan zudlik bilan ko‘rib chiqish talab etiladi."
                        : selected.zone === "YELLOW"
                          ? "Mutaxassis ko‘rigi va belgilangan qabulni kuzatish talab etiladi."
                          : selected.zone === "REVIEW"
                            ? "Ma’lumotlarni tekshirish va shifokor bahosi talab etiladi."
                            : "Rejali kuzatuv."}
                    </p>
                  </div>
                  <div className="detail-section">
                    <h3>Klinik ko‘rsatkichlar</h3>
                    <div className="vital-grid">
                      {selected.vitals.map((v) => (
                        <div key={v}>
                          <Activity size={17} />
                          <strong>{v}</strong>
                        </div>
                      ))}
                    </div>
                    {selected.updatedAt && (
                      <p className="observation-time">
                        Kuzatuv:{" "}
                        {new Date(selected.updatedAt).toLocaleString("uz-UZ")}
                      </p>
                    )}
                  </div>
                  <div className="detail-section">
                    <h3>Mas’ul mutaxassis</h3>
                    <div className="responsible-doctor">
                      <span className="doctor-initials">
                        <Stethoscope size={22} />
                      </span>
                      <div>
                        <strong>{doctorName(selected.doctor)}</strong>
                        <p>{selected.status}</p>
                      </div>
                    </div>
                    {pending(selected) && (
                      <div className="detail-deadline">
                        <Clock3 size={17} />
                        <span>Tasdiqlash</span>
                        <strong>
                          <Deadline value={selected.deadline} />
                        </strong>
                      </div>
                    )}
                  </div>
                  {selected.appointmentAt && (
                    <div className="detail-section">
                      <h3>Qabul vaqti</h3>
                      <p>
                        {new Date(selected.appointmentAt).toLocaleString(
                          "uz-UZ",
                        )}
                      </p>
                    </div>
                  )}
                  <div className="drawer-action-area">
                    {!canWrite && (
                      <p className="disabled-reason">
                        <WifiOff size={15} />
                        Server ulanmagan. Holatni o‘zgartirish mumkin emas.
                      </p>
                    )}
                    {[
                      "PENDING_DOCTOR_ACK",
                      "ESCALATED",
                      "APPOINTMENT_BOOKED",
                      "REVIEW_REQUIRED",
                    ].includes(selected.statusCode || "") && (
                      <button
                        className={`button ${selected.zone === "RED" ? "danger" : "primary"} full-width`}
                        disabled={!canWrite || busy}
                        onClick={() => act(selected, "accept")}
                      >
                        {busy ? (
                          <LoaderCircle size={17} className="spin" />
                        ) : (
                          <CheckCheck size={17} />
                        )}
                        Holatni qabul qilish
                      </button>
                    )}
                    {selected.statusCode === "PENDING_DOCTOR_ACK" && (
                      <button
                        className="button full-width"
                        disabled={!canWrite || busy}
                        onClick={() => act(selected, "busy")}
                      >
                        Zaxira mutaxassisga yo‘naltirish
                        <ArrowRight size={16} />
                      </button>
                    )}
                    {selected.zone !== "GREEN" && (
                      <button
                        className="button full-width"
                        disabled={!canWrite || busy}
                        onClick={() => act(selected, "call")}
                      >
                        <Phone size={16} />
                        Aloqa vazifasini yaratish
                      </button>
                    )}
                  </div>
                  {source === "reference" && (
                    <p className="reference-note">
                      Namunaviy bemor yozuvi. Haqiqiy klinik ma’lumot emas.
                    </p>
                  )}
                </>
              )
            )}
          </section>
        </div>
      )}
      {toast && (
        <div role="status" className="toast">
          {toast}
          <button onClick={() => setToast("")} aria-label="Xabarni yopish">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
