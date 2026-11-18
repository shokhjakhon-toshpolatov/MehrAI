"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpDown,
  Baby,
  ChevronRight,
  CircleCheck,
  ClipboardCheck,
  Clock3,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  UsersRound,
} from "lucide-react";
import { doctors, Patient, Zone, zoneLabels } from "../lib/demo";

type Props = {
  patients: Patient[];
  onSelect: (patient: Patient) => void;
  persona: string;
  riskFilter: string;
  onRiskFilter: (value: string) => void;
};
const priority: Record<Zone, number> = {
  RED: 0,
  REVIEW: 1,
  YELLOW: 2,
  GREEN: 3,
};
const riskIcons = {
  RED: TriangleAlert,
  REVIEW: ClipboardCheck,
  YELLOW: Clock3,
  GREEN: ShieldCheck,
};
function statusClass(patient: Patient) {
  if (
    patient.statusCode === "PATIENT_CONFIRMED" ||
    patient.status === "Qabul tasdiqlandi"
  )
    return "status-confirmed";
  if (patient.statusCode === "ESCALATED") return "status-escalated";
  if (patient.statusCode === "PENDING_DOCTOR_ACK") return "status-pending";
  return "status-neutral";
}
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("uz-UZ", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Tashkent",
      }).format(date);
}

