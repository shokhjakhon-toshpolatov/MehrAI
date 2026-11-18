'use client';

import { useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpDown, Baby, ChevronRight, HeartPulse, CircleCheck, Clock3, Search, SlidersHorizontal, UsersRound } from 'lucide-react';
import { doctors, Patient, zoneLabels } from '../lib/demo';
import { useLanguage } from './LanguageProvider';

type Props = {
  patients: Patient[]; onSelect: (patient: Patient) => void;
  persona: string; riskFilter: string; onRiskFilter: (value: string) => void;
};

export default function Registry({ patients, onSelect, persona, riskFilter, onRiskFilter }: Props) {
  const { language, t, date } = useLanguage();
  const [cohort, setCohort] = useState('ALL');
  const [query, setQuery] = useState('');
  const [clinic, setClinic] = useState('ALL');
  const [sortByName, setSortByName] = useState(false);
  const scope = patients.filter(p => persona === 'district' || p.doctor === persona);
  const filtered = useMemo(() => {
    const result = patients.filter(p => (persona === 'district' || p.doctor === persona)
      && (cohort === 'ALL' || p.cohort === cohort)
      && (!riskFilter || riskFilter === 'ALL' || p.zone === riskFilter)
      && (clinic === 'ALL' || p.clinic === clinic)
      && `${p.name} ${p.id} ${p.reason} ${t(p.reason)}`.toLocaleLowerCase(language).includes(query.toLocaleLowerCase(language)));
    return sortByName ? result.sort((a, b) => a.name.localeCompare(b.name, language)) : result;
  }, [patients, persona, cohort, riskFilter, clinic, query, sortByName, language, t]);
  function exportCSV() {
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const rows = [['ID', t("Bemor"), t("Guruh"), t("Poliklinika"), t("Xavf"), t("Sabab"), t("Shifokor"), t("Holat")],
      ...filtered.map(p => [p.id, p.name, t(p.cohort), t(p.clinic), t(zoneLabels[p.zone]), t(p.reason), doctors.find(d => d.id === p.doctor)?.name || p.doctor, t(p.status)])];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = 'perinatal-registr.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="registry panel" aria-labelledby="registry-title">
    <div className="registry-heading">
      <div><h2 id="registry-title">{t("Bemorlar registri ")}<span className="count-badge">{scope.length}</span></h2><p>{t("Har bir ona va chaqaloq — e’tiborimiz markazida.")}</p></div>
      <button className="button button-secondary export-button" onClick={exportCSV}><ArrowDownToLine size={16} />{t(" Eksport")}</button>
    </div>
    <div className="registry-tabs" role="tablist" aria-label={t("Bemorlar guruhi")}>
      {[{ id: 'ALL', label: t("Barchasi"), icon: UsersRound }, { id: 'MATERNAL', label: t("Homilador ayollar"), icon: UsersRound }, { id: 'POSTPARTUM', label: t("Tug‘ruqdan keyingi onalar"), icon: HeartPulse }, { id: 'NEONATAL', label: t("Chaqaloqlar"), icon: Baby }].map(tab => <button key={tab.id} role="tab" aria-selected={cohort === tab.id} className={`registry-tab ${cohort === tab.id ? 'active' : ''}`} onClick={() => setCohort(tab.id)}><tab.icon size={16} />{tab.label}<span>{scope.filter(p => tab.id === 'ALL' || p.cohort === tab.id).length}</span></button>)}
    </div>
    <div className="registry-filters">
      <label className="registry-search"><Search size={17} /><input aria-label={t("Bemor ismi yoki ID bo‘yicha qidirish")} placeholder={t("Ism yoki ID bo‘yicha qidirish...")} value={query} onChange={e => setQuery(e.target.value)} /></label>
      <select className="filter-select" aria-label={t("Poliklinika")} value={clinic} onChange={e => setClinic(e.target.value)}><option value="ALL">{t("Barcha poliklinikalar")}</option>{Array.from(new Set(patients.map(p => p.clinic))).map(c => <option key={c} value={c}>{t(c)}</option>)}</select>
      <label className="risk-select-wrap"><SlidersHorizontal size={15} /><select className="filter-select" aria-label={t("Xavf darajasi")} value={riskFilter || 'ALL'} onChange={e => onRiskFilter(e.target.value)}><option value="ALL">{t("Barcha zonalar")}</option><option value="RED">{t("Qizil zona")}</option><option value="YELLOW">{t("Sariq zona")}</option><option value="GREEN">{t("Yashil zona")}</option><option value="REVIEW">{t(zoneLabels.REVIEW)}</option></select></label>
    </div>
    <div className="registry-table-scroll"><table className="registry-table"><thead><tr><th><button className="table-sort" onClick={() => setSortByName(!sortByName)}>{t("BEMOR ")}<ArrowUpDown size={12} /></button></th><th>{t("XAVF DARAJASI")}</th><th>{t("KLINIK KO‘RSATKICHLAR")}</th><th>{t("MAS’UL SHIFOKOR")}</th><th>{t("JARAYON HOLATI")}</th><th><span className="sr-only">{t("Batafsil")}</span></th></tr></thead><tbody>
      {filtered.map(p => { const doctor = doctors.find(d => d.id === p.doctor); return <tr key={p.id} className={`patient-row ${p.zone === 'RED' ? 'priority-row' : ''}`} onClick={() => onSelect(p)}>
        <td><div className="patient-identity"><span className={`patient-avatar ${p.cohort === 'NEONATAL' ? 'baby-avatar' : ''}`}>{p.cohort === 'NEONATAL' ? <Baby size={21} /> : p.name.split(' ').map(n => n[0]).slice(0, 2).join('')}</span><div><button className="patient-name" onClick={e => { e.stopPropagation(); onSelect(p); }}>{p.name}</button><span className="patient-meta">{p.cohort !== 'NEONATAL' ? t("{age} yosh · ", { age: p.age }) : ''}{t(p.stage)} <span className="meta-dot">·</span> {t(p.clinic)}</span></div></div></td>
        <td><span className={`zone-badge zone-${p.zone.toLowerCase()}`}><i />{t(zoneLabels[p.zone])}</span></td>
        <td><div className="clinical-values">{p.vitals.map((v, i) => <span key={v} className={i === 0 && p.zone !== 'GREEN' ? `vital-${p.zone.toLowerCase()}` : ''}>{t(v)}</span>)}</div></td>
        <td><span className="doctor-name">{t(doctor ? `Dr. ${doctor.name.split(' ').at(-1)}` : t("Biriktirilmagan"))}</span><span className="doctor-specialty">{t(doctor?.specialty)}</span></td>
        <td><span className={`process-status ${p.zone === 'RED' ? 'status-urgent' : ''}`}>{p.status === 'Qabul tasdiqlandi' ? <CircleCheck size={13} /> : <Clock3 size={13} />}{t(p.status)}</span><span className={`process-time ${p.zone === 'RED' ? 'countdown' : ''}`}>{p.timeAt ? date(p.timeAt) : t(p.time)}</span></td>
        <td><button className="row-open" aria-label={t("{name}: batafsil", { name: p.name })} onClick={e => { e.stopPropagation(); onSelect(p); }}><ChevronRight size={18} /></button></td>
      </tr>; })}
    </tbody></table>{filtered.length === 0 && <div className="registry-empty"><Search size={28} /><h3>{t("Bemor topilmadi")}</h3><p>{t("Qidiruv yoki filtrlarni o‘zgartirib ko‘ring.")}</p><button className="button button-secondary" onClick={() => { setQuery(''); setClinic('ALL'); setCohort('ALL'); onRiskFilter('ALL'); }}>{t("Filtrlarni tozalash")}</button></div>}</div>
    <div className="registry-footer"><span>{filtered.length}{t(" ta bemor ko‘rsatilmoqda ")}<span className="muted">/ {scope.length}{t(" ta")}</span></span><span className="registry-footnote"><span className="live-dot" />{t(" Demo registr · sintetik ma’lumotlar")}</span></div>
  </section>;
}
