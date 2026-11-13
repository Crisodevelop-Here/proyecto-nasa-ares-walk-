// Spanish / English. Interface text is written inline in both languages with t('es', 'en');
// content that lives in the data files (missions, stations, places…) is written in Spanish and
// looked up in the English dictionary with tr('…'), falling back to Spanish if a line is missing.
import { useSyncExternalStore } from 'react'
import { DATA_EN } from './data.en'

export type Lang = 'es' | 'en'
const KEY = 'ares-walk-lang'

function saved(): Lang {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'es' || v === 'en') return v
  } catch {
    // Private mode or blocked storage: keep the default.
  }
  return 'es'
}

let lang: Lang = typeof window === 'undefined' ? 'es' : saved()
const listeners = new Set<() => void>()

export const getLang = () => lang

export function setLang(next: Lang) {
  if (next === lang) return
  lang = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // Not persisted; the choice still applies to this visit.
  }
  if (typeof document !== 'undefined') document.documentElement.lang = next
  listeners.forEach((f) => f())
}

/** Current language; the component re-renders when it changes. */
export function useLang(): Lang {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    getLang,
    getLang,
  )
}

type Params = Record<string, string | number>
const fill = (s: string, p?: Params) => (p ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(p[k] ?? `{${k}}`)) : s)

/** Interface text in both languages, with optional {placeholders}. */
export const t = (es: string, en: string, p?: Params) => fill(lang === 'en' ? en : es, p)

/** Spanish content from the data files, translated through the English dictionary. */
export const tr = (es: string) => (lang === 'en' ? (DATA_EN[es] ?? es) : es)

/** Number/date locale for the current language. */
export const locale = () => (lang === 'en' ? 'en-US' : 'es-ES')

if (typeof document !== 'undefined') document.documentElement.lang = lang
