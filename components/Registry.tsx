'use client';

import { useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpDown, Baby, ChevronRight, CircleCheck, Clock3, Search, SlidersHorizontal, UsersRound } from 'lucide-react';
import { doctors, Patient, zoneLabels } from '../lib/demo';

type Props = {
  patients: Patient[]; onSelect: (patient: Patient) => void;
  persona: string; riskFilter: string; onRiskFilter: (value: string) => void;
};

export default function Registry({ patients, onSelect, persona, riskFilter, onRiskFilter }: Props) {
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
      && `${p.name} ${p.id} ${p.reason}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    return sortByName ? result.sort((a, b) => a.name.localeCompare(b.name)) : result;
  }, [patients, persona, cohort, riskFilter, clinic, query, sortByName]);
  function exportCSV() {
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const rows = [['ID', 'Bemor', 'Guruh', 'Poliklinika', 'Xavf', 'Sabab', 'Shifokor', 'Holat'],
      ...filtered.map(p => [p.id, p.name, p.cohort, p.clinic, zoneLabels[p.zone], p.reason, doctors.find(d => d.id === p.doctor)?.name || p.doctor, p.status])];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = 'perinatal-registr.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="registry panel" aria-labelledby="registry-title">
    <div className="registry-heading">
      <div><h2 id="registry-title">Bemorlar registri <span className="count-badge">{scope.length}</span></h2><p>Har bir ona va chaqaloq — e’tiborimiz markazida.</p></div>
      <button className="button button-secondary export-button" onClick={exportCSV}><ArrowDownToLine size={16} /> Eksport</button>
    </div>
    <div className="registry-tabs" role="tablist" aria-label="Bemorlar guruhi">
      {[{ id: 'ALL', label: 'Barchasi', icon: UsersRound }, { id: 'MATERNAL', label: 'Homilador ayollar', icon: UsersRound }, { id: 'NEONATAL', label: 'Chaqaloqlar', icon: Baby }].map(tab => <button key={tab.id} role="tab" aria-selected={cohort === tab.id} className={`registry-tab ${cohort === tab.id ? 'active' : ''}`} onClick={() => setCohort(tab.id)}><tab.icon size={16} />{tab.label}<span>{scope.filter(p => tab.id === 'ALL' || p.cohort === tab.id).length}</span></button>)}
    </div>
    <div className="registry-filters">
      <label className="registry-search"><Search size={17} /><input aria-label="Bemor ismi yoki ID bo‘yicha qidirish" placeholder="Ism yoki ID bo‘yicha qidirish..." value={query} onChange={e => setQuery(e.target.value)} /></label>
      <select className="filter-select" aria-label="Poliklinika" value={clinic} onChange={e => setClinic(e.target.value)}><option value="ALL">Barcha poliklinikalar</option>{Array.from(new Set(patients.map(p => p.clinic))).map(c => <option key={c}>{c}</option>)}</select>
      <label className="risk-select-wrap"><SlidersHorizontal size={15} /><select className="filter-select" aria-label="Xavf darajasi" value={riskFilter || 'ALL'} onChange={e => onRiskFilter(e.target.value)}><option value="ALL">Barcha zonalar</option><option value="RED">Qizil zona</option><option value="YELLOW">Sariq zona</option><option value="GREEN">Yashil zona</option><option value="REVIEW">Tekshirish zarur</option></select></label>
    </div>
    <div className="registry-table-scroll"><table className="registry-table"><thead><tr><th><button className="table-sort" onClick={() => setSortByName(!sortByName)}>BEMOR <ArrowUpDown size={12} /></button></th><th>XAVF DARAJASI</th><th>KLINIK KO‘RSATKICHLAR</th><th>MAS’UL SHIFOKOR</th><th>JARAYON HOLATI</th><th><span className="sr-only">Batafsil</span></th></tr></thead><tbody>
      {filtered.map(p => { const doctor = doctors.find(d => d.id === p.doctor); return <tr key={p.id} className={`patient-row ${p.zone === 'RED' ? 'priority-row' : ''}`} onClick={() => onSelect(p)}>
        <td><div className="patient-identity"><span className={`patient-avatar ${p.cohort === 'NEONATAL' ? 'baby-avatar' : ''}`}>{p.cohort === 'NEONATAL' ? <Baby size={21} /> : p.name.split(' ').map(n => n[0]).slice(0, 2).join('')}</span><div><button className="patient-name" onClick={e => { e.stopPropagation(); onSelect(p); }}>{p.name}</button><span className="patient-meta">{p.cohort === 'MATERNAL' ? `${p.age} yosh · ` : ''}{p.stage} <span className="meta-dot">·</span> {p.clinic}</span></div></div></td>
        <td><span className={`zone-badge zone-${p.zone.toLowerCase()}`}><i />{zoneLabels[p.zone]}</span><span className="patient-reason">{p.reason}</span></td>
        <td><div className="clinical-values">{p.vitals.map((v, i) => <span key={v} className={i === 0 && p.zone !== 'GREEN' ? `vital-${p.zone.toLowerCase()}` : ''}>{v}</span>)}</div></td>
        <td><span className="doctor-name">{doctor ? `Dr. ${doctor.name.split(' ').at(-1)}` : 'Biriktirilmagan'}</span><span className="doctor-specialty">{doctor?.specialty}</span></td>
        <td><span className={`process-status ${p.zone === 'RED' ? 'status-urgent' : ''}`}>{p.status === 'Qabul tasdiqlandi' ? <CircleCheck size={13} /> : <Clock3 size={13} />}{p.status}</span><span className={`process-time ${p.zone === 'RED' ? 'countdown' : ''}`}>{p.time}</span></td>
        <td><button className="row-open" aria-label={`${p.name}: batafsil`} onClick={e => { e.stopPropagation(); onSelect(p); }}><ChevronRight size={18} /></button></td>
      </tr>; })}
    </tbody></table>{filtered.length === 0 && <div className="registry-empty"><Search size={28} /><h3>Bemor topilmadi</h3><p>Qidiruv yoki filtrlarni o‘zgartirib ko‘ring.</p><button className="button button-secondary" onClick={() => { setQuery(''); setClinic('ALL'); setCohort('ALL'); onRiskFilter('ALL'); }}>Filtrlarni tozalash</button></div>}</div>
    <div className="registry-footer"><span>{filtered.length} ta bemor ko‘rsatilmoqda <span className="muted">/ {scope.length} ta</span></span><span className="registry-footnote"><span className="live-dot" /> Demo registr · sintetik ma’lumotlar</span></div>
  </section>;
}
