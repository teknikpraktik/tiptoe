import { en } from "./en";
import { sv, type MessageKey } from "./sv";

/** Typade ordlistor utan i18n-bibliotek (spec: Profiler, språk och lagring → Språk). */
export type Lang = "sv" | "en";
export type { MessageKey };
export const LANGS: readonly Lang[] = ["sv", "en"];
export const DEFAULT_LANG: Lang = "sv";

const DICTS: Record<Lang, Record<MessageKey, string>> = { sv, en };

export type Vars = Record<string, string | number>;

/** Text för `key` på `lang`, med `{namn}` ersatt ur `vars`. Saknas en text (ska inte hända) används svenskan. */
export function t(lang: Lang, key: MessageKey, vars?: Vars): string {
  const s = DICTS[lang][key] ?? sv[key];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Språk vid första start: svenska om enheten föredrar svenska (eller ett annat nordiskt språk), annars engelska. */
export function detectLang(preferred: readonly string[] | undefined): Lang {
  for (const tag of preferred ?? []) {
    const base = tag.toLowerCase().split("-")[0];
    if (base === "sv" || base === "nb" || base === "nn" || base === "no" || base === "da" || base === "fi") return "sv";
    if (base === "en") return "en";
  }
  return preferred && preferred.length ? "en" : DEFAULT_LANG;
}

export const dict = (lang: Lang) => DICTS[lang];
