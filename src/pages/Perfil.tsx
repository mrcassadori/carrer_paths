import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Tag } from '../components/ui'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { tempoDesde } from '../lib/time'

interface Overview {
  track_name: string | null
  level_name: string | null
  job_title: string | null
  hire_date: string | null
  level_since: string | null
  skills_total: number
  skills_self_rated: number
  has_basics: boolean
  has_extra: boolean
  is_complete: boolean
  assessment_status: string | null
}

interface CategoryAvg { name: string; avg: number; count: number }

const STATUS: Record<string, { label: string; tone: 'preparacao' | 'seminario' | 'consolidacao' | 'pendencias' }> = {
  rascunho: { label: 'Autoavaliação em andamento', tone: 'preparacao' },
  enviada: { label: 'Enviada para validação', tone: 'seminario' },
  em_revisao: { label: 'Em revisão pelo líder', tone: 'seminario' },
  validada: { label: 'Validada', tone: 'consolidacao' },
  contestada: { label: 'Contestada', tone: 'pendencias' },
}

/** Resumo do perfil e checklist do cadastro completo (definição do plano de adoção). */
export default function Perfil() {
  const { profile } = useAuth()
  const [o, setO] = useState<Overview | null>(null)
  const [cats, setCats] = useState<CategoryAvg[]>([])

  useEffect(() => {
    if (!profile) return
    supabase.from('profile_overview').select('*').eq('id', profile.id).single<Overview>().then(({ data }) => setO(data))
    supabase.from('score_gaps').select('category_name, self_score').eq('profile_id', profile.id).then(({ data }) => {
      const acc = new Map<string, { sum: number; count: number }>()
      ;(data ?? []).forEach((r) => {
        if (r.self_score === null) return
        const a = acc.get(r.category_name) ?? { sum: 0, count: 0 }
        acc.set(r.category_name, { sum: a.sum + r.self_score, count: a.count + 1 })
      })
      setCats([...acc].map(([name, a]) => ({ name, avg: a.sum / a.count, count: a.count })))
    })
  }, [profile])

  if (!o) return <p className="text-apoio">Carregando…</p>
  const status = STATUS[o.assessment_status ?? 'rascunho']
  const checklist = [
    { done: o.has_basics, label: 'Sobre você: cargo, descrição, datas, trilha e nível', to: '/cadastro' },
    { done: o.skills_total > 0 && o.skills_self_rated === o.skills_total, label: `Mapa de skills (${o.skills_self_rated} de ${o.skills_total})`, to: '/skills' },
    { done: o.has_extra, label: 'Currículo, projeto, curso ou idioma', to: '/curriculo' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1>{profile?.full_name}</h1>
        <p className="text-apoio">{o.job_title} · {o.track_name} · {o.level_name}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card tone="preparacao" title="Tempo de casa"><p className="text-2xl font-card">{tempoDesde(o.hire_date)}</p></Card>
        <Card tone="preparacao" title="Tempo no cargo"><p className="text-2xl font-card">{tempoDesde(o.level_since)}</p></Card>
        <Card tone={status.tone} title="Avaliação"><Tag tone={status.tone}>{status.label}</Tag></Card>
      </div>

      <Card tone={o.is_complete ? 'consolidacao' : 'pendencias'} title={o.is_complete ? 'Cadastro completo' : 'Falta pouco para completar o cadastro'}>
        <ul className="space-y-2">
          {checklist.map((c) => (
            <li key={c.label} className="flex items-center gap-3">
              <span aria-hidden className={`w-6 h-6 rounded-full flex items-center justify-center text-sm text-white ${c.done ? 'bg-consolidacao' : 'bg-pendencias'}`}>
                {c.done ? '✓' : '!'}
              </span>
              {c.done ? c.label : <Link to={c.to} className="underline">{c.label}</Link>}
            </li>
          ))}
        </ul>
      </Card>

      {cats.length > 0 && (
        <Card tone="seminario" title="Sua autoavaliação por categoria">
          <p className="text-sm text-apoio mb-4">Média das notas que você deu. Ainda não validada pelo líder.</p>
          <ul className="space-y-3">
            {cats.map((c) => (
              <li key={c.name}>
                <div className="flex justify-between text-sm"><span className="font-card font-semibold">{c.name}</span><span>{c.avg.toFixed(1)}</span></div>
                <div className="h-2 bg-midnight/10 rounded"><div className="h-2 bg-seminario rounded" style={{ width: `${(c.avg / 5) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
