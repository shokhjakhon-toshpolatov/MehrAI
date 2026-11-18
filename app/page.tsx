"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  Baby,
  Bell,
  Building2,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Heart,
  HeartPulse,
  LayoutDashboard,
  Menu,
  Phone,
  Settings2,
  ShieldCheck,
  Stethoscope,
  Users,
  X,
  Zap,
} from "lucide-react";
import Registry from "@/components/Registry";
import { Patient, seedPatients } from "@/lib/demo";
import {
  loadRegistry,
  performCaseAction,
  recordOutcome,
  runScenario,
  type RegistryResult,
  type OutreachOutcome,
} from "@/lib/api";

const formatDate = (value: string) =>
  new Date(value).toLocaleString("uz-UZ", {
    timeZone: "Asia/Tashkent",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const doctorNames: Record<string, string> = {
  rahimova: "Dr. Dilnoza Rahimova",
  karimov: "Dr. Jamshid Karimov",
  umarova: "Dr. Malika Umarova",
  alimov: "Dr. Sardor Alimov",
};
export default function Dashboard() {
  const [patients, setPatients] = useState<Patient[]>(seedPatients);
  const [persona, setPersona] = useState("district");
  const [risk, setRisk] = useState("ALL");
  const [selected, setSelected] = useState<Patient | null>(null);
  const [sim, setSim] = useState(false);
  const [toast, setToast] = useState("");
  const [tab, setTab] = useState("overview");
  const [notifications, setNotifications] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [data, setData] = useState<RegistryResult | null>(null);
  const [offline, setOffline] = useState(true);
  const [working, setWorking] = useState(false);
  const [clock, setClock] = useState(0);
  const requestVersion = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const result = await loadRegistry();
      if (version !== requestVersion.current) return;
      setData(result);
      setPatients(result.patients);
      setSelected((current) =>
        current
          ? (result.patients.find((p) => p.id === current.id) ?? null)
          : null,
      );
      setOffline(false);
    } catch {
      if (version === requestVersion.current) setOffline(true);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const sync = setInterval(refresh, 15000);
    const tick = setInterval(() => setClock(Date.now()), 1000);
    return () => {
      ++requestVersion.current;
      clearInterval(sync);
      clearInterval(tick);
    };
  }, [refresh]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelected(null);
        setSim(false);
        setNotifications(false);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  const notify = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 4500);
  };
  const save = async (action: () => Promise<unknown>) => {
    if (offline || working) return;
    setWorking(true);
    try {
      await action();
      await refresh();
      notify("O‘zgarish serverga saqlandi");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Saqlash amalga oshmadi");
    } finally {
      setWorking(false);
    }
  };
  const isPending = (p: Patient) => p.statusCode === "PENDING_DOCTOR_ACK";
  const scoped = patients.filter(
    (p) => persona === "district" || p.doctor === persona,
  );
  const calls = (data?.calls ?? []).filter((c) =>
    scoped.some((p) => p.id === c.patientId),
  );
  const tasks = calls.filter((c) =>
    ["READY", "QUEUED", "NO_ANSWER", "RESCHEDULE_REQUESTED"].includes(c.status),
  );
  const emergency = scoped.filter(
    (p) => p.zone === "RED" && p.statusCode !== "DOCTOR_ACCEPTED",
  );
  const nextDeadline = emergency.find(isPending)?.deadline;
  const seconds =
    nextDeadline && clock
      ? Math.max(0, Math.ceil((Date.parse(nextDeadline) - clock) / 1000))
      : null;
  const events = (data?.audit ?? [])
    .slice(-5)
    .reverse()
    .map((e) => ({
      text:
        (patients.find((p) => p.id === e.case_id)?.name ?? e.case_id) +
        ": " +
        ({
          accept: "Holat qabul qilindi",
          busy: "Holat o‘tkazildi",
          outreach: "Aloqa natijasi qayd etildi",
          call: "Aloqa vazifasi yaratildi",
        }[e.action] ?? "Holat yangilandi"),
      detail: "",
      time: formatDate(e.at),
      tone: e.action === "busy" ? "red" : "blue",
    }));
  const counts = {
    RED: scoped.filter((p) => p.zone === "RED").length,
    YELLOW: scoped.filter((p) => p.zone === "YELLOW").length,
    GREEN: scoped.filter((p) => p.zone === "GREEN").length,
  };
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <a
          className="brand mehr-brand"
          href="/"
          aria-label="MehrAI bosh sahifa"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mehrai.svg" width={38} height={38} alt="" />
          <span>
            Mehr<span className="mehr-brand-ai">AI</span>
          </span>
        </a>
        <div className="workspace">
          <div className="workspace-icon">
            <HeartPulse size={21} />
          </div>
          <div>
            <strong>Perinatal kuzatuv</strong>
            <small>Perinatal salomatlik</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <div className="nav-caption">ISH MAYDONI</div>
        <nav>
          {[
            {
              id: "overview",
              icon: LayoutDashboard,
              label: "Umumiy ko‘rinish",
            },
            {
              id: "registry",
              icon: Users,
              label: "Perinatal registr",
              count: patients.length,
            },
            { id: "appointments", icon: CalendarDays, label: "Qabullar" },
            { id: "voice", icon: Phone, label: "Bemorlar bilan aloqa" },
            { id: "clinics", icon: Building2, label: "Poliklinikalar" },
            { id: "analytics", icon: Activity, label: "Tahlil va hisobotlar" },
          ].map((n) => (
            <button
              key={n.id}
              className={`nav-item ${tab === n.id ? "active" : ""}`}
              onClick={() => {
                setTab(n.id);
                setMobile(false);
              }}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.count && <b>{n.count}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="care-card">
            <span className="care-orbit">
              <Heart size={22} />
            </span>
            <strong>Har bir hayot muhim.</strong>
            <p>
              Ona va bola salomatligi —<br />
              doimo e’tibor markazida.
            </p>
            <span className="care-line" />
          </div>
          <button className="nav-item" onClick={() => setSim(true)}>
            <Settings2 size={19} />
            Demo boshqaruvi
          </button>
          <button
            className="nav-item"
            onClick={() =>
              notify(
                "Demo: registrdan bemorni tanlang, holatini ko‘ring yoki simulyator orqali yangi kuzatuv kiriting.",
              )
            }
          >
            <CircleHelp size={19} />
            Yordam markazi
          </button>
          <div className="sidebar-footer">
            <span className="tiny-dot" /> MehrAI <span>v1.0</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="mobile-menu icon-button"
              aria-label="Menyu"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            <span>Onalik va bolalik</span>
            <ChevronRight size={13} />
            <strong>Perinatal monitoring</strong>
          </div>
          <div className="top-actions">
            <span className="demo-label">NAMUNA MUHITI</span>
            <button
              className="icon-button notification-button"
              aria-label="Bildirishnomalar"
              onClick={() => setNotifications(!notifications)}
            >
              <Bell size={19} />
              <i />
            </button>
            <span className="top-divider" />
            <span className="user-avatar">NA</span>
            <div className="user-info">
              <strong>Nodira Ahmedova</strong>
              <small>OVaBMU koordinatori</small>
            </div>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span /> TOSHKENT SHAHRI · YUNUSOBOD TUMANI
              </div>
              <h1>
                {tab === "overview"
                  ? "Har bir ona. Har bir chaqaloq."
                  : (
                      {
                        registry: "Perinatal registr",
                        appointments: "Qabullar jadvali",
                        voice: "Bemorlar bilan aloqa",
                        clinics: "Poliklinikalar",
                        analytics: "Tahlil va hisobotlar",
                      } as Record<string, string>
                    )[tab]}
              </h1>
              <p>O‘z vaqtida e’tibor. Uzluksiz kuzatuv. Sog‘lom kelajak.</p>
            </div>
            <button className="button primary" onClick={() => setSim(true)}>
              <Zap size={16} />
              Demo simulyator
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="context-bar">
            <div>
              <Building2 size={18} />
              <strong>Tuman OVaBMU registri</strong>
              <span className="context-separator" />
              <span>
                {new Set(patients.map((p) => p.clinic)).size} ta tibbiyot
                muassasasi
              </span>
            </div>
            <label className="persona">
              <Stethoscope size={17} />
              <select
                aria-label="Shifokor ko‘rinishi"
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
              >
                <option value="district">Tuman bo‘yicha ko‘rinish</option>
                {Object.entries(doctorNames).map(([id, n]) => (
                  <option key={id} value={id}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="workspace-status" role="status">
            {offline
              ? "Server ulanmagan · faqat ko‘rish"
              : "Server ulangan · sun’iy ma’lumotlar · tashqi qo‘ng‘iroqlar o‘chirilgan"}
          </div>
          {tab === "overview" && (
            <section className="stats-grid">
              <button
                className={`stat-card total ${risk === "ALL" ? "stat-selected" : ""}`}
                onClick={() => {
                  setRisk("ALL");
                  setTab("registry");
                }}
              >
                <div className="stat-top">
                  <span>Jami kuzatuvda</span>
                  <span className="stat-icon">
                    <Users size={20} />
                  </span>
                </div>
                <div className="stat-value">
                  {scoped.length.toString().padStart(2, "0")}
                  <span className="stat-mini">bemor</span>
                  <svg className="sparkline" viewBox="0 0 100 34">
                    <path d="M0 30 L12 25 L23 28 L35 15 L46 19 L60 8 L70 13 L82 5 L100 2" />
                  </svg>
                </div>
                <div className="stat-bottom">
                  <span>
                    {scoped.filter((p) => p.cohort === "MATERNAL").length}{" "}
                    homilador
                  </span>
                  <i />{" "}
                  <span>
                    {scoped.filter((p) => p.cohort === "NEONATAL").length}{" "}
                    chaqaloq
                  </span>
                </div>
              </button>
              {(
                [
                  {
                    zone: "RED",
                    label: "Qizil zona",
                    desc: "Zudlik bilan yordam",
                    icon: HeartPulse,
                    tone: "red",
                  },
                  {
                    zone: "YELLOW",
                    label: "Sariq zona",
                    desc: "48 soat ichida ko‘rik",
                    icon: Clock3,
                    tone: "amber",
                  },
                  {
                    zone: "GREEN",
                    label: "Yashil zona",
                    desc: "Rejali kuzatuv",
                    icon: ShieldCheck,
                    tone: "green",
                  },
                ] as const
              ).map((c) => (
                <button
                  key={c.zone}
                  className={`stat-card ${c.tone} ${risk === c.zone ? "stat-selected" : ""}`}
                  onClick={() => {
                    setRisk(c.zone);
                    setTab("registry");
                  }}
                >
                  <div className="stat-top">
                    <span>{c.label}</span>
                    <span className="stat-icon">
                      <c.icon size={20} />
                    </span>
                  </div>
                  <div className="stat-value">
                    {counts[c.zone].toString().padStart(2, "0")}
                    <span className="zone-dot" />
                  </div>
                  <div className="stat-bottom">
                    {c.desc}
                    <ArrowRight size={15} />
                  </div>
                </button>
              ))}
            </section>
          )}
          {tab === "overview" && (
            <>
              <div className="alert-strip">
                <span className="alert-icon">
                  <HeartPulse size={20} />
                </span>
                <div>
                  <strong>{emergency.length} ta shoshilinch holat</strong>
                  <p>
                    Tayinlangan mutaxassis va tasdiqlash holatini tekshiring.
                  </p>
                </div>
                {seconds !== null && !offline && (
                  <span className="alert-time">
                    <Clock3 size={15} />
                    {String(Math.floor(seconds / 60)).padStart(2, "0")}:
                    {String(seconds % 60).padStart(2, "0")}
                  </span>
                )}
                <button
                  onClick={() => {
                    const p = emergency[0];
                    if (p) setSelected(p);
                  }}
                >
                  Holatlarni ko‘rish
                  <ArrowRight size={15} />
                </button>
              </div>
              <div className="dashboard-grid">
                <div className="left-column">
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>Shoshilinch ish navbati</h2>
                      <button
                        className="text-button"
                        onClick={() => {
                          setRisk("ALL");
                          setTab("registry");
                        }}
                      >
                        Barcha bemorlar <ArrowRight size={14} />
                      </button>
                    </div>
                    {emergency.length === 0 && (
                      <p className="workflow-empty">
                        Ochiq shoshilinch holat yo‘q.
                      </p>
                    )}
                    {emergency.map((p) => (
                      <button
                        className="appointment-row urgent-work"
                        key={p.id}
                        onClick={() => setSelected(p)}
                      >
                        <span className="badge red">QIZIL</span>
                        <div>
                          <strong>{p.name}</strong>
                          <p>
                            {p.reason} · {p.clinic}
                          </p>
                        </div>
                        <span>{p.status}</span>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                  </section>
                  <section className="panel clinic-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Poliklinikalar kesimida</h2>
                        <p>Muassasalar bo‘yicha xavf taqsimoti</p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => setTab("clinics")}
                      >
                        Barchasi
                        <ArrowRight size={14} />
                      </button>
                    </div>
                    <ClinicRows patients={patients} />
                  </section>
                </div>
                <div className="right-column">
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>Bemorlar bilan aloqa</h2>
                      <Phone size={16} />
                    </div>
                    <p className="workflow-empty">
                      {data
                        ? `${tasks.length} ta ochiq aloqa vazifasi`
                        : "Aloqa yozuvlarini ko‘rish uchun serverga ulaning."}
                    </p>
                    <div className="workflow-footer">
                      <button
                        className="text-button"
                        onClick={() => setTab("voice")}
                      >
                        Aloqa navbati <ArrowRight size={14} />
                      </button>
                    </div>
                  </section>
                  <section className="panel activity-panel">
                    <div className="panel-heading">
                      <h2>So‘nggi faollik</h2>
                    </div>
                    <div className="timeline">
                      {!events.length && (
                        <p className="workflow-empty">
                          Faollik yozuvlari yo‘q.
                        </p>
                      )}
                      {events.slice(0, 4).map((e, i) => (
                        <div className={`timeline-item ${e.tone}`} key={i}>
                          <span className="timeline-dot">
                            {e.tone === "green" ? (
                              <Check size={12} />
                            ) : e.tone === "red" ? (
                              <HeartPulse size={12} />
                            ) : (
                              <CalendarDays size={12} />
                            )}
                          </span>
                          <div>
                            <strong>{e.text}</strong>
                            <p>{e.detail}</p>
                            <small>{e.time}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                  <div className="security-note">
                    <ShieldCheck size={22} />
                    <div>
                      <strong>G‘amxo‘rlik, xavfsizlik bilan.</strong>
                      <p>Ushbu demoda faqat sun’iy ma’lumotlar.</p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
          {tab === "registry" && (
            <Registry
              patients={patients}
              onSelect={setSelected}
              persona={persona}
              riskFilter={risk}
              onRiskFilter={setRisk}
            />
          )}
          {tab === "clinics" && (
            <section className="panel large-panel">
              <div className="panel-heading">
                <h2>Tuman tibbiyot muassasalari</h2>
                <span>
                  {new Set(patients.map((p) => p.clinic)).size} ta muassasa
                </span>
              </div>
              <ClinicRows patients={patients} />
            </section>
          )}
          {tab === "appointments" && (
            <section className="panel large-panel">
              <div className="panel-heading">
                <h2>Rejalashtirilgan ko‘riklar</h2>
                <span>Toshkent vaqti</span>
              </div>
              {!data?.appointments.length && (
                <p className="workflow-empty">
                  {data
                    ? "Qabul yozuvlari yo‘q."
                    : "Qabul yozuvlarini ko‘rish uchun serverga ulaning."}
                </p>
              )}
              {data?.appointments
                .filter((a) => a.status !== "cancelled")
                .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
                .map((a) => {
                  const p = scoped.find((patient) => patient.id === a.patient);
                  if (!p) return null;
                  return (
                    <button
                      className="appointment-row"
                      key={a.id}
                      onClick={() => setSelected(p)}
                    >
                      <span className="appointment-icon">
                        <CalendarDays size={22} />
                      </span>
                      <div>
                        <strong>{p.name}</strong>
                        <p>
                          {doctorNames[p.doctor]} · {p.clinic}
                        </p>
                      </div>
                      <span>{formatDate(a.start)}</span>
                      <span
                        className={`badge ${a.status === "booked" ? "green" : "amber"}`}
                      >
                        {p.statusCode === "ATTENDED"
                          ? "Keldi"
                          : p.statusCode === "NO_SHOW_ALERTED"
                            ? "Kelmadi"
                            : a.status === "booked"
                              ? "Tasdiqlangan"
                              : "Taklif qilingan"}
                      </span>
                      <ChevronRight size={18} />
                    </button>
                  );
                })}
            </section>
          )}
          {tab === "voice" && (
            <section className="panel large-panel">
              <div className="panel-heading">
                <div>
                  <h2>Bemor va oila bilan bog‘lanish</h2>
                  <p>Xodim qayd etgan aloqa natijalari</p>
                </div>
              </div>
              {!calls.length && (
                <p className="workflow-empty">
                  {data
                    ? "Aloqa vazifalari yo‘q."
                    : "Aloqa yozuvlarini ko‘rish uchun serverga ulaning."}
                </p>
              )}
              {calls.map((c) => {
                const patient = patients.find((p) => p.id === c.patientId);
                const outcomes: { id: OutreachOutcome; label: string }[] =
                  patient?.zone === "YELLOW" && patient.appointmentAt
                    ? [
                        { id: "CONFIRMED", label: "Qabul tasdiqlandi" },
                        {
                          id: "RESCHEDULE_REQUESTED",
                          label: "Boshqa vaqt so‘raldi",
                        },
                      ]
                    : [{ id: "REACHED", label: "Bog‘lanildi" }];
                outcomes.push({ id: "NO_ANSWER", label: "Javob yo‘q" });
                return (
                  <article className="outreach-row" key={c.id}>
                    <div>
                      <button
                        className="patient-name"
                        onClick={() => patient && setSelected(patient)}
                      >
                        {c.patientName}
                      </button>
                      <p>
                        {c.target} · {c.attempts} urinish ·{" "}
                        {formatDate(c.scheduledAt)}
                      </p>
                    </div>
                    <strong>{c.statusLabel}</strong>
                    {tasks.includes(c) && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const outcome = new FormData(e.currentTarget).get(
                            "outcome",
                          ) as OutreachOutcome;
                          void save(() =>
                            recordOutcome(
                              c.id,
                              outcome,
                              globalThis.crypto.randomUUID(),
                            ),
                          );
                        }}
                      >
                        <select
                          name="outcome"
                          aria-label={`${c.patientName}: aloqa natijasi`}
                          required
                          defaultValue=""
                        >
                          <option value="" disabled>
                            Natijani tanlang
                          </option>
                          {outcomes.map((o) => (
                            <option value={o.id} key={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <button
                          className="button"
                          disabled={offline || working}
                        >
                          Qayd etish
                        </button>
                      </form>
                    )}
                  </article>
                );
              })}
            </section>
          )}
          {tab === "analytics" && (
            <section className="panel large-panel">
              <div className="panel-heading">
                <div>
                  <h2>Xavf zonalari taqsimoti</h2>
                  <p>Joriy demo registri asosida</p>
                </div>
                <Activity size={22} />
              </div>
              <div className="analytics-bars">
                {Object.entries(counts).map(([zone, count]) => (
                  <div key={zone}>
                    <span>
                      {
                        {
                          RED: "Qizil zona",
                          YELLOW: "Sariq zona",
                          GREEN: "Yashil zona",
                        }[zone]
                      }
                    </span>
                    <div className="bar-track">
                      <div
                        className={zone.toLowerCase()}
                        style={{ width: `${(count / patients.length) * 100}%` }}
                      />
                    </div>
                    <strong>
                      {count} bemor ·{" "}
                      {Math.round((count / patients.length) * 100)}%
                    </strong>
                  </div>
                ))}
              </div>
              <ClinicRows patients={patients} />
            </section>
          )}
          <footer className="main-footer">
            <span>
              <span className="tiny-dot" />
              MehrAI · Namuna ma’lumotlari
            </span>
            <span>
              Mehr bilan, sog‘lom kelajak sari <Heart size={12} />
            </span>
          </footer>
        </main>
      </div>
      {notifications && (
        <div className="notification-popover panel">
          <div className="panel-heading">
            <h2>Bildirishnomalar</h2>
            <button
              className="icon-button"
              aria-label="Yopish"
              onClick={() => setNotifications(false)}
            >
              <X size={18} />
            </button>
          </div>
          {events.map((e, i) => (
            <div className="notification-item" key={i}>
              <strong>{e.text}</strong>
              <p>{e.detail}</p>
            </div>
          ))}
        </div>
      )}
      {(selected || sim) && (
        <div
          className="overlay"
          onClick={() => {
            setSelected(null);
            setSim(false);
          }}
        >
          <section
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label={sim ? "Demo simulyator" : "Bemor tafsilotlari"}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-top">
              <span className="eyebrow">
                {sim ? "INTERAKTIV DEMO" : "BEMOR KARTASI"}
              </span>
              <button
                className="icon-button"
                aria-label="Yopish"
                onClick={() => {
                  setSelected(null);
                  setSim(false);
                }}
              >
                <X />
              </button>
            </div>
            {sim ? (
              <>
                <h2>Jarayonni amalda ko‘ring.</h2>
                <p className="drawer-intro">
                  Yangi kuzatuvdan mutaxassis qabuligacha — butun jarayon bitta
                  ekranda.
                </p>
                <div className="demo-warning">
                  <ShieldCheck size={18} />
                  Sun’iy bemorlar. Haqiqiy tibbiy harakatlar bajarilmaydi.
                </div>
                {[
                  {
                    title: "Onada yuqori xavf",
                    text: "AQB 165/110 · Proteinuriya ++",
                    icon: HeartPulse,
                    action: () => save(() => runScenario("maternal-red")),
                    tone: "red",
                  },
                  {
                    title: "Chaqaloqda yuqori xavf",
                    text: "Bilirubin 295 µmol/L · Harorat 38.4 °C",
                    icon: Baby,
                    action: () => save(() => runScenario("neonatal-red")),
                    tone: "amber",
                  },
                  {
                    title: "Zaxira shifokorga o‘tkazish",
                    text: "15 daqiqalik kutishni tezlashtirish",
                    icon: Clock3,
                    action: () => save(() => runScenario("fast-forward")),
                    tone: "blue",
                  },
                ].map((a) => (
                  <button
                    className={`simulation-action ${a.tone}`}
                    key={a.title}
                    disabled={offline || working}
                    onClick={a.action}
                  >
                    <span>
                      <a.icon size={23} />
                    </span>
                    <div>
                      <strong>{a.title}</strong>
                      <p>{a.text}</p>
                    </div>
                    <ChevronRight size={18} />
                  </button>
                ))}
              </>
            ) : (
              selected && (
                <>
                  <div
                    className={`patient-large-avatar ${selected.zone.toLowerCase()}`}
                  >
                    {selected.name
                      .split(" ")
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")}
                  </div>
                  <h2>{selected.name}</h2>
                  <p className="drawer-intro">
                    {selected.stage} · {selected.clinic}
                  </p>
                  <span
                    className={`badge ${selected.zone === "RED" ? "red" : selected.zone === "GREEN" ? "green" : "amber"}`}
                  >
                    {selected.zone === "RED"
                      ? "Qizil zona"
                      : selected.zone === "YELLOW"
                        ? "Sariq zona"
                        : selected.zone === "REVIEW"
                          ? "Tekshirish zarur"
                          : "Yashil zona"}
                  </span>
                  <div className="detail-block">
                    <h3>Klinik ko‘rsatkichlar</h3>
                    <strong>{selected.reason}</strong>
                    <div className="vital-cards">
                      {selected.vitals.map((v) => (
                        <div key={v}>
                          <Activity size={17} />
                          {v}
                        </div>
                      ))}
                    </div>
                    <small>
                      Demo qoidalari asosida · klinik foydalanish uchun
                      tasdiqlanmagan
                    </small>
                  </div>
                  <div className="detail-block">
                    <h3>Biriktirilgan mutaxassis</h3>
                    <div className="doctor-detail">
                      <span className="user-avatar">
                        <Stethoscope size={22} />
                      </span>
                      <div>
                        <strong>
                          {doctorNames[selected.doctor] || "Biriktirilmagan"}
                        </strong>
                        <p>{selected.status}</p>
                      </div>
                    </div>
                  </div>
                  {[
                    "PENDING_DOCTOR_ACK",
                    "ESCALATED",
                    "REVIEW_REQUIRED",
                    "APPOINTMENT_BOOKED",
                  ].includes(selected.statusCode ?? "") && (
                    <div className="button-row">
                      <button
                        className="button primary"
                        disabled={offline || working}
                        onClick={() =>
                          save(() => performCaseAction(selected.id, "accept"))
                        }
                      >
                        <CheckCheck size={17} /> Holatni qabul qilish
                      </button>
                      {isPending(selected) && (
                        <button
                          className="button"
                          disabled={offline || working}
                          onClick={() =>
                            save(() => performCaseAction(selected.id, "busy"))
                          }
                        >
                          Bandman — o‘tkazish
                        </button>
                      )}
                    </div>
                  )}
                  <div className="detail-block">
                    <h3>Kuzatuv jarayoni</h3>
                    <div className="care-steps">
                      <p>
                        <Check size={15} />
                        Kuzatuv qabul qilindi
                      </p>
                      <p>
                        <Check size={15} />
                        Xavf darajasi baholandi
                      </p>
                      <p>
                        <Check size={15} />
                        Registr yangilandi
                      </p>
                    </div>
                  </div>
                </>
              )
            )}
          </section>
        </div>
      )}
      {toast && (
        <div role="status" className="toast">
          <Check size={18} />
          {toast}
          <button aria-label="Yopish" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
function ClinicRows({ patients }: { patients: Patient[] }) {
  return (
    <div className="clinic-rows">
      {Array.from(new Set(patients.map((p) => p.clinic))).map((clinic, i) => {
        const ps = patients.filter((p) => p.clinic === clinic);
        return (
          <div className="clinic-row" key={clinic}>
            <span className={`clinic-icon clinic-${i}`}>
              <Building2 size={19} />
            </span>
            <div className="clinic-name">
              <strong>{clinic}</strong>
              <small>{ps.length} bemor kuzatuvda</small>
            </div>
            <div className="clinic-bar">
              {(["GREEN", "YELLOW", "RED"] as const).map((z) => (
                <span
                  key={z}
                  className={z.toLowerCase()}
                  style={{
                    width: `${(ps.filter((p) => p.zone === z).length / ps.length) * 100}%`,
                  }}
                />
              ))}
            </div>
            <div className="clinic-counts">
              {(["RED", "YELLOW", "GREEN"] as const).map((z) => (
                <span key={z}>
                  <i className={z.toLowerCase()} />
                  {ps.filter((p) => p.zone === z).length}
                </span>
              ))}
            </div>
          </div>
        );
      })}
      <div className="clinic-legend">
        <span>
          <i className="red" />
          Qizil zona
        </span>
        <span>
          <i className="yellow" />
          Sariq zona
        </span>
        <span>
          <i className="green" />
          Yashil zona
        </span>
      </div>
    </div>
  );
}
