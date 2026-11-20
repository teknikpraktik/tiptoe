"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { DEFAULT_LANG, detectLang, LANGS, t as translate, type Lang, type MessageKey, type Vars } from "@/i18n";

const KEY = "tiptoe.lang";
/** Språket gäller tills profiler finns (fas 1 har en profil); därefter flyttar valet in i profilen. */
const read = (): Lang | null => { try { const v = localStorage.getItem(KEY); return LANGS.includes(v as Lang) ? (v as Lang) : null; } catch { return null; } };

interface LangCtx { lang: Lang; setLang(l: Lang): void }
const C = createContext<LangCtx>({ lang: DEFAULT_LANG, setLang: () => undefined });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);
  useEffect(() => {
    const l = read() ?? detectLang(typeof navigator !== "undefined" ? navigator.languages : undefined);
    setLangState(l);
    document.documentElement.lang = l;
  }, []);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    document.documentElement.lang = l;
    try { localStorage.setItem(KEY, l); } catch { /* privat läge */ }
  }, []);
  return <C.Provider value={{ lang, setLang }}>{children}</C.Provider>;
}

export const useLang = () => useContext(C);

/** `t(key, vars)` på aktuellt språk. */
export function useT() {
  const { lang } = useContext(C);
  return useCallback((key: MessageKey, vars?: Vars) => translate(lang, key, vars), [lang]);
}
