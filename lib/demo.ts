export type Zone = 'RED' | 'YELLOW' | 'GREEN' | 'REVIEW';
export type Patient = {
  id: string; name: string; age: number; cohort: 'MATERNAL' | 'NEONATAL' | 'POSTPARTUM';
  stage: string; clinic: string; zone: Zone; reason: string; vitals: string[];
  doctor: string; status: string; time: string;
  statusCode?: string; deadline?: string; updatedAt?: string; appointmentAt?: string; referralStatus?: string; referralApprovedAt?: string; urgentOutreachApprovedAt?: string; previousZone?: Zone; previousVitals?: string[]; observationVersion?: string;
  motherId?: string; motherName?: string; followUpAt?: string; followUpCompletedAt?: string; assessedAt?: string; assessedBy?: string;
  analysisEligible?: boolean;
  riskEvidence?: string[];
};
export type Doctor = { id: string; name: string; specialty: string; initials: string; role: string };
export const doctors: Doctor[] = [
  { id: 'rahimova', name: 'Dilnoza Rahimova', specialty: 'Akusher-ginekolog', initials: 'DR', role: 'Navbatchi shifokor' },
  { id: 'karimov', name: 'Jamshid Karimov', specialty: 'Akusher-ginekolog', initials: 'JK', role: 'Zaxira shifokor' },
  { id: 'umarova', name: 'Malika Umarova', specialty: 'Endokrinolog / kardiolog', initials: 'MU', role: 'Konsultant' },
  { id: 'alimov', name: 'Sardor Alimov', specialty: 'Neonatolog', initials: 'SA', role: 'Navbatchi neonatolog' },
];
export const seedPatients: Patient[] = [
  { id: 'P-1003', name: 'Mohira Rustamova', age: 29, cohort: 'MATERNAL', stage: '34-hafta', clinic: '42-sonli OP', zone: 'RED', reason: 'Preeklampsiya xavfi', vitals: ['AQB 165/110', 'Proteinuriya ++'], doctor: 'rahimova', status: 'Tasdiq kutilmoqda', time: '—' },
  { id: 'P-1004', motherId: 'P-1009', motherName: 'Nigora Nazarova', name: 'Amirbek Nazarov', age: 5, cohort: 'NEONATAL', stage: '5 kunlik', clinic: '15-sonli OP', zone: 'YELLOW', reason: 'Neonatal sariqlik', vitals: ['Bilirubin 238 µmol/L', 'Vazn −8.4%'], doctor: 'alimov', status: 'Shifokor ko‘rigi kutilmoqda', time: '—', referralStatus: 'AWAITING_CLINICIAN' },
  { id: 'P-1002', name: 'Dilfuza Toshmatova', age: 26, cohort: 'MATERNAL', stage: '28-hafta', clinic: '15-sonli OP', zone: 'YELLOW', reason: 'Gestatsion diabet · anemiya', vitals: ['Glyukoza 5.8 mmol/L', 'Hb 94 g/L'], doctor: 'umarova', status: 'Shifokor ko‘rigi kutilmoqda', time: '—', referralStatus: 'AWAITING_CLINICIAN' },
  { id: 'P-1005', name: 'Shahnoza Abdullayeva', age: 31, cohort: 'MATERNAL', stage: '30-hafta', clinic: '42-sonli OP', zone: 'YELLOW', reason: 'O‘rtacha anemiya', vitals: ['Hb 98 g/L', 'AQB 120/80'], doctor: 'rahimova', status: 'Shifokor ko‘rigi kutilmoqda', time: '—', referralStatus: 'AWAITING_CLINICIAN' },
  { id: 'P-1001', name: 'Madina Karimova', age: 24, cohort: 'MATERNAL', stage: '24-hafta', clinic: '42-sonli OP', zone: 'GREEN', reason: 'Ko‘rsatkichlar me’yorda', vitals: ['AQB 115/75', 'Hb 118 g/L'], doctor: 'rahimova', status: 'Rejali kuzatuv', time: '20-noyabr' },
  { id: 'P-1006', motherId: 'P-1010', motherName: 'Malika Usmonova', name: 'Soliha Usmonova', age: 12, cohort: 'NEONATAL', stage: '12 kunlik', clinic: 'OVaBMU markazi', zone: 'GREEN', reason: 'Rivojlanishi me’yorda', vitals: ['Harorat 36.7 °C', 'SpO₂ 98%'], doctor: 'alimov', status: 'Patronaj nazorati', time: '19-noyabr' },
  { id: 'P-1007', name: 'Zarina Ergasheva', age: 27, cohort: 'MATERNAL', stage: '18-hafta', clinic: 'OVaBMU markazi', zone: 'GREEN', reason: 'Ko‘rsatkichlar me’yorda', vitals: ['AQB 110/70', 'Hb 121 g/L'], doctor: 'karimov', status: 'Rejali kuzatuv', time: '21-noyabr' },
  { id: 'P-1008', motherName: 'Dildora Aliyeva', name: 'Muhammad Aliyev', age: 8, cohort: 'NEONATAL', stage: '8 kunlik', clinic: '15-sonli OP', zone: 'GREEN', reason: 'Rivojlanishi me’yorda', vitals: ['Harorat 36.6 °C', 'Vazn −3.2%'], doctor: 'alimov', status: 'Patronaj nazorati', time: '19-noyabr' },
  { id: 'P-1009', name: 'Nigora Nazarova', age: 28, cohort: 'POSTPARTUM', stage: 'Tug‘ruqdan keyin 5 kun', clinic: '15-sonli OP', zone: 'REVIEW', reason: 'Tug‘ruqdan keyingi ko‘rikni mutaxassis baholaydi', vitals: [], doctor: 'rahimova', status: 'Kuzatuv kutilmoqda', statusCode: 'POSTPARTUM_FOLLOW_UP', time: '19-noyabr' },
  { id: 'P-1010', name: 'Malika Usmonova', age: 30, cohort: 'POSTPARTUM', stage: 'Tug‘ruqdan keyin 12 kun', clinic: 'OVaBMU markazi', zone: 'GREEN', reason: 'Klinik baholashda holat barqaror', assessedAt: '2026-11-17T11:00:00+05:00', assessedBy: 'rahimova', vitals: [], doctor: 'rahimova', status: 'Kuzatuv kutilmoqda', statusCode: 'POSTPARTUM_FOLLOW_UP', time: '19-noyabr' },

];
export const zoneLabels: Record<Zone, string> = { RED: 'Yuqori xavf', YELLOW: 'Kuzatuv zarur', GREEN: 'Barqaror', REVIEW: 'Klinik baho kerak' };
