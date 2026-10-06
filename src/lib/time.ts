import type { Locale } from './i18n'

const UNIDADES: Record<Locale, { ano: [string, string]; mes: [string, string]; e: string }> = {
  pt: { ano: ['ano', 'anos'], mes: ['mês', 'meses'], e: ' e ' },
  en: { ano: ['year', 'years'], mes: ['month', 'months'], e: ' and ' },
  es: { ano: ['año', 'años'], mes: ['mes', 'meses'], e: ' y ' },
}

/** "4 anos e 7 meses" a partir de uma data ISO (yyyy-mm-dd) até hoje, no idioma pedido. */
export function tempoDesde(iso: string | null | undefined, locale: Locale = 'pt', hoje = new Date()): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  let meses = (hoje.getFullYear() - y) * 12 + (hoje.getMonth() + 1 - m)
  if (hoje.getDate() < d) meses -= 1
  if (meses < 0) return '—'
  const anos = Math.floor(meses / 12)
  const resto = meses % 12
  const u = UNIDADES[locale]
  const partes: string[] = []
  if (anos) partes.push(`${anos} ${anos === 1 ? u.ano[0] : u.ano[1]}`)
  if (resto || !anos) partes.push(`${resto} ${resto === 1 ? u.mes[0] : u.mes[1]}`)
  return partes.join(u.e)
}
