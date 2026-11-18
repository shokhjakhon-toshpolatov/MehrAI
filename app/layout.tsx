import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "MehrAI — Perinatal registr",
  icons: { icon: "/mehrai.svg" },
  description: "Onalar va chaqaloqlar uchun klinik kuzatuv registri.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="uz">
      <body>{children}</body>
    </html>
  );
}
