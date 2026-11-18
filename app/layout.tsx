import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Perinatal nazorat | Klinik ish maydoni",
  description:
    "Perinatal bemorlar registri, shoshilinch holatlar va mutaxassis qabullarini kuzatish.",
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
