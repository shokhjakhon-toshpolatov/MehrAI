"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  ArrowLeft,
  Moon,
  Sun,
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
import { useLanguage } from "@/components/LanguageProvider";
import { Patient, seedPatients } from "@/lib/demo";
import {
  loadRegistry,
  performCaseAction,
  recordOutcome,
  cancelRetries, checkVoiceLab, openContact, savePhone, phoneSetup, ringHandset, type ContactAttempt,
  recordFacilityResponse,
  recordAttendance,
  type FacilityResponse,
  runScenario,
  type RegistryResult,
  type OutreachOutcome,
  type Outreach,
} from "@/lib/api";

const doctorNames: Record<string, string> = {
  rahimova: "Dr. Dilnoza Rahimova",
  karimov: "Dr. Jamshid Karimov",
  umarova: "Dr. Malika Umarova",
  alimov: "Dr. Sardor Alimov",
};
export default function Dashboard() {
  const { language, setLanguage, t, date: formatDate } = useLanguage();
  const [patients, setPatients] = useState<Patient[]>(seedPatients);
  const [persona, setPersona] = useState("district");
  const [risk, setRisk] = useState("ALL");
  const [selected, setSelected] = useState<Patient | null>(null);
  const [sim, setSim] = useState(false);
  const [toast, setToast] = useState("");
  const [tab, showTab] = useState("overview");
  const tabHistory = useRef<string[]>([]);
  const patientHistory = useRef<string[]>([]);
  const [workspaceOpen, setWorkspaceOpen] = useState(true);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    let preference = null;
    try { preference = localStorage.getItem("mehrai-theme"); } catch {}
    setDark(preference ? preference === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);

  function toggleTheme() {
    setDark(!dark);
    try { localStorage.setItem("mehrai-theme", dark ? "light" : "dark"); } catch {}
  }

  function navigate(destination: string) {
    if (destination !== tab) {
      tabHistory.current.push(tab);
      showTab(destination);
    }
    setNotifications(false);
    setMobile(false);
  }

  function goBack() {
    if (sim) setSim(false);
    else if (selected) {
      const previousId = patientHistory.current.pop();
      setSelected(patients.find(patient => patient.id === previousId) ?? null);
    } else {
      showTab(tabHistory.current.pop() ?? "overview");
      setNotifications(false);
      setMobile(false);
    }
  }

  useEffect(() => {
    if (!selected) patientHistory.current = [];
  }, [selected]);
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
    ["READY", "QUEUED", "NO_ANSWER"].includes(c.status),
  );
  const emergency = scoped.filter(
    (p) => p.zone === "RED" && p.statusCode !== "DOCTOR_ACCEPTED",
  );
  const visits = (data?.appointments ?? [])
    .filter((visit) => ["proposed", "booked", "untimed"].includes(visit.status))
    .flatMap((visit) => {
      const patient = scoped.find((p) => p.id === visit.patient);
      return patient ? [{ visit, patient }] : [];
    })
    .sort((a, b) => (a.visit.start ?? "").localeCompare(b.visit.start ?? ""));
  const selectedVisit = (data?.appointments ?? []).find(
    (visit) =>
      visit.patient === selected?.id &&
      ["proposed", "booked", "untimed"].includes(visit.status),
  );
  const relatedPatients =
    selected?.cohort === "POSTPARTUM"
      ? patients.filter((p) => p.motherId === selected.id)
      : selected?.motherId
        ? patients.filter((p) => p.id === selected.motherId)
        : [];
  const selectedTasks = (data?.calls ?? []).filter(
    (call) => call.patientId === selected?.id,
  );
  const activeContact = selectedTasks.find(isOpenContact);
  const saveContact = (
    task: Outreach,
    outcome: OutreachOutcome,
    attemptId: string,
    duration?: number,
  ) => save(async () => {
    await recordOutcome(task.id, outcome, attemptId, { duration_seconds: duration, started_at: dialStart.current[task.patientId] });
    delete dialStart.current[task.patientId];
  });
  const dialStart = useRef<Record<string, string>>({});
  const history = (data?.history ?? []).filter(item => item.case_id === null ? persona === "district" : scoped.some(p => p.id === item.case_id));
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
          accept: t("Holat qabul qilindi"),
          busy: t("Holat o‘tkazildi"),
          outreach: t("Aloqa natijasi qayd etildi"),
          call: t("Aloqa vazifasi yaratildi"),
          facility_response: t("Muassasa javobi qayd etildi"),
          postpartum_follow_up: t("Tug‘ruqdan keyingi kuzatuv qayd etildi"),
          attendance: t("Tashrif holati qayd etildi"),
        }[e.action] ?? t("Holat yangilandi")),
      detail: "",
      time: formatDate(e.at),
      tone: e.action === "busy" ? "red" : "blue",
    }));
  const counts = {
    RED: scoped.filter((p) => p.zone === "RED").length,
    YELLOW: scoped.filter((p) => p.zone === "YELLOW").length,
    GREEN: scoped.filter((p) => p.zone === "GREEN").length,
  };
  const sections = [
            {
              id: "overview",
              icon: LayoutDashboard,
              label: t("Umumiy ko‘rinish"),
            },
            {
              id: "registry",
              icon: Users,
              label: t("Perinatal registr"),
              count: patients.length,
            },
            {
              id: "appointments",
              icon: CalendarDays,
              label: t("Yo‘llanmalar va qabullar"),
            },
            { id: "voice", icon: Phone, label: t("Bemorlar bilan aloqa") },
            { id: "clinics", icon: Building2, label: t("Poliklinikalar") },
            { id: "analytics", icon: Activity, label: t("Tahlil va hisobotlar") },
          ];
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <a
          className="brand mehr-brand"
          href="/"
          aria-label={t("MehrAI bosh sahifa")}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mehrai.svg" width={38} height={38} alt="" />
          <span>
            Mehr<span className="mehr-brand-ai">AI</span>
          </span>
        </a>
        <button type="button" className="workspace" aria-controls="workspace-links" aria-expanded={workspaceOpen} onClick={() => setWorkspaceOpen(!workspaceOpen)}>
          <span className="workspace-icon">
            <HeartPulse size={21} />
          </span>
          <span>
            <strong>{t("Perinatal kuzatuv")}</strong>
            <small>{t("Perinatal salomatlik")}</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <div id="workspace-links" hidden={!workspaceOpen}>
        <div className="nav-caption">{t("ISH MAYDONI")}</div>
        <nav>
          {sections.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${tab === n.id ? "active" : ""}`}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.count && <b>{n.count}</b>}
            </button>
          ))}
        </nav>
        </div>
        <div className="sidebar-bottom">
          <div className="care-card">
            <span className="care-orbit">
              <Heart size={22} />
            </span>
            <strong>{t("Har bir hayot muhim.")}</strong>
            <p>{t("Ona va bola salomatligi —")}<br />{t("doimo e’tibor markazida. ")}</p>
            <span className="care-line" />
          </div>
          <button className="nav-item" onClick={() => setSim(true)}>
            <Settings2 size={19} />{t("Demo boshqaruvi ")}</button>
          <button
            className="nav-item"
            onClick={() =>
              notify(
                "Demo: registrdan bemorni tanlang, holatini ko‘ring yoki simulyator orqali yangi kuzatuv kiriting.",
              )
            }
          >
            <CircleHelp size={19} />{t("Yordam markazi ")}</button>
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
              aria-label={t("Menyu")}
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            <button type="button" className="icon-button back-button" aria-label={t("Orqaga")} title={t("Orqaga")} disabled={!tabHistory.current.length} onClick={goBack}>
              <ArrowLeft size={17} />
            </button>
            <button className="breadcrumb-home" onClick={() => navigate("overview")}>{t("Onalik va bolalik")}</button>
            <label className="section-picker">
              <ChevronRight size={13} aria-hidden="true" />
              <span>{sections.find(section => section.id === tab)?.label}</span>
              <select aria-label={t("Bo‘limni tanlang")} value={tab} onChange={event => navigate(event.target.value)}>
                {sections.map(section => <option key={section.id} value={section.id}>{section.label}</option>)}
              </select>
            </label>
          </div>
          <div className="top-actions">
            <span className="demo-label">{t("NAMUNA MUHITI")}</span>
            <div className="language-picker" role="group" aria-label={t("Interfeys tili")}>
              {(["uz", "ru"] as const).map(code => (
                <button key={code} type="button" lang={code}
                  aria-label={code === "uz" ? "O‘zbekcha" : "Русский"}
                  aria-pressed={language === code} onClick={() => setLanguage(code)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="language-flag" src={`/flags/${code}.svg`} width={20} height={20} alt="" />
                  {code === "uz" ? "UZB" : "RUS"}
                </button>
              ))}
            </div>
            <button className="icon-button" type="button" aria-label={t("Qorong‘i rejim")} title={t("Qorong‘i rejim")} aria-pressed={dark} onClick={toggleTheme}>
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              className="icon-button notification-button"
              aria-label={t("Bildirishnomalar")}
              onClick={() => setNotifications(!notifications)}
            >
              <Bell size={19} />
              <i />
            </button>
            <span className="top-divider" />
            <span className="user-avatar">NA</span>
            <div className="user-info">
              <strong>Nodira Ahmedova</strong>
              <small>{t("OVaBMU koordinatori")}</small>
            </div>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span />{t(" TOSHKENT SHAHRI · YUNUSOBOD TUMANI ")}</div>
              <h1>
                {tab === "overview"
                  ? t("Har bir ona. Har bir chaqaloq.")
                  : (
                      {
                        registry: t("Perinatal registr"),
                        appointments: t("Yo‘llanmalar va qabullar"),
                        voice: t("Bemorlar bilan aloqa"),
                        clinics: t("Poliklinikalar"),
                        analytics: t("Tahlil va hisobotlar"),
                      } as Record<string, string>
                    )[tab]}
              </h1>
              <p>{t("O‘z vaqtida e’tibor. Uzluksiz kuzatuv. Sog‘lom kelajak.")}</p>
            </div>
            <button className="button primary" onClick={() => setSim(true)}>
              <Zap size={16} />{t("Demo simulyator ")}<ChevronRight size={15} />
            </button>
          </div>
          <div className="context-bar">
            <div>
              <Building2 size={18} />
              <strong>{t("Tuman OVaBMU registri")}</strong>
              <span className="context-separator" />
              <span>
                {new Set(patients.map((p) => p.clinic)).size}{t(" ta tibbiyot muassasasi ")}</span>
            </div>
            <label className="persona">
              <Stethoscope size={17} />
              <select
                aria-label={t("Shifokor ko‘rinishi")}
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
              >
                <option value="district">{t("Tuman bo‘yicha ko‘rinish")}</option>
                {Object.entries(doctorNames).map(([id, n]) => (
                  <option key={id} value={id}>
                    {t(n)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="workspace-status" role="status">
            {offline
              ? t("Server ulanmagan · faqat ko‘rish")
              : t("Server ulangan · sun’iy ma’lumotlar · tashqi qo‘ng‘iroqlar o‘chirilgan")}
          </div>
          {tab === "overview" && (
            <section className="stats-grid">
              <button
                className={`stat-card total ${risk === "ALL" ? "stat-selected" : ""}`}
                onClick={() => {
                  setRisk("ALL");
                  navigate("registry");
                }}
              >
                <div className="stat-top">
                  <span>{t("Jami kuzatuvda")}</span>
                  <span className="stat-icon">
                    <Users size={20} />
                  </span>
                </div>
                <div className="stat-value">
                  {scoped.length.toString().padStart(2, "0")}
                  <span className="stat-mini">{t("bemor")}</span>
                  <svg className="sparkline" viewBox="0 0 100 34">
                    <path d="M0 30 L12 25 L23 28 L35 15 L46 19 L60 8 L70 13 L82 5 L100 2" />
                  </svg>
                </div>
                <div className="stat-bottom">
                  <span>
                    {scoped.filter((p) => p.cohort === "MATERNAL").length}{" "}{t("homilador ")}</span>
                  <i />{" "}
                  <span>
                    {scoped.filter((p) => p.cohort === "NEONATAL").length}{" "}{t("chaqaloq ")}</span>
                  <i aria-hidden="true" />
                  <span>
                    {scoped.filter((p) => p.cohort === "POSTPARTUM").length}{" "}{t("tug‘ruqdan keyin ")}</span>
                </div>
              </button>
              {(
                [
                  {
                    zone: "RED",
                    label: t("Qizil zona"),
                    desc: t("Zudlik bilan yordam"),
                    icon: HeartPulse,
                    tone: "red",
                  },
                  {
                    zone: "YELLOW",
                    label: t("Sariq zona"),
                    desc: t("48 soat ichida ko‘rik"),
                    icon: Clock3,
                    tone: "amber",
                  },
                  {
                    zone: "GREEN",
                    label: t("Yashil zona"),
                    desc: t("Rejali kuzatuv"),
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
                    navigate("registry");
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
                  <strong>{emergency.length}{t(" ta shoshilinch holat")}</strong>
                  <p>{t("Tayinlangan mutaxassis va tasdiqlash holatini tekshiring. ")}</p>
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
                >{t("Holatlarni ko‘rish ")}<ArrowRight size={15} />
                </button>
              </div>
              <div className="dashboard-grid">
                <div className="left-column">
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>{t("Shoshilinch ish navbati")}</h2>
                      <button
                        className="text-button"
                        onClick={() => {
                          setRisk("ALL");
                          navigate("registry");
                        }}
                      >{t("Barcha bemorlar ")}<ArrowRight size={14} />
                      </button>
                    </div>
                    {emergency.length === 0 && (
                      <p className="workflow-empty">{t("Ochiq shoshilinch holat yo‘q. ")}</p>
                    )}
                    {emergency.map((p) => (
                      <button
                        className="appointment-row urgent-work"
                        key={p.id}
                        onClick={() => setSelected(p)}
                      >
                        <span className="badge red">{t("QIZIL")}</span>
                        <div>
                          <strong>{p.name}</strong>
                          <p>
                            {t(p.reason)} · {t(p.clinic)}
                          </p>
                        </div>
                        <span>{t(p.status)}</span>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                  </section>
                  <section className="panel clinic-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>{t("Poliklinikalar kesimida")}</h2>
                        <p>{t("Muassasalar bo‘yicha xavf taqsimoti")}</p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => navigate("clinics")}
                      >{t("Barchasi ")}<ArrowRight size={14} />
                      </button>
                    </div>
                    <ClinicRows patients={patients} />
                  </section>
                </div>
                <div className="right-column">
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>{t("Bemorlar bilan aloqa")}</h2>
                      <Phone size={16} />
                    </div>
                    <p className="workflow-empty">
                      {data
                        ? t("{count} ta ochiq aloqa vazifasi", { count: tasks.length })
                        : t("Aloqa yozuvlarini ko‘rish uchun serverga ulaning.")}
                    </p>
                    <div className="workflow-footer">
                      <button
                        className="text-button"
                        onClick={() => navigate("voice")}
                      >{t("Aloqa navbati ")}<ArrowRight size={14} />
                      </button>
                    </div>
                  </section>
                  <section className="panel activity-panel">
                    <div className="panel-heading">
                      <h2>{t("So‘nggi faollik")}</h2>
                    </div>
                    <div className="timeline">
                      {!events.length && (
                        <p className="workflow-empty">{t("Faollik yozuvlari yo‘q. ")}</p>
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
                      <strong>{t("G‘amxo‘rlik, xavfsizlik bilan.")}</strong>
                      <p>{t("Ushbu demoda faqat sun’iy ma’lumotlar.")}</p>
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
                <h2>{t("Tuman tibbiyot muassasalari")}</h2>
                <span>
                  {new Set(patients.map((p) => p.clinic)).size}{t(" ta muassasa ")}</span>
              </div>
              <ClinicRows patients={patients} />
            </section>
          )}
          {tab === "appointments" && (
            <div className="left-column">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>{t("Muassasa javobi kutilayotgan yo‘llanmalar")}</h2>
                    <p>{t("Qabul vaqtini muassasa bildirganidan keyin kiriting.")}</p>
                  </div>
                </div>
                {!scoped.some(isAwaitingFacility) && (
                  <p className="workflow-empty">{t("Javob kutilayotgan yo‘llanma yo‘q. ")}</p>
                )}
                {scoped.filter(isAwaitingFacility).map((p) => (
                  <button
                    className="appointment-row"
                    key={p.id}
                    onClick={() => setSelected(p)}
                  >
                    <span className="appointment-icon">
                      <Stethoscope size={20} />
                    </span>
                    <div>
                      <strong>{p.name}</strong>
                      <p>{t("Mas’ul shifokor:")}{" "}
                        {t(doctorNames[p.doctor] || t("Biriktirilmagan"))} ·{" "}
                        {t(p.clinic)}
                      </p>
                    </div>
                    <span className="badge amber">
                      {p.referralStatus === "RESCHEDULE_REQUESTED"
                        ? t("Yangi vaqt kutilmoqda")
                        : t("Javob kutilmoqda")}
                    </span>
                    <ChevronRight size={18} />
                  </button>
                ))}
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h2>{t("Muassasa bilan kelishilgan tashriflar")}</h2>
                  <span>{t("Toshkent vaqti")}</span>
                </div>
                {!visits.length && (
                  <p className="workflow-empty">{t("Kelishilgan tashriflar yo‘q.")}</p>
                )}
                {visits.map(({ visit: a, patient: p }) => (
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
                        {t(a.practitioner
                          ? (doctorNames[a.practitioner] ?? a.practitioner)
                          : t("Qabul shifokori ko‘rsatilmagan"))}{" "}
                        · {t(a.facility ?? t("Muassasa ko‘rsatilmagan"))}
                      </p>
                    </div>
                    <span>
                      {a.start ? formatDate(a.start) : t("Aniq vaqtsiz")}
                    </span>
                    <span
                      className={`badge ${p.statusCode === "NO_SHOW_ALERTED" ? "red" : p.statusCode === "ATTENDED" || a.status === "booked" ? "green" : "amber"}`}
                    >
                      {p.statusCode === "ATTENDED"
                        ? t("Keldi")
                        : p.statusCode === "NO_SHOW_ALERTED"
                          ? t("Kelmadi")
                          : a.status === "booked"
                            ? t("Tasdiqlangan")
                            : a.status === "untimed"
                              ? t("Kelishilgan")
                              : t("Tasdiq kutilmoqda")}
                    </span>
                    <ChevronRight size={18} />
                  </button>
                ))}
              </section>
            </div>
          )}
          {tab === "voice" && (
            <section className="panel large-panel">
              <div className="panel-heading">
                <div>
                  <h2>{t("Bemor va oila bilan bog‘lanish")}</h2>
                  <p>{t("Xodim qayd etgan aloqa natijalari")}</p>
                </div>
              </div>
              <CallHistory entries={history} patients={scoped} onSelect={setSelected} />
              <ConnectionCheck />
              <HandsetTest onUpdate={refresh} />
              {!calls.length && (
                <p className="workflow-empty">
                  {data
                    ? t("Aloqa vazifalari yo‘q.")
                    : t("Aloqa yozuvlarini ko‘rish uchun serverga ulaning.")}
                </p>
              )}
              {calls.map((c) => {
                const patient = patients.find((p) => p.id === c.patientId);
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
                        {t(c.target)} · {c.attempts}{t(" urinish ·")}{" "}
                        {formatDate(c.scheduledAt)}
                      </p>
                    </div>
                    <strong>{t(c.statusLabel)}</strong>
                    {c.retryChannel && isOpenContact(c) && <button className="button" disabled={working || offline} onClick={() => save(() => cancelRetries(c.id))}>{t("Takroriy qo‘ng‘iroqlarni bekor qilish")}</button>}
                    {isOpenContact(c) && (
                      <ContactOutcomeForm
                        key={c.id}
                        task={c}
                        timed={Boolean(
                          c.appointmentId &&
                          scheduledVisit(data?.appointments, c.appointmentId)
                            ?.start &&
                          patient?.statusCode !== "ATTENDED",
                        )}
                        disabled={offline || working}
                        onSave={saveContact}
                      />
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
                  <h2>{t("Xavf zonalari taqsimoti")}</h2>
                  <p>{t("Joriy demo registri asosida")}</p>
                </div>
                <Activity size={22} />
              </div>
              <div className="analytics-bars">
                {Object.entries(counts).map(([zone, count]) => (
                  <div key={zone}>
                    <span>
                      {
                        {
                          RED: t("Qizil zona"),
                          YELLOW: t("Sariq zona"),
                          GREEN: t("Yashil zona"),
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
                      {count}{t(" bemor ·")}{" "}
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
              <span className="tiny-dot" />{t("MehrAI · Namuna ma’lumotlari ")}</span>
            <span>{t("Mehr bilan, sog‘lom kelajak sari ")}<Heart size={12} />
            </span>
          </footer>
        </main>
      </div>
      {notifications && (
        <div className="notification-popover panel">
          <div className="panel-heading">
            <h2>{t("Bildirishnomalar")}</h2>
            <button
              className="icon-button"
              aria-label={t("Yopish")}
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
            aria-label={sim ? t("Demo simulyator") : t("Bemor tafsilotlari")}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-top">
              <button className="button drawer-back" onClick={goBack}><ArrowLeft size={16} />{t("Orqaga")}</button>
              <span className="eyebrow">
                {sim ? t("INTERAKTIV DEMO") : t("BEMOR KARTASI")}
              </span>
              <button
                className="icon-button"
                aria-label={t("Yopish")}
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
                <h2>{t("Jarayonni amalda ko‘ring.")}</h2>
                <p className="drawer-intro">{t("Yangi kuzatuvdan mutaxassis qabuligacha — butun jarayon bitta ekranda. ")}</p>
                <div className="demo-warning">
                  <ShieldCheck size={18} />{t("Sun’iy bemorlar. Haqiqiy tibbiy harakatlar bajarilmaydi. ")}</div>
                {[
                  {
                    title: t("Onada yuqori xavf"),
                    text: "AQB 165/110 · Proteinuriya ++",
                    icon: HeartPulse,
                    action: () => save(() => runScenario("maternal-red")),
                    tone: "red",
                  },
                  {
                    title: t("Chaqaloqda yuqori xavf"),
                    text: "Bilirubin 295 µmol/L · Harorat 38.4 °C",
                    icon: Baby,
                    action: () => save(() => runScenario("neonatal-red")),
                    tone: "amber",
                  },
                  {
                    title: t("Zaxira shifokorga o‘tkazish"),
                    text: t("15 daqiqalik kutishni tezlashtirish"),
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
                      <p>{t(a.text)}</p>
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
                    {t(selected.stage)} · {t(selected.clinic)}
                  </p>
                  <span
                    className={`badge ${selected.zone === "RED" ? "red" : selected.zone === "GREEN" ? "green" : selected.zone === "REVIEW" ? "zone-review" : "amber"}`}
                  >
                    {selected.zone === "RED"
                      ? t("Qizil zona")
                      : selected.zone === "YELLOW"
                        ? t("Sariq zona")
                        : selected.zone === "REVIEW"
                          ? t("Baholash kutilmoqda")
                          : t("Yashil zona")}
                  </span>
                  <div className="detail-block">
                    <h3>{t("Klinik ko‘rsatkichlar")}</h3>
                    <strong>{t(selected.reason)}</strong>
                    {selected.assessedAt && (
                      <p className="sample-assessment">{t("Namuna bahosi ·")}{" "}
                        {t(selected.assessedBy
                          ? (doctorNames[selected.assessedBy] ??
                            selected.assessedBy)
                          : t("Mutaxassis"))}{" "}
                        · {formatDate(selected.assessedAt)}
                      </p>
                    )}
                    <div className="vital-cards">
                      {selected.vitals.length === 0 && (
                        <p>{t("Ko‘rsatkichlar kiritilmagan.")}</p>
                      )}
                      {selected.vitals.map((v) => (
                        <div key={v}>
                          <Activity size={17} />
                          {t(v)}
                        </div>
                      ))}
                    </div>
                    <small>{t("Demo qoidalari asosida · klinik foydalanish uchun tasdiqlanmagan ")}</small>
                  </div>
                  <div className="detail-block">
                    <h3>{t("Biriktirilgan mutaxassis")}</h3>
                    <div className="doctor-detail">
                      <span className="user-avatar">
                        <Stethoscope size={22} />
                      </span>
                      <div>
                        <strong>
                          {t(doctorNames[selected.doctor] || t("Biriktirilmagan"))}
                        </strong>
                        <p>{t(selected.status)}</p>
                      </div>
                    </div>
                  </div>
                  {[
                    "PENDING_DOCTOR_ACK",
                    "ESCALATED",
                    "REVIEW_REQUIRED",
                  ].includes(selected.statusCode ?? "") && (
                    <div className="button-row">
                      <button
                        className="button primary"
                        disabled={offline || working}
                        onClick={() =>
                          save(() => performCaseAction(selected.id, "accept"))
                        }
                      >
                        <CheckCheck size={17} />{t(" Holatni qabul qilish ")}</button>
                      {isPending(selected) && (
                        <button
                          className="button"
                          disabled={offline || working}
                          onClick={() =>
                            save(() => performCaseAction(selected.id, "busy"))
                          }
                        >{t("Bandman — o‘tkazish ")}</button>
                      )}
                    </div>
                  )}
                  {relatedPatients.length > 0 && (
                    <div className="detail-block">
                      <h3>
                        {selected.cohort === "POSTPARTUM"
                          ? t("Bog‘langan chaqaloq")
                          : t("Onasi")}
                      </h3>
                      <div className="button-row">
                        {relatedPatients.map((patient) => (
                          <button
                            key={patient.id}
                            type="button"
                            className="button"
                            onClick={() => { patientHistory.current.push(selected.id); setSelected(patient); }}
                          >
                            {patient.name}
                            <ChevronRight size={15} />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {selected.cohort === "POSTPARTUM" && (
                    <div className="detail-block">
                      <h3>{t("Tug‘ruqdan keyingi kuzatuv")}</h3>
                      <p>{t(selected.status)}</p>
                      <p>
                        {selected.followUpCompletedAt
                          ? t("Qayd etilgan: {date}", { date: formatDate(selected.followUpCompletedAt) })
                          : selected.followUpAt
                            ? t("Rejalashtirilgan: {date}", { date: formatDate(selected.followUpAt) })
                            : t(selected.time)}
                      </p>
                      {selected.statusCode === "POSTPARTUM_FOLLOW_UP" && (
                        <button
                          type="button"
                          className="button primary"
                          disabled={offline || working}
                          onClick={() =>
                            save(() =>
                              performCaseAction(
                                selected.id,
                                "postpartum-follow-up",
                              ),
                            )
                          }
                        >
                          <Check size={15} />{t(" Kuzatuv o‘tkazilganini qayd etish ")}</button>
                      )}
                    </div>
                  )}
                  <div className="detail-block patient-contact">
                    <h3>
                      <Phone size={16} />{t(" Bemor bilan bog‘lanish ")}</h3>
                    <p>{t("Aloqa oluvchi:")}{" "}
                      {selected.zone === "RED"
                        ? t("Oila a’zosi")
                        : selected.cohort === "NEONATAL"
                          ? t("Chaqaloqning onasi")
                          : t("Bemor")}
                    </p>
                    <PhoneActions key={selected.id + (selected.contactPhone ?? "")} patient={selected} disabled={offline || working} save={save}
                      onDial={() => { dialStart.current[selected.id] = new Date().toISOString(); if (!activeContact) void save(() => openContact(selected.id)); }}
                      onDemo={outcome => save(async () => {
                        const task = await openContact(selected.id);
                        await recordOutcome(task.id, outcome, crypto.randomUUID(), { channel: "ai_demo", duration_seconds: outcome === "REACHED" ? 30 : undefined });
                      })} />
                    {selected.contactPhone && <HandsetTest patientId={selected.id} onUpdate={refresh} />}
                    <CallHistory entries={(data?.history ?? []).filter(item => item.case_id === selected.id)} patients={patients} />
                    {selectedTasks.length > 0 && (
                      <p>{t("So‘nggi natija: ")}{t(selectedTasks.at(-1)?.statusLabel)}</p>
                    )}
                    {activeContact ? (
                      <ContactOutcomeForm
                        key={activeContact.id}
                        task={activeContact}
                        timed={Boolean(
                          activeContact.appointmentId &&
                          selectedVisit?.id === activeContact.appointmentId &&
                          selectedVisit.start &&
                          selected.statusCode !== "ATTENDED",
                        )}
                        disabled={offline || working}
                        onSave={saveContact}
                      />
                    ) : (
                      <button
                        className="button"
                        type="button"
                        disabled={offline || working}
                        onClick={() =>
                          save(() => performCaseAction(selected.id, "call"))
                        }
                      >{t("Aloqa vazifasini ochish ")}</button>
                    )}
                  </div>
                  {isAwaitingFacility(selected) && (
                    <FacilityResponseForm
                      key={selected.id}
                      disabled={offline || working}
                      rescheduling={
                        selected.referralStatus === "RESCHEDULE_REQUESTED"
                      }
                      onSave={(response) =>
                        save(() =>
                          recordFacilityResponse(selected.id, response),
                        )
                      }
                    />
                  )}
                  {selectedVisit && (
                    <div className="detail-block">
                      <h3>{t("Muassasa bilan kelishilgan tashrif")}</h3>
                      <p>
                        {t(selectedVisit.facility ?? t("Muassasa ko‘rsatilmagan"))}
                      </p>
                      <p>
                        {t(selectedVisit.practitioner
                          ? (doctorNames[selectedVisit.practitioner] ??
                            selectedVisit.practitioner)
                          : t("Qabul shifokori ko‘rsatilmagan"))}
                      </p>
                      <p>
                        {selectedVisit.start
                          ? formatDate(selectedVisit.start)
                          : t("Aniq vaqtsiz tashrif")}
                      </p>
                      {selected.statusCode !== "ATTENDED" && (
                        <button
                          className="button"
                          disabled={offline || working}
                          onClick={() =>
                            save(() => recordAttendance(selectedVisit.id))
                          }
                        >{t("Bemor kelganini qayd etish ")}</button>
                      )}
                    </div>
                  )}
                  <div className="detail-block">
                    <h3>{t("Kuzatuv jarayoni")}</h3>
                    <div className="care-steps">
                      <p>
                        <Check size={15} />{t("Kuzatuv qabul qilindi ")}</p>
                      <p>
                        <Check size={15} />{t("Xavf darajasi baholandi ")}</p>
                      <p>
                        <Check size={15} />{t("Registr yangilandi ")}</p>
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
          {t(toast)}
          <button aria-label={t("Yopish")} onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
function scheduledVisit(
  visits: RegistryResult["appointments"] | undefined,
  id: string,
) {
  return visits?.find(
    (visit) => visit.id === id && ["proposed", "booked"].includes(visit.status),
  );
}

function PhoneActions({ patient, disabled, save, onDial, onDemo }: {
  patient: Patient; disabled: boolean;
  save: (action: () => Promise<unknown>) => Promise<void>;
  onDial: () => void; onDemo: (outcome: "REACHED" | "NO_ANSWER") => void;
}) {
  const { t } = useLanguage();
  const [phone, setPhone] = useState(patient.contactPhone ?? "");
  const [demoOpen, setDemoOpen] = useState(false);
  return <div className="phone-actions">
    <form onSubmit={event => { event.preventDefault(); void save(() => savePhone(patient.id, phone)); }}>
      <label>{t("Aloqa raqami")}<input type="tel" value={phone} pattern="[+][1-9][0-9]{7,14}" placeholder="+998…" onChange={e => setPhone(e.target.value.replace(/[\s()-]/g, ""))} /></label>
      <button className="button" disabled={disabled || phone === (patient.contactPhone ?? "")}>{t("Saqlash")}</button>
    </form>
    <div className="button-row">
      {patient.contactPhone && !disabled && <a className="button" href={`tel:${patient.contactPhone}`} onClick={onDial}><Phone size={15}/>{t("O‘zim qo‘ng‘iroq qilaman")}</a>}
      <button className="button" disabled={disabled} aria-expanded={demoOpen} onClick={() => setDemoOpen(!demoOpen)}>{t("AI qo‘ng‘irog‘i (demo)")}</button>
    </div>
    {demoOpen && <div><p>{t("Sinov natijasini tanlang. Telefon raqami terilmaydi.")}</p>
      <div className="button-row">{(["REACHED", "NO_ANSWER"] as const).map(outcome =>
        <button className="button" key={outcome} disabled={disabled} onClick={() => { setDemoOpen(false); onDemo(outcome); }}>{t(outcome === "REACHED" ? "Bog‘lanildi" : "Javob yo‘q")}</button>)}</div>
    </div>}
  </div>;
}

function ConnectionCheck() {
  const { t } = useLanguage();
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);
  async function check() {
    setChecking(true);
    try {
      const result = await checkVoiceLab();
      setMessage({ connected: "VoiceLab API ulandi", missing_key: "VoiceLab API kaliti kiritilmagan",
        permission_denied: "VoiceLab kaliti yoki ruxsatlarini tekshiring", unavailable: "VoiceLab bilan aloqa o‘rnatilmadi" }[result.status]);
    } catch { setMessage("VoiceLab bilan aloqa o‘rnatilmadi"); }
    finally { setChecking(false); }
  }
  return <div className="outreach-row"><button className="button" disabled={checking} onClick={check}>{t("VoiceLab ulanishini tekshirish")}</button><span role="status">{t(message)}</span></div>;
}

const connectionLabels = {
  SUBMITTING: "So‘rov yuborilmoqda", QUEUED: "Navbatda", RINGING: "Telefon jiringlamoqda",
  IN_PROGRESS: "Aloqa o‘rnatildi", COMPLETED: "Yakunlandi", BUSY: "Raqam band", FAILED: "Ulanmadi",
  CANCELLED: "Bekor qilindi", CONFIG_ERROR: "Ovoz yoki hisob sozlamalarini tekshiring",
  REJECTED: "Operator qo‘ng‘iroqni rad etdi", UNKNOWN: "Natija noma’lum — operator jurnalini tekshiring",
  REACHED: "Bog‘lanildi", CONFIRMED: "Qabul tasdiqlandi", RESCHEDULE_REQUESTED: "Boshqa vaqt so‘raldi", NO_ANSWER: "Javob yo‘q",
};

function HandsetTest({patientId, onUpdate}: {patientId?: string; onUpdate: () => Promise<void>}) {
  const { t } = useLanguage();
  const [lastFour, setLastFour] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const requestId = useRef("");
  async function prepare() {
    setBusy(true);
    setMessage("");
    try {
      const setup = await phoneSetup();
      if (setup.missing.length) setMessage(t("Telefon sozlamalari:") + " " + setup.missing.join(", "));
      else {
        requestId.current = crypto.randomUUID();
        setLastFour(setup.last_four);
      }
    } catch (err) { setMessage(err instanceof Error ? err.message : t("Ulanmadi")); }
    finally { setBusy(false); }
  }
  async function call() {
    setBusy(true);
    try {
      const result = await ringHandset(requestId.current, patientId);
      setMessage(t(connectionLabels[result.outcome]));
      setLastFour("");
      await onUpdate();
    } catch (err) { setMessage(err instanceof Error ? err.message : t("Ulanmadi")); }
    finally { setBusy(false); }
  }
  return <div className="outreach-row">
    <button className="button" disabled={busy} onClick={lastFour ? call : prepare}>
      <Phone size={15}/>{lastFour ? t("Bir marta qo‘ng‘iroq qilish") + " ····" + lastFour : t("Haqiqiy sinov qo‘ng‘irog‘i")}
    </button>
    {lastFour && <button className="button" disabled={busy} onClick={() => setLastFour("")}>{t("Yopish")}</button>}
    <span role="status">{message}</span>
  </div>;
}

function CallHistory({ entries, patients, onSelect }: { entries: ContactAttempt[]; patients: Patient[]; onSelect?: (patient: Patient) => void }) {
  const { t, date } = useLanguage();
  return <section className="call-history"><h3>{t("Qo‘ng‘iroqlar tarixi")}</h3>
    {!entries.length && <p>{t("Hozircha qo‘ng‘iroqlar yo‘q.")}</p>}
    {entries.map(entry => {
      const patient = patients.find(p => p.id === entry.case_id);
      return <div className="outreach-row" key={entry.id}>
        {patient && onSelect && <button className="patient-name" onClick={() => onSelect(patient)}>{patient.name}</button>}
        <span>{date(entry.started_at)}</span><span>{t(entry.channel === "live_test" ? "Haqiqiy sinov qo‘ng‘irog‘i" : entry.channel === "doctor" ? "Shifokor" : "AI qo‘ng‘irog‘i (demo)")}</span>
        <strong className={entry.outcome === "NO_ANSWER" ? "missed-call" : undefined}>{t(connectionLabels[entry.outcome])}</strong>
        {entry.duration_seconds != null && <span>{Math.floor(entry.duration_seconds / 60)}:{String(entry.duration_seconds % 60).padStart(2, "0")}</span>}
      </div>;
    })}
  </section>;
}

function isOpenContact(task: Outreach) {
  return ["READY", "QUEUED", "NO_ANSWER"].includes(task.status);
}

function ContactOutcomeForm({
  task,
  timed,
  disabled,
  onSave,
}: {
  task: Outreach;
  timed: boolean;
  disabled: boolean;
  onSave: (task: Outreach, outcome: OutreachOutcome, attemptId: string, duration?: number) => void;
}) {
  const { t } = useLanguage();
  const attempt = useRef<{
    count: number;
    outcome: OutreachOutcome;
    id: string;
  } | null>(null);
  return (
    <form
      className="contact-outcome"
      onSubmit={(e) => {
        e.preventDefault();
        const outcome = new FormData(e.currentTarget).get(
          "outcome",
        ) as OutreachOutcome;
        if (
          attempt.current?.count !== task.attempts ||
          attempt.current.outcome !== outcome
        ) {
          attempt.current = {
            count: task.attempts,
            outcome,
            id: globalThis.crypto.randomUUID(),
          };
        }
        const duration = new FormData(e.currentTarget).get("duration");
        onSave(task, outcome, attempt.current.id, duration ? Number(duration) : undefined);
      }}
    >
      <select
        name="outcome"
        aria-label={t("{name}: aloqa natijasi", { name: task.patientName })}
        required
        defaultValue=""
        disabled={disabled}
      >
        <option value="" disabled>{t("Natijani tanlang ")}</option>
        <option value="REACHED">{t("Bog‘lanildi")}</option>
        {timed && (
          <>
            <option value="CONFIRMED">{t("Qabul tasdiqlandi")}</option>
            <option value="RESCHEDULE_REQUESTED">{t("Boshqa vaqt so‘raldi")}</option>
          </>
        )}
        <option value="NO_ANSWER">{t("Javob yo‘q")}</option>
      </select>
      <input type="number" name="duration" min="0" max="86400" placeholder={t("Davomiyligi (soniya)")} aria-label={t("Davomiyligi (soniya)")} disabled={disabled} />
      <button className="button" disabled={disabled}>{t("Qayd etish ")}</button>
    </form>
  );
}

function isAwaitingFacility(patient: Patient) {
  return (
    patient.referralStatus === "AWAITING_FACILITY" ||
    patient.referralStatus === "RESCHEDULE_REQUESTED"
  );
}

function FacilityResponseForm({
  disabled,
  rescheduling,
  onSave,
}: {
  disabled: boolean;
  rescheduling: boolean;
  onSave: (response: FacilityResponse) => void;
}) {
  const { t } = useLanguage();
  const [mode, setMode] = useState<FacilityResponse["mode"]>("timed");
  return (
    <form
      className="detail-block facility-response"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const practitioner = String(form.get("practitioner") ?? "");
        onSave({
          mode,
          facility: String(form.get("facility") ?? "").trim(),
          practitioner_id: practitioner || undefined,
          start: mode === "timed" ? `${form.get("start")}+05:00` : undefined,
          confirmed: mode === "timed" && form.get("confirmed") === "on",
        });
      }}
    >
      <h3>
        {rescheduling
          ? t("Yangi qabul vaqtini qayd etish")
          : t("Muassasa javobini qayd etish")}
      </h3>
      <fieldset disabled={disabled}>
        <label>{t("Tashrif turi ")}<select
            value={mode}
            onChange={(e) =>
              setMode(e.target.value as FacilityResponse["mode"])
            }
          >
            <option value="timed">{t("Sana va vaqt belgilangan")}</option>
            <option value="untimed">{t("Aniq vaqtsiz tashrif")}</option>
          </select>
        </label>
        <label>{t("Qabul qiluvchi muassasa ")}<input name="facility" required maxLength={160} />
        </label>
        <label>{t("Qabul shifokori ")}<select
            name="practitioner"
            required={mode === "timed"}
            defaultValue=""
          >
            <option value="">{t("Shifokorni tanlang")}</option>
            {Object.values(doctorNames).map((name, index) => (
              <option key={name} value={`d${index + 1}`}>
                {t(name)}
              </option>
            ))}
          </select>
        </label>
        {mode === "timed" && (
          <>
            <label>{t("Qabul vaqti (Toshkent) ")}<input name="start" type="datetime-local" required />
            </label>
            <label className="facility-confirm">
              <input name="confirmed" type="checkbox" />{t(" Bemor vaqtni tasdiqladi ")}</label>
          </>
        )}
        <button type="submit" className="button primary">{t("Javobni saqlash ")}</button>
      </fieldset>
    </form>
  );
}

function ClinicRows({ patients }: { patients: Patient[] }) {
  const { t } = useLanguage();
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
              <strong>{t(clinic)}</strong>
              <small>{ps.length}{t(" bemor kuzatuvda")}</small>
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
          <i className="red" />{t("Qizil zona ")}</span>
        <span>
          <i className="yellow" />{t("Sariq zona ")}</span>
        <span>
          <i className="green" />{t("Yashil zona ")}</span>
      </div>
    </div>
  );
}
