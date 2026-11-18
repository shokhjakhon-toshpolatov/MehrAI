"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { formatDate, translate, type Language } from "@/lib/translations";

const STORAGE_KEY = "mehrai-language";
const LanguageContext = createContext<{
  language: Language;
  setLanguage: (language: Language) => void;
  t: (text: string | undefined, values?: Record<string, string | number>) => string;
  date: (value: string) => string;
} | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, updateLanguage] = useState<Language>("uz");
  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "ru") updateLanguage("ru");
    } catch { /* Language switching also works when storage is unavailable. */ }
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = language === "ru" ? "MehrAI — Перинатальный регистр" : "MehrAI — Perinatal registr";
  }, [language]);
  const setLanguage = useCallback((value: Language) => {
    updateLanguage(value);
    try { localStorage.setItem(STORAGE_KEY, value); } catch { /* Keep the in-memory preference. */ }
  }, []);
  const t = useCallback((text: string | undefined, values?: Record<string, string | number>) => translate(language, text ?? "", values), [language]);
  const date = useCallback((value: string) => formatDate(value, language), [language]);
  return <LanguageContext.Provider value={{ language, setLanguage, t, date }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
}
