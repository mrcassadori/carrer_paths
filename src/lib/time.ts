/** "4 anos e 7 meses" a partir de uma data ISO (yyyy-mm-dd) até hoje. */
export function tempoDesde(iso: string | null | undefined, hoje = new Date()): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  let meses = (hoje.getFullYear() - y) * 12 + (hoje.getMonth() + 1 - m)
  if (hoje.getDate() < d) meses -= 1
  if (meses < 0) return '—'
  const anos = Math.floor(meses / 12)
  const resto = meses % 12
  const partes: string[] = []
  if (anos) partes.push(`${anos} ${anos === 1 ? 'ano' : 'anos'}`)
  if (resto || !anos) partes.push(`${resto} ${resto === 1 ? 'mês' : 'meses'}`)
  return partes.join(' e ')
}
