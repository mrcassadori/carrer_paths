import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DICT } from '../locales'

export type Locale = 'pt' | 'en' | 'es'
export const LOCALES: { code: Locale; label: string; short: string }[] = [
  { code: 'pt', label: 'Português', short: 'PT' },
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'es', label: 'Español', short: 'ES' },
]
const DATE_LOCALE: Record<Locale, string> = { pt: 'pt-BR', en: 'en-US', es: 'es-ES' }
const STORAGE_KEY = 'cp-locale'

type Vars = Record<string, string | number>
export type T = (text: string | null | undefined, vars?: Vars) => string

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'pt' || saved === 'en' || saved === 'es') return saved
  } catch { /* sem localStorage */ }
  const nav = (navigator.language || 'pt').slice(0, 2)
  return nav === 'en' || nav === 'es' ? nav : 'pt'
}

const fill = (s: string, vars?: Vars) =>
  vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s

/**
 * O texto em português é a própria chave. Sem tradução cadastrada, mostra o português;
 * serve também para textos que vêm do banco (catálogo de skills, trilhas, níveis).
 */
export function translate(locale: Locale, text: string | null | undefined, vars?: Vars): string {
  if (!text) return ''
  if (locale === 'pt') return fill(text, vars)
  return fill(DICT[text]?.[locale] ?? text, vars)
}

interface I18n { locale: Locale; setLocale: (l: Locale) => void; t: T; dateLocale: string }
const Ctx = createContext<I18n | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)
  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    try { localStorage.setItem(STORAGE_KEY, l) } catch { /* sem localStorage */ }
  }, [])
  useEffect(() => { document.documentElement.lang = DATE_LOCALE[locale] }, [locale])
  const value = useMemo<I18n>(() => ({
    locale, setLocale, dateLocale: DATE_LOCALE[locale],
    t: (text, vars) => translate(locale, text, vars),
  }), [locale, setLocale])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n(): I18n {
  const v = useContext(Ctx)
  if (!v) throw new Error('useI18n fora do I18nProvider')
  return v
}

/** Seletor PT / EN / ES. */
export function LanguageSwitcher({ dark = false }: { dark?: boolean }) {
  const { locale, setLocale } = useI18n()
  return (
    <div role="group" aria-label="Idioma / Language / Idioma" className="flex gap-1">
      {LOCALES.map((l) => (
        <button key={l.code} type="button" lang={DATE_LOCALE[l.code]} title={l.label}
          aria-pressed={locale === l.code} onClick={() => setLocale(l.code)}
          className={`px-2 py-1 rounded text-xs font-card font-semibold ${locale === l.code
            ? dark ? 'bg-white text-midnight' : 'bg-midnight text-white'
            : dark ? 'text-white/80 hover:text-white' : 'text-apoio hover:text-midnight'}`}>
          {l.short}
        </button>
      ))}
    </div>
  )
}
