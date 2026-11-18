import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Mehr — Perinatal registr | DMED', description: 'Onalar va chaqaloqlar uchun uzluksiz g‘amxo‘rlik. Perinatal monitoring demonstratsiyasi.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="uz"><body>{children}</body></html>; }
