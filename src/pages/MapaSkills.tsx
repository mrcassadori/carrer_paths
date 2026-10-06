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
  const [notes, setNotes] = useState<{ return_note: string | null; leader_note: string | null }>({ return_note: null, leader_note: null })
  const [submitting, setSubmitting] = useState(false)
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
        supabase.from('assessments').select('status, return_note, leader_note').eq('id', aid).single(),
        supabase.from('assessment_scores')
          .select('skill_id, self_score, target_score, leader_score, justification, skill:skills(name, description, sort_order, active, category:skill_categories(name, kind, sort_order))')
          .eq('assessment_id', aid),
        supabase.from('skill_track_weights').select('skill_id, weight').eq('track_id', profile.track_id),
        supabase.from('skill_expectations').select('skill_id, expected_level')
          .eq('track_id', profile.track_id).eq('level_id', profile.level_id),
        supabase.from('scale_levels').select('*').order('score'),
      ])
      setStatus(a.data?.status ?? 'rascunho')
      setNotes({ return_note: a.data?.return_note ?? null, leader_note: a.data?.leader_note ?? null })
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

  async function submit() {
    if (!assessmentId || !window.confirm('Enviar para o líder da prática? Depois de enviar, suas notas não podem mais ser alteradas.')) return
    setSubmitting(true)
    setError('')
    const { error } = await supabase.rpc('submit_assessment', { a: assessmentId })
    setSubmitting(false)
    if (error) { setError(error.message); return }
    setStatus('enviada')
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
        {editable && notes.return_note && (
          <ErrorText>O líder devolveu sua avaliação: "{notes.return_note}". Ajuste e envie de novo.</ErrorText>
        )}
        {(status === 'enviada' || status === 'em_revisao') && (
          <p role="status" className="text-sm bg-seminario/10 border-l-4 border-seminario px-3 py-2 rounded mb-4">
            Sua autoavaliação está com o líder da prática. Suas notas não mudam mais; a nota do líder vai aparecer ao lado de cada uma.
          </p>
        )}
        {status === 'validada' && (
          <Card tone="consolidacao" title="Avaliação do líder" className="mb-6">
            <p className="text-sm mb-2">Sua nota continua a mesma. A nota do líder aparece ao lado em cada skill, com a justificativa quando for diferente.</p>
            {notes.leader_note && <p className="text-sm whitespace-pre-line">{notes.leader_note}</p>}
          </Card>
        )}
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
                  {status === 'validada' && r.leader_score != null && (
                    <span className="pb-2"><Tag tone={r.leader_score === r.self_score ? 'consolidacao' : 'seminario'}>Líder: {r.leader_score}</Tag></span>
                  )}
                </div>
                {status === 'validada' && r.justification && (
                  <p className="text-sm mt-3"><span className="font-card font-semibold">Justificativa do líder:</span> {r.justification}</p>
                )}
              </Card>
            )
          })}
        </div>

        <div className="flex gap-3 mt-6">
          {catIndex > 0 && <Button variant="secondary" onClick={() => setCategory(categories[catIndex - 1].name)}>Anterior</Button>}
          {catIndex < categories.length - 1
            ? <Button onClick={() => { setCategory(categories[catIndex + 1].name); window.scrollTo(0, 0) }}>Próxima categoria</Button>
            : <Link to="/cadastro#curriculo"><Button variant={editable && rated === rows.length ? 'secondary' : 'primary'}>Ir para o currículo</Button></Link>}
          {editable && rated === rows.length && rows.length > 0 && (
            <Button onClick={submit} disabled={submitting}>{submitting ? 'Enviando…' : 'Enviar para o líder'}</Button>
          )}
        </div>
        {editable && rated < rows.length && (
          <p className="text-sm text-apoio mt-3">Quando todas as skills tiverem nota, aparece o botão para enviar ao líder da prática.</p>
        )}
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
