import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, ErrorText, Tag } from '../components/ui'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { WEIGHT_LABEL, type ScaleLevel, type ScoreRow, type Weight } from '../lib/types'

const WEIGHT_ORDER: Record<string, number> = { nucleo: 0, complementar: 1, exposicao: 2 }

/** Passo 2: autoavaliação 0–5 de todas as skills ativas, com meta e nota esperada. */
export default function MapaSkills() {
  const { profile } = useAuth()
  const [assessmentId, setAssessmentId] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('rascunho')
  const [rows, setRows] = useState<ScoreRow[]>([])
  const [weights, setWeights] = useState<Record<string, Weight>>({})
  const [expected, setExpected] = useState<Record<string, number>>({})
  const [scale, setScale] = useState<ScaleLevel[]>([])
  const [chosen, setCategory] = useState<string>('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(0)

  useEffect(() => {
    if (!profile?.track_id || !profile.level_id) return
    ;(async () => {
      const { data: aid, error } = await supabase.rpc('start_my_assessment')
      if (error) { setError(error.message); return }
      setAssessmentId(aid)
      const [a, s, w, e, sc] = await Promise.all([
        supabase.from('assessments').select('status').eq('id', aid).single(),
        supabase.from('assessment_scores')
          .select('skill_id, self_score, target_score, skill:skills(name, description, sort_order, active, category:skill_categories(name, kind, sort_order))')
          .eq('assessment_id', aid),
        supabase.from('skill_track_weights').select('skill_id, weight').eq('track_id', profile.track_id),
        supabase.from('skill_expectations').select('skill_id, expected_level')
          .eq('track_id', profile.track_id).eq('level_id', profile.level_id),
        supabase.from('scale_levels').select('*').order('score'),
      ])
      setStatus(a.data?.status ?? 'rascunho')
      const loaded = ((s.data ?? []) as unknown as ScoreRow[]).filter((r) => r.skill.active)
      setRows(loaded)
      setWeights(Object.fromEntries((w.data ?? []).map((x) => [x.skill_id, x.weight])))
      setExpected(Object.fromEntries((e.data ?? []).map((x) => [x.skill_id, x.expected_level])))
      setScale(sc.data ?? [])
    })()
  }, [profile?.track_id, profile?.level_id])

  const categories = useMemo(() => {
    const byName = new Map<string, { name: string; order: number; kind: string }>()
    rows.forEach((r) => byName.set(r.skill.category.name, {
      name: r.skill.category.name, order: r.skill.category.sort_order, kind: r.skill.category.kind,
    }))
    return [...byName.values()].sort((a, b) => a.order - b.order)
  }, [rows])

  const category = chosen || categories[0]?.name || ''
  const editable = status === 'rascunho'
  const rated = rows.filter((r) => r.self_score !== null).length
  const visible = rows
    .filter((r) => r.skill.category.name === category)
    .sort((a, b) => (WEIGHT_ORDER[weights[a.skill_id]] ?? 3) - (WEIGHT_ORDER[weights[b.skill_id]] ?? 3)
      || a.skill.sort_order - b.skill.sort_order)

  async function save(skillId: string, patch: Partial<Pick<ScoreRow, 'self_score' | 'target_score'>>) {
    if (!assessmentId) return
    setRows((rs) => rs.map((r) => (r.skill_id === skillId ? { ...r, ...patch } : r)))
    setSaving((n) => n + 1)
    const { error } = await supabase.from('assessment_scores').update(patch)
      .eq('assessment_id', assessmentId).eq('skill_id', skillId)
    setSaving((n) => n - 1)
    if (error) setError(error.message)
  }

  if (!profile?.track_id || !profile.level_id) {
    return <p>Complete <Link className="underline" to="/cadastro">Sobre você</Link> antes do mapa de skills.</p>
  }

  const catIndex = categories.findIndex((c) => c.name === category)
  const labelOf = (n: number | null) => scale.find((s) => s.score === n)?.label

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
      <div>
        <p className="font-card text-sm text-apoio">Passo 2 de 3</p>
        <h1 className="mb-1">Mapa de skills</h1>
        <p className="text-apoio mb-4">
          {rated} de {rows.length} skills com nota · {saving > 0 ? 'salvando…' : 'salvo automaticamente'}
        </p>
        <div className="h-2 bg-midnight/10 rounded mb-6" aria-hidden>
          <div className="h-2 bg-preparacao rounded" style={{ width: `${rows.length ? (rated / rows.length) * 100 : 0}%` }} />
        </div>
        {!editable && <ErrorText>Sua avaliação foi enviada para validação e não pode mais ser editada.</ErrorText>}
        <ErrorText>{error}</ErrorText>

        <nav className="flex flex-wrap gap-2 mb-6" aria-label="Categorias">
          {categories.map((c) => {
            const inCat = rows.filter((r) => r.skill.category.name === c.name)
            const done = inCat.every((r) => r.self_score !== null)
            return (
              <button key={c.name} onClick={() => setCategory(c.name)}
                className={`px-3 py-1.5 rounded-md text-sm font-card font-semibold border ${
                  c.name === category ? 'bg-midnight text-white border-midnight'
                    : done ? 'border-consolidacao text-consolidacao' : 'border-midnight/20'}`}>
                {c.name} {done && '✓'}
              </button>
            )
          })}
        </nav>

        <div className="space-y-4">
          {visible.map((r) => {
            const w = weights[r.skill_id]
            const exp = expected[r.skill_id]
            return (
              <Card key={r.skill_id} tone={r.self_score === null ? 'pendencias' : 'preparacao'}>
                <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
                  <h3>{r.skill.name}</h3>
                  <div className="flex gap-2">
                    {w && <Tag tone={w === 'nucleo' ? 'seminario' : 'neutro'}>{WEIGHT_LABEL[w]}</Tag>}
                    {exp !== undefined && <Tag tone="neutro">Esperado no seu nível: {exp}</Tag>}
                  </div>
                </div>
                <p className="text-apoio text-sm mb-4">{r.skill.description}</p>
                <div className="flex flex-wrap items-end gap-6">
                  <fieldset disabled={!editable}>
                    <legend className="font-card font-semibold text-sm mb-1">Hoje</legend>
                    <div className="flex gap-1" role="radiogroup">
                      {[0, 1, 2, 3, 4, 5].map((n) => (
                        <button key={n} type="button" role="radio" aria-checked={r.self_score === n}
                          title={labelOf(n)} onClick={() => save(r.skill_id, { self_score: n })}
                          className={`w-10 h-10 rounded-md font-card font-semibold border ${
                            r.self_score === n ? 'bg-preparacao text-white border-preparacao' : 'border-midnight/25 hover:bg-preparacao/10'}`}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <label className="text-sm">
                    <span className="block font-card font-semibold mb-1">Meta</span>
                    <select disabled={!editable} value={r.target_score ?? ''}
                      onChange={(e) => save(r.skill_id, { target_score: e.target.value === '' ? null : Number(e.target.value) })}
                      className="rounded-md border border-midnight/25 px-2 py-2 bg-white">
                      <option value="">—</option>
                      {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} · {labelOf(n)}</option>)}
                    </select>
                  </label>
                  {r.self_score !== null && <span className="text-sm text-apoio pb-2">{labelOf(r.self_score)}</span>}
                </div>
              </Card>
            )
          })}
        </div>

        <div className="flex gap-3 mt-6">
          {catIndex > 0 && <Button variant="secondary" onClick={() => setCategory(categories[catIndex - 1].name)}>Anterior</Button>}
          {catIndex < categories.length - 1
            ? <Button onClick={() => { setCategory(categories[catIndex + 1].name); window.scrollTo(0, 0) }}>Próxima categoria</Button>
            : <Link to="/curriculo"><Button>Ir para Meu currículo</Button></Link>}
        </div>
      </div>

      <aside className="lg:sticky lg:top-6 self-start">
        <Card tone="seminario" title="Escala">
          <ol className="space-y-3">
            {scale.map((s) => (
              <li key={s.score}>
                <p className="font-card font-semibold">{s.score} · {s.label}</p>
                <p className="text-sm text-apoio">{s.description}</p>
              </li>
            ))}
          </ol>
          <p className="text-sm text-apoio mt-4">Isto é para o seu PDI, não é avaliação de desempenho. Seja sincero: a nota validada vem depois, em conversa com o líder da prática.</p>
        </Card>
      </aside>
    </div>
  )
}
