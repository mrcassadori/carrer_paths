import { useEffect, useState } from 'react'
import { Card, ErrorText } from '../components/ui'
import { supabase } from '../lib/supabase'

const META = 30
const TIME = 50

interface Summary { signed_up: number; started: number; complete: number; submitted: number; validated: number }
interface BySource { source: string; signed_up: number; complete: number }
interface ByManager { manager_id: string; manager_name: string; team_signed_up: number; team_complete: number }

/** Painel de adoção: só números agregados, nunca a lista de quem se cadastrou. */
export default function Adocao() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [sources, setSources] = useState<BySource[]>([])
  const [managers, setManagers] = useState<ByManager[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    ;(async () => {
      const [s, o, m] = await Promise.all([
        supabase.rpc('adoption_summary').single<Summary>(),
        supabase.rpc('adoption_by_source'),
        supabase.rpc('adoption_by_manager'),
      ])
      if (s.error) { setError(s.error.message); return }
      setSummary(s.data)
      setSources(o.data ?? [])
      setManagers(m.data ?? [])
    })()
  }, [])

  if (error) return <ErrorText>{error}</ErrorText>
  if (!summary) return <p className="text-apoio">Carregando…</p>

  const withManager = managers.reduce((n, m) => n + Number(m.team_signed_up), 0)
  const withoutManager = Number(summary.signed_up) - withManager
  const pct = Math.min(100, (Number(summary.complete) / META) * 100)

  const stats = [
    { label: 'Contas criadas', value: summary.signed_up, tone: 'preparacao' as const },
    { label: 'Começaram o cadastro', value: summary.started, tone: 'preparacao' as const },
    { label: 'Cadastros completos', value: summary.complete, tone: 'consolidacao' as const },
    { label: 'Mapas enviados ao líder', value: summary.submitted, tone: 'seminario' as const },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2">Adoção</h1>
        <p className="text-apoio">Números agregados do time. Ninguém aparece por nome aqui.</p>
      </div>

      <Card tone="consolidacao" title={`Meta: ${META} cadastros completos de ${TIME} pessoas`}>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-4xl font-titulo font-extrabold">{summary.complete}</span>
          <span className="text-apoio">de {META}</span>
        </div>
        <div className="h-3 bg-midnight/10 rounded" role="progressbar" aria-valuemin={0} aria-valuemax={META} aria-valuenow={Number(summary.complete)}>
          <div className="h-3 bg-consolidacao rounded" style={{ width: `${pct}%` }} />
        </div>
      </Card>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} tone={s.tone}>
            <p className="text-sm text-apoio">{s.label}</p>
            <p className="text-3xl font-card font-semibold">{s.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Por origem do link">
          <p className="text-sm text-apoio mb-3">Vem do <code>?origem=</code> no link divulgado. Quem entrou sem etiqueta aparece como "direto".</p>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-apoio"><th className="py-1">Origem</th><th className="text-right">Contas</th><th className="text-right">Completos</th></tr></thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.source} className="border-t border-midnight/10">
                  <td className="py-1.5">{s.source}</td><td className="text-right">{s.signed_up}</td><td className="text-right">{s.complete}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Por gestor" tone="seminario">
          <p className="text-sm text-apoio mb-3">Quantas pessoas apontaram cada gestor. Ajuda a saber em qual time reforçar a divulgação.</p>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-apoio"><th className="py-1">Gestor</th><th className="text-right">Contas</th><th className="text-right">Completos</th></tr></thead>
            <tbody>
              {managers.map((m) => (
                <tr key={m.manager_id} className="border-t border-midnight/10">
                  <td className="py-1.5">{m.manager_name || 'Sem nome'}</td><td className="text-right">{m.team_signed_up}</td><td className="text-right">{m.team_complete}</td>
                </tr>
              ))}
              {withoutManager > 0 && (
                <tr className="border-t border-midnight/10 text-apoio">
                  <td className="py-1.5">Sem gestor informado</td><td className="text-right">{withoutManager}</td><td className="text-right">–</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  )
}