export default function Registry({
  patients,
  onSelect,
  persona,
  riskFilter,
  onRiskFilter,
}: Props) {
  const [cohort, setCohort] = useState("ALL");
  const [query, setQuery] = useState("");
  const [clinic, setClinic] = useState("ALL");
  const [sortByName, setSortByName] = useState(false);
  const scope = patients.filter(
    (p) => persona === "district" || p.doctor === persona,
  );
  const filtered = useMemo(
    () =>
      patients
        .filter(
          (p) =>
            (persona === "district" || p.doctor === persona) &&
            (cohort === "ALL" || p.cohort === cohort) &&
            (!riskFilter || riskFilter === "ALL" || p.zone === riskFilter) &&
            (clinic === "ALL" || p.clinic === clinic) &&
            `${p.name} ${p.id} ${p.reason}`
              .toLocaleLowerCase()
              .includes(query.toLocaleLowerCase()),
        )
        .sort((a, b) =>
          sortByName
            ? a.name.localeCompare(b.name)
            : priority[a.zone] - priority[b.zone],
        ),
    [patients, persona, cohort, riskFilter, clinic, query, sortByName],
  );

  function exportCSV() {
    const escape = (value: string) =>
      `"${(/^[=+\-@\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
    const rows = [
      [
        "ID",
        "Bemor",
        "Guruh",
        "Poliklinika",
        "Xavf",
        "Sabab",
        "Shifokor",
        "Holat",
      ],
      ...filtered.map((p) => [
        p.id,
        p.name,
        p.cohort,
        p.clinic,
        zoneLabels[p.zone],
        p.reason,
        doctors.find((d) => d.id === p.doctor)?.name || p.doctor,
        p.status,
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\uFEFF" + rows.map((row) => row.map(escape).join(",")).join("\r\n")],
        { type: "text/csv;charset=utf-8;" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "perinatal-registr.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="registry panel" aria-labelledby="registry-title">
      <div className="registry-heading">
        <h2 id="registry-title">
          Bemorlar registri <span className="count-badge">{scope.length}</span>
        </h2>
        <div className="registry-heading-actions">
          <span className="registry-result-count" role="status">
            {filtered.length} / {scope.length} bemor
          </span>
          <button
            className="button button-secondary export-button"
            onClick={exportCSV}
          >
            <ArrowDownToLine size={16} aria-hidden="true" /> CSV eksport
          </button>
        </div>
      </div>
      <div className="registry-tabs" role="group" aria-label="Bemorlar guruhi">
        {[
          { id: "ALL", label: "Barchasi", icon: UsersRound },
          { id: "MATERNAL", label: "Homilador ayollar", icon: UsersRound },
          { id: "NEONATAL", label: "Chaqaloqlar", icon: Baby },
        ].map((tab) => (
          <button
            key={tab.id}
            aria-pressed={cohort === tab.id}
            className={`registry-tab ${cohort === tab.id ? "active" : ""}`}
            onClick={() => setCohort(tab.id)}
          >
            <tab.icon size={16} aria-hidden="true" />
            {tab.label}
            <span>
              {
                scope.filter((p) => tab.id === "ALL" || p.cohort === tab.id)
                  .length
              }
            </span>
          </button>
        ))}
      </div>
      <div className="registry-filters">
        <label className="registry-search">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">Bemor ismi yoki ID bo‘yicha qidirish</span>
          <input
            placeholder="Bemor ismi yoki ID..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          className="filter-select"
          aria-label="Poliklinika"
          value={clinic}
          onChange={(e) => setClinic(e.target.value)}
        >
          <option value="ALL">Barcha poliklinikalar</option>
          {Array.from(new Set(patients.map((p) => p.clinic))).map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <label className="risk-select-wrap">
          <SlidersHorizontal size={15} aria-hidden="true" />
          <select
            className="filter-select"
            aria-label="Xavf darajasi"
            value={riskFilter || "ALL"}
            onChange={(e) => onRiskFilter(e.target.value)}
          >
            <option value="ALL">Barcha xavf darajalari</option>
            <option value="RED">Qizil · Shoshilinch</option>
            <option value="REVIEW">Tekshirish zarur</option>
            <option value="YELLOW">Sariq · Ko‘rik zarur</option>
            <option value="GREEN">Yashil · Barqaror</option>
          </select>
        </label>
      </div>
      <div className="registry-table-scroll">
        <table className="registry-table">
          <caption className="sr-only">
            Perinatal bemorlar ish ro‘yxati.{" "}
            {sortByName
              ? "Ism bo‘yicha tartiblangan."
              : "Xavf darajasi bo‘yicha tartiblangan."}
          </caption>
          <thead>
            <tr>
              <th scope="col" aria-sort={sortByName ? "ascending" : "none"}>
                <button
                  className="table-sort"
                  onClick={() => setSortByName(!sortByName)}
                  title={
                    sortByName
                      ? "Xavf bo‘yicha tartiblash"
                      : "Ism bo‘yicha tartiblash"
                  }
                >
                  BEMOR <ArrowUpDown size={12} aria-hidden="true" />
                </button>
              </th>
              <th scope="col">XAVF DARAJASI</th>
              <th scope="col">KLINIK KO‘RSATKICHLAR</th>
              <th scope="col">MAS’UL SHIFOKOR</th>
              <th scope="col">KEYINGI HARAKAT / HOLAT</th>
              <th scope="col">
                <span className="sr-only">Bemorni ko‘rib chiqish</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const doctor = doctors.find((d) => d.id === p.doctor);
              const RiskIcon = riskIcons[p.zone];
              const status = statusClass(p);
              return (
                <tr
                  key={p.id}
                  className={`patient-row zone-row-${p.zone.toLowerCase()}`}
                >
                  <td>
                    <div className="patient-identity">
                      <button
                        className="patient-name"
                        onClick={() => onSelect(p)}
                      >
                        {p.name}
                      </button>
                      <span className="patient-meta">
                        <span className="patient-id">{p.id}</span> ·{" "}
                        {p.cohort === "MATERNAL"
                          ? `${p.age} yosh · `
                          : "Chaqaloq · "}
                        {p.stage}
                      </span>
                      <span className="patient-clinic">{p.clinic}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`zone-badge zone-${p.zone.toLowerCase()}`}>
                      <RiskIcon size={14} aria-hidden="true" />
                      {zoneLabels[p.zone]}
                    </span>
                    <span className="patient-reason">{p.reason}</span>
                  </td>
                  <td>
                    <div className="clinical-values">
                      {p.vitals.map((v, i) => (
                        <span
                          key={v}
                          className={
                            i === 0 && p.zone !== "GREEN"
                              ? `vital-${p.zone.toLowerCase()}`
                              : ""
                          }
                        >
                          {v}
                        </span>
                      ))}
                    </div>
                    {p.updatedAt && (
                      <span className="observation-time">
                        Yangilangan: {formatDate(p.updatedAt)}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="doctor-name">
                      {doctor
                        ? `Dr. ${doctor.name.split(" ").at(-1)}`
                        : "Biriktirilmagan"}
                    </span>
                    <span className="doctor-specialty">
                      {doctor?.specialty || "Mutaxassis tayinlash zarur"}
                    </span>
                  </td>
                  <td>
                    <span className={`process-status ${status}`}>
                      {status === "status-confirmed" ? (
                        <CircleCheck size={14} aria-hidden="true" />
                      ) : (
                        <Clock3 size={14} aria-hidden="true" />
                      )}
                      {p.status}
                    </span>
                    <span className="process-time">
                      {p.appointmentAt
                        ? `Qabul: ${formatDate(p.appointmentAt)}`
                        : p.time}
                    </span>
                    {p.deadline && (
                      <span className="process-deadline">
                        Tasdiqlash muddati: {formatDate(p.deadline)}
                      </span>
                    )}
                  </td>
                  <td>
                    <button
                      className="row-open"
                      aria-label={`${p.name}: ko‘rib chiqish`}
                      onClick={() => onSelect(p)}
                    >
                      Ko‘rib chiqish
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="registry-empty">
            <Search size={26} aria-hidden="true" />
            <h3>Bemor topilmadi</h3>
            <p>Qidiruv yoki filtrlarni o‘zgartiring.</p>
            <button
              className="button button-secondary"
              onClick={() => {
                setQuery("");
                setClinic("ALL");
                setCohort("ALL");
                onRiskFilter("ALL");
              }}
            >
              Filtrlarni tozalash
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
