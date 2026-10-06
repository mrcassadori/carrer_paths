import { useEffect, useState } from 'react'
import { Card, ErrorText } from '../components/ui'
import { useI18n } from '../lib/i18n'
import { supabase } from '../lib/supabase'

const META = 30
const TIME = 50
// Mês corrente (AAAA-MM) do gasto com IA, fixado quando a página carrega
const thisMonth = new Date().toISOString().slice(0, 7)

interface Summary { signed_up: number; started: number; complete: number; submitted: number; validated: number }
interface BySource { source: string; signed_up: number; complete: number }
interface Usage { month: string; feature: string; calls: number; input_tokens: number; output_tokens: number; cost_usd: number }
interface ByManager { manager_id: string; manager_name: string; team_signed_up: number; team_complete: number }

/** Painel de adoção: só números agregados, nunca a lista de quem se cadastrou. */
export default function Adocao() {
  const { t, dateLocale } = useI18n()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [sources, setSources] = useState<BySource[]>([])
  const [managers, setManagers] = useState<ByManager[]>([])
  const [usage, setUsage] = useState<Usage[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    ;(async () => {
      const [s, o, m, u] = await Promise.all([
        supabase.rpc('adoption_summary').single<Summary>(),
        supabase.rpc('adoption_by_source'),
        supabase.rpc('adoption_by_manager'),
        supabase.rpc('ai_usage_summary'),
      ])
      if (s.error) { setError(s.error.message); return }
      setSummary(s.data)
      setSources(o.data ?? [])
      setManagers(m.data ?? [])
      setUsage(u.data ?? [])
    })()
  }, [])

  if (error) return <ErrorText>{t(error)}</ErrorText>
  if (!summary) return <p className="text-apoio">{t('Carregando…')}</p>

  const withManager = managers.reduce((n, m) => n + Number(m.team_signed_up), 0)
  const withoutManager = Number(summary.signed_up) - withManager
  const pct = Math.min(100, (Number(summary.complete) / META) * 100)

  const sum = (rows: Usage[], k: 'calls' | 'input_tokens' | 'output_tokens' | 'cost_usd') => rows.reduce((n, r) => n + Number(r[k]), 0)
  const monthRows = usage.filter((r) => r.month.startsWith(thisMonth))
  const tokens = (rows: Usage[]) => sum(rows, 'input_tokens') + sum(rows, 'output_tokens')
  const usd = (v: number) => v.toLocaleString(dateLocale, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const num = (v: number) => v.toLocaleString(dateLocale)
  const FEATURE_LABEL: Record<string, string> = { 'ler-curriculo': 'Leitura de currículo', 'analisar-perfil': 'Análise do perfil' }
  const byFeature = Object.entries(FEATURE_LABEL).map(([key, label]) => {
    const rows = usage.filter((r) => r.feature === key)
    const monthR = monthRows.filter((r) => r.feature === key)
    return { label, calls: sum(monthR, 'calls'), tokens: tokens(monthR), cost: sum(monthR, 'cost_usd'), totalCost: sum(rows, 'cost_usd') }
  })

  const stats = [
    { label: 'Contas criadas', value: summary.signed_up, tone: 'preparacao' as const },
    { label: 'Começaram o cadastro', value: summary.started, tone: 'preparacao' as const },
    { label: 'Cadastros completos', value: summary.complete, tone: 'consolidacao' as const },
    { label: 'Mapas enviados ao líder', value: summary.submitted, tone: 'seminario' as const },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2">{t('Adoção')}</h1>
        <p className="text-apoio">{t('Números agregados do time. Ninguém aparece por nome aqui.')}</p>
      </div>

      <Card tone="consolidacao" title={t('Meta: {meta} cadastros completos de {total} pessoas', { meta: META, total: TIME })}>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-4xl font-titulo font-extrabold">{summary.complete}</span>
          <span className="text-apoio">{t('de {n}', { n: META })}</span>
        </div>
        <div className="h-3 bg-midnight/10 rounded" role="progressbar" aria-valuemin={0} aria-valuemax={META} aria-valuenow={Number(summary.complete)}>
          <div className="h-3 bg-consolidacao rounded" style={{ width: `${pct}%` }} />
        </div>
      </Card>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} tone={s.tone}>
            <p className="text-sm text-apoio">{t(s.label)}</p>
            <p className="text-3xl font-card font-semibold">{s.value}</p>
          </Card>
        ))}
      </div>

      <Card tone="seminario" title={t('Gasto com IA')}>
        <p className="text-sm text-apoio mb-4">
          {t('Tokens usados na leitura de currículo e na análise do perfil. O custo é uma estimativa em dólar pelo preço de tabela do modelo; a fatura oficial fica no console da Anthropic.')}
        </p>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-6">
          <div><p className="text-sm text-apoio">{t('Custo no mês')}</p><p className="text-3xl font-card font-semibold">{usd(sum(monthRows, 'cost_usd'))}</p></div>
          <div><p className="text-sm text-apoio">{t('Tokens no mês')}</p><p className="text-3xl font-card font-semibold">{num(tokens(monthRows))}</p></div>
          <div><p className="text-sm text-apoio">{t('Chamadas no mês')}</p><p className="text-3xl font-card font-semibold">{num(sum(monthRows, 'calls'))}</p></div>
          <div><p className="text-sm text-apoio">{t('Custo desde o início')}</p><p className="text-3xl font-card font-semibold">{usd(sum(usage, 'cost_usd'))}</p></div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-apoio">
              <th className="py-1">{t('Uso')}</th><th className="text-right">{t('Chamadas no mês')}</th><th className="text-right">{t('Tokens no mês')}</th>
              <th className="text-right">{t('Custo no mês')}</th><th className="text-right">{t('Desde o início')}</th>
            </tr>
          </thead>
          <tbody>
            {byFeature.map((f) => (
              <tr key={f.label} className="border-t border-midnight/10">
                <td className="py-1.5">{t(f.label)}</td><td className="text-right">{num(f.calls)}</td><td className="text-right">{num(f.tokens)}</td>
                <td className="text-right">{usd(f.cost)}</td><td className="text-right">{usd(f.totalCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t('Por origem do link')}>
          <p className="text-sm text-apoio mb-3">{t('Vem do {param} no link divulgado. Quem entrou sem etiqueta aparece como "{direto}".', { param: '?origem=', direto: t('direto') })}</p>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-apoio"><th className="py-1">{t('Origem')}</th><th className="text-right">{t('Contas')}</th><th className="text-right">{t('Completos')}</th></tr></thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.source} className="border-t border-midnight/10">
                  <td className="py-1.5">{t(s.source)}</td><td className="text-right">{s.signed_up}</td><td className="text-right">{s.complete}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title={t('Por gestor')} tone="seminario">
          <p className="text-sm text-apoio mb-3">{t('Quantas pessoas apontaram cada gestor. Ajuda a saber em qual time reforçar a divulgação.')}</p>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-apoio"><th className="py-1">{t('Gestor')}</th><th className="text-right">{t('Contas')}</th><th className="text-right">{t('Completos')}</th></tr></thead>
            <tbody>
              {managers.map((m) => (
                <tr key={m.manager_id} className="border-t border-midnight/10">
                  <td className="py-1.5">{m.manager_name || t('Sem nome')}</td><td className="text-right">{m.team_signed_up}</td><td className="text-right">{m.team_complete}</td>
                </tr>
              ))}
              {withoutManager > 0 && (
                <tr className="border-t border-midnight/10 text-apoio">
                  <td className="py-1.5">{t('Sem gestor informado')}</td><td className="text-right">{withoutManager}</td><td className="text-right">–</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  )
}
