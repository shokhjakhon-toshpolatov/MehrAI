import type { Metadata } from "next";
import "./globals.css";
import { LanguageProvider } from "@/components/LanguageProvider";
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
      <body><LanguageProvider>{children}</LanguageProvider></body>
    </html>
  );
}
