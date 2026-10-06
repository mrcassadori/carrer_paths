import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AnaliseIA from '../components/AnaliseIA'
import RadarChart, { averagesByCategory, type RadarSeries } from '../components/RadarChart'
import { Card, Tag } from '../components/ui'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { tempoDesde } from '../lib/time'
import { ASSESSMENT_STATUS } from '../lib/types'

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

interface Gap { category_name: string; kind: string; self_score: number | null; expected_now: number | null; validated_score: number | null }

/** Resumo do perfil, checklist do cadastro completo, gráfico aranha das hard skills e análise por IA. */
export default function Perfil() {
  const { profile } = useAuth()
  const [o, setO] = useState<Overview | null>(null)
  const [gaps, setGaps] = useState<Gap[]>([])
  const [order, setOrder] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!profile) return
    supabase.from('profile_overview').select('*').eq('id', profile.id).single<Overview>().then(({ data }) => setO(data))
    supabase.from('score_gaps').select('category_name, kind, self_score, expected_now, validated_score')
      .eq('profile_id', profile.id).then(({ data }) => setGaps(data ?? []))
    supabase.from('skill_categories').select('name, sort_order')
      .then(({ data }) => setOrder(Object.fromEntries((data ?? []).map((c) => [c.name, c.sort_order]))))
  }, [profile])

  const radar = useMemo(() => {
    const hard = gaps.filter((g) => g.kind === 'hard')
    const axes = [...new Set(hard.map((g) => g.category_name))].sort((a, b) => (order[a] ?? 0) - (order[b] ?? 0))
    const cat = (g: Gap) => g.category_name
    const series: RadarSeries[] = [
      { name: 'Sua nota', color: '#0762C8', values: averagesByCategory(hard, cat, (g) => g.self_score, axes) },
      { name: 'Esperado no seu nível', color: '#666666', dashed: true, values: averagesByCategory(hard, cat, (g) => g.expected_now, axes) },
    ]
    if (hard.some((g) => g.validated_score !== null)) {
      series.push({ name: 'Líder', color: '#FF6720', marker: 'square', values: averagesByCategory(hard, cat, (g) => g.validated_score, axes) })
    }
    return { axes, series, rated: hard.some((g) => g.self_score !== null) }
  }, [gaps, order])

  if (!o) return <p className="text-apoio">Carregando…</p>
  const status = ASSESSMENT_STATUS[o.assessment_status ?? 'rascunho']
  const checklist = [
    { done: o.has_basics, label: 'Sobre você: cargo, descrição, datas, trilha e nível', to: '/cadastro' },
    { done: o.skills_total > 0 && o.skills_self_rated === o.skills_total, label: `Mapa de skills (${o.skills_self_rated} de ${o.skills_total})`, to: '/skills' },
    { done: o.has_extra, label: 'Currículo, experiência, formação, curso, idioma ou projeto', to: '/cadastro#curriculo' },
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

      {radar.rated && radar.axes.length >= 3 ? (
        <Card tone="preparacao" title="Seu mapa de hard skills">
          <p className="text-sm text-apoio mb-3">
            Média das suas notas em cada categoria, comparada com o esperado para o seu nível
            {radar.series.length > 2 ? ' e com a nota do líder da prática' : ''}.
          </p>
          <RadarChart title="Gráfico aranha das hard skills por categoria" axes={radar.axes} series={radar.series} />
        </Card>
      ) : (
        <Card tone="preparacao" title="Seu mapa de hard skills">
          <p className="text-sm">O gráfico aparece aqui quando você der notas no <Link className="underline" to="/skills">Mapa de skills</Link>.</p>
        </Card>
      )}

      {profile && radar.rated && <AnaliseIA profileId={profile.id} canGenerate />}
    </div>
  )
}
