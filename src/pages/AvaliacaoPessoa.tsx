import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button, Card, ErrorText, Tag, Textarea } from '../components/ui'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { tempoDesde } from '../lib/time'
import { ASSESSMENT_STATUS, COURSE_KINDS, LANGUAGE_LEVELS } from '../lib/types'

interface Person {
  id: string; full_name: string; email: string; job_title: string | null
  track_id: string | null; track_name: string | null; level_id: string | null; level_name: string | null
  hire_date: string | null; level_since: string | null; assessment_id: string | null
}
interface Assessment { id: string; status: string; leader_note: string | null; one_on_one_done: boolean; return_note: string | null }
interface Score {
  assessment_id: string; skill_id: string; self_score: number | null; target_score: number | null
  leader_score: number | null; justification: string | null
  skill: { name: string; description: string | null; sort_order: number; active: boolean; category: { name: string; sort_order: number } }
}
interface Career { id: string; company: string; job_title: string | null; started_on: string | null; ended_on: string | null; description: string | null }
interface Course { id: string; kind: string; name: string; institution: string | null; completed_on: string | null; workload_hours: number | null; credential_url: string | null }
interface Project {
  id: string; title: string; client: string | null; role_in_project: string | null; summary: string | null
  started_on: string | null; ended_on: string | null; link_url: string | null; is_case: boolean; project_skills: { skill_id: string }[]
}
interface ResumeFile { storage_path: string; file_name: string; created_at: string }

const fmtMonth = (d: string | null) =>
  d ? new Date(d + 'T00:00').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }) : null
const periodo = (start: string | null, end: string | null) =>
  !start && !end ? null : `${fmtMonth(start) ?? '?'} – ${fmtMonth(end) ?? 'atual'}`
const kindLabel = (v: string) => COURSE_KINDS.find(([k]) => k === v)?.[1] ?? v
const levelLabel = (v: string) => LANGUAGE_LEVELS.find(([k]) => k === v)?.[1] ?? v

/** Uma linha da comparação: nota da pessoa (só leitura) e nota do líder com justificativa. */
function ScoreRow({ row, expected, editable, onSaved }: {
  row: Score; expected: number | undefined; editable: boolean; onSaved: (r: Score) => void
}) {
  const [score, setScore] = useState<number | null>(row.leader_score)
  const [justification, setJustification] = useState(row.justification ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const differs = score !== null && score !== row.self_score
  const dirty = score !== row.leader_score || justification !== (row.justification ?? '')

  async function save() {
    if (score === null) return
    if (differs && !justification.trim()) { setError('Sua nota é diferente da nota da pessoa: escreva a justificativa.'); return }
    setSaving(true)
    setError('')
    const patch = { leader_score: score, justification: justification.trim() || null }
    const { error } = await supabase.from('assessment_scores').update(patch)
      .eq('assessment_id', row.assessment_id).eq('skill_id', row.skill_id)
    setSaving(false)
    if (error) { setError(error.message); return }
    onSaved({ ...row, ...patch })
  }

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-card font-semibold">{row.skill.name}</p>
          {row.skill.description && <p className="text-sm text-apoio">{row.skill.description}</p>}
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Tag tone="preparacao">Pessoa: {row.self_score ?? '–'}</Tag>
          {row.target_score !== null && <Tag tone="neutro">Meta: {row.target_score}</Tag>}
          {expected !== undefined && <Tag tone="neutro">Esperado no nível: {expected}</Tag>}
          {row.leader_score !== null && (
            <Tag tone={row.leader_score === row.self_score ? 'consolidacao' : 'seminario'}>Líder: {row.leader_score}</Tag>
          )}
        </div>
      </div>
      {editable ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-card font-semibold mr-1">Sua nota</span>
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" aria-pressed={score === n} onClick={() => setScore(n)}
                className={`w-9 h-9 rounded-md font-card font-semibold border ${
                  score === n ? 'bg-seminario text-white border-seminario' : 'border-midnight/25 hover:bg-seminario/10'}`}>
                {n}
              </button>
            ))}
          </div>
          {(differs || justification) && (
            <Textarea value={justification} onChange={(e) => setJustification(e.target.value)} rows={2}
              placeholder={differs ? 'Por que sua nota é diferente? (obrigatório)' : 'Comentário (opcional)'} />
          )}
          {dirty && score !== null && (
            <Button type="button" onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar nota'}</Button>
          )}
          <ErrorText>{error}</ErrorText>
        </div>
      ) : (
        row.justification && <p className="text-sm mt-2"><span className="font-card font-semibold">Justificativa do líder:</span> {row.justification}</p>
      )}
    </li>
  )
}

/** Tela do líder: currículo, projetos e mapa de skills da pessoa, com a nota do líder ao lado da autoavaliação. */
export default function AvaliacaoPessoa() {
  const { id } = useParams()
  const { profile } = useAuth()
  const [person, setPerson] = useState<Person | null>(null)
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [scores, setScores] = useState<Score[]>([])
  const [expected, setExpected] = useState<Record<string, number>>({})
  const [career, setCareer] = useState<Career[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [languages, setLanguages] = useState<{ language: string; level: string }[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [file, setFile] = useState<ResumeFile | null>(null)
  const [note, setNote] = useState('')
  const [onlyDiff, setOnlyDiff] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    const { data: p } = await supabase.from('profile_overview')
      .select('id, full_name, email, job_title, track_id, track_name, level_id, level_name, hire_date, level_since, assessment_id')
      .eq('id', id).maybeSingle<Person>()
    setPerson(p)
    setLoaded(true)
    if (!p) return
    const [ca, co, la, pr, f] = await Promise.all([
      supabase.from('career_entries').select('*').eq('profile_id', id)
        .order('ended_on', { ascending: false, nullsFirst: true }).order('started_on', { ascending: false }),
      supabase.from('courses').select('*').eq('profile_id', id).order('completed_on', { ascending: false, nullsFirst: true }),
      supabase.from('profile_languages').select('language, level').eq('profile_id', id).order('language'),
      supabase.from('projects').select('*, project_skills(skill_id)').eq('profile_id', id)
        .order('started_on', { ascending: false, nullsFirst: true }),
      supabase.from('resume_imports').select('storage_path, file_name, created_at')
        .eq('profile_id', id).eq('status', 'aplicado').order('created_at', { ascending: false }).limit(1),
    ])
    setCareer(ca.data ?? [])
    setCourses(co.data ?? [])
    setLanguages(la.data ?? [])
    setProjects(pr.data ?? [])
    setFile(f.data?.[0] ?? null)
    if (p.track_id && p.level_id) {
      const { data } = await supabase.from('skill_expectations').select('skill_id, expected_level')
        .eq('track_id', p.track_id).eq('level_id', p.level_id)
      setExpected(Object.fromEntries((data ?? []).map((x) => [x.skill_id, x.expected_level])))
    }
    if (p.assessment_id) {
      const [a, s] = await Promise.all([
        supabase.from('assessments').select('id, status, leader_note, one_on_one_done, return_note').eq('id', p.assessment_id).single<Assessment>(),
        supabase.from('assessment_scores')
          .select('assessment_id, skill_id, self_score, target_score, leader_score, justification, skill:skills(name, description, sort_order, active, category:skill_categories(name, sort_order))')
          .eq('assessment_id', p.assessment_id),
      ])
      setAssessment(a.data)
      setNote(a.data?.leader_note ?? '')
      setScores(((s.data ?? []) as unknown as Score[]).filter((r) => r.skill.active))
    }
  }, [id])
  useEffect(() => { void load() }, [load])

  const skillName = useMemo(() => Object.fromEntries(scores.map((s) => [s.skill_id, s.skill.name])), [scores])
  const groups = useMemo(() => {
    const byCat = new Map<string, { order: number; rows: Score[] }>()
    scores
      .filter((r) => !onlyDiff || (r.leader_score !== null && r.leader_score !== r.self_score))
      .forEach((r) => {
        const g = byCat.get(r.skill.category.name) ?? { order: r.skill.category.sort_order, rows: [] }
        g.rows.push(r)
        byCat.set(r.skill.category.name, g)
      })
    return [...byCat.entries()].sort((a, b) => a[1].order - b[1].order)
      .map(([name, g]) => ({ name, rows: g.rows.sort((a, b) => a.skill.sort_order - b.skill.sort_order) }))
  }, [scores, onlyDiff])

  if (!loaded) return <p className="text-apoio">Carregando…</p>
  if (!person) return <p className="text-apoio">Pessoa não encontrada ou fora da sua prática. <Link className="underline" to="/avaliacoes">Voltar</Link></p>

  const isReviewer = profile ? ['lider_pratica', 'admin'].includes(profile.app_role) && profile.id !== person.id : false
  const status = assessment?.status ?? 'rascunho'
  const editable = isReviewer && status === 'em_revisao'
  const st = ASSESSMENT_STATUS[status]
  const pending = scores.filter((r) => r.leader_score === null).length
  const different = scores.filter((r) => r.leader_score !== null && r.leader_score !== r.self_score).length
  const needs1on1 = scores.some((r) => r.leader_score !== null && r.self_score !== null
    && (Math.abs(r.leader_score - r.self_score) >= 2 || r.leader_score === 5))

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setError('')
    setNotice('')
    const { error } = await fn()
    if (error) { setError(error.message); return }
    setNotice(ok)
    await load()
  }

  async function download() {
    if (!file) return
    const { data } = await supabase.storage.from('resumes').createSignedUrl(file.storage_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener')
  }

  function returnToPerson() {
    const why = window.prompt('O que a pessoa precisa revisar? Ela verá esta mensagem no mapa de skills.')
    if (!why?.trim() || !assessment) return
    void run(() => supabase.rpc('return_assessment', { a: assessment.id, note: why.trim() }), 'Avaliação devolvida para a pessoa.')
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/avaliacoes" className="text-sm underline text-apoio">← Avaliações</Link>
        <h1 className="mt-2">{person.full_name || person.email}</h1>
        <p className="text-apoio">
          {[person.job_title, person.track_name, person.level_name].filter(Boolean).join(' · ')}
          {' · '}{tempoDesde(person.hire_date)} de casa · {tempoDesde(person.level_since)} no cargo
        </p>
        <div className="mt-2"><Tag tone={st.tone}>{st.label}</Tag></div>
      </div>

      {notice && <p role="status" className="text-sm bg-consolidacao/10 border-l-4 border-consolidacao px-3 py-2 rounded">{notice}</p>}
      <ErrorText>{error}</ErrorText>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px] items-start">
        <div className="space-y-6">
          {isReviewer && status === 'enviada' && assessment && (
            <Card tone="seminario" title="Pronta para sua avaliação">
              <p className="text-sm mb-4">A pessoa terminou a autoavaliação. Ao começar, ela não consegue mais mudar as notas.</p>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => run(() => supabase.rpc('start_review', { a: assessment.id }), 'Avaliação iniciada.')}>Começar avaliação</Button>
                <Button variant="secondary" onClick={returnToPerson}>Devolver para a pessoa</Button>
              </div>
            </Card>
          )}
          {status === 'rascunho' && (
            <Card tone="pendencias" title="Autoavaliação ainda não enviada">
              <p className="text-sm">
                Você já pode ver as notas que a pessoa deu, mas só avalia depois que ela enviar.
                {assessment?.return_note && <> Última devolução: "{assessment.return_note}"</>}
              </p>
            </Card>
          )}

          <Card title="Mapa de skills: pessoa × líder" tone="preparacao">
            {scores.length === 0 ? (
              <p className="text-sm text-apoio">A pessoa ainda não começou o mapa de skills.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-4 text-sm mb-2">
                  <span>{scores.length - pending} de {scores.length} com sua nota · {different} diferentes da pessoa</span>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />
                    Mostrar só as diferentes
                  </label>
                </div>
                {groups.map((g) => (
                  <div key={g.name} className="mt-4">
                    <p className="text-xs font-card font-semibold text-apoio uppercase">{g.name}</p>
                    <ul className="divide-y divide-midnight/10">
                      {g.rows.map((r) => (
                        <ScoreRow key={`${r.skill_id}-${r.leader_score}-${r.justification}`} row={r} expected={expected[r.skill_id]} editable={editable}
                          onSaved={(nr) => setScores((rs) => rs.map((x) => (x.skill_id === nr.skill_id ? { ...x, ...nr } : x)))} />
                      ))}
                    </ul>
                  </div>
                ))}
              </>
            )}
          </Card>

          {(editable || assessment?.leader_note) && assessment && (
            <Card title="Descrição do líder" tone="seminario">
              {editable ? (
                <div className="space-y-3">
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={5}
                    placeholder="Visão geral: pontos fortes, onde evoluir, combinados para o PDI." />
                  <Button type="button" variant="secondary"
                    onClick={() => run(() => supabase.rpc('save_leader_note', { a: assessment.id, note }), 'Descrição salva.')}>
                    Salvar descrição
                  </Button>
                </div>
              ) : (
                <p className="text-sm whitespace-pre-line">{assessment.leader_note}</p>
              )}
            </Card>
          )}

          {editable && assessment && (
            <Card title="Concluir" tone="consolidacao">
              {pending > 0 && (
                <div className="mb-4">
                  <p className="text-sm mb-2">Faltam {pending} skills sem sua nota.</p>
                  <Button variant="secondary"
                    onClick={() => run(() => supabase.rpc('accept_remaining_scores', { a: assessment.id }),
                      'Nas skills que faltavam, sua nota ficou igual à da pessoa.')}>
                    Concordar com a pessoa nas {pending} que faltam
                  </Button>
                </div>
              )}
              {needs1on1 && (
                <label className="flex items-center gap-2 text-sm mb-4">
                  <input type="checkbox" checked={assessment.one_on_one_done} disabled={assessment.one_on_one_done}
                    onChange={() => run(() => supabase.rpc('mark_one_on_one', { a: assessment.id }), 'Conversa 1:1 registrada.')} />
                  Conversa 1:1 feita (obrigatória quando há diferença de 2 pontos ou mais, ou nota 5)
                </label>
              )}
              <div className="flex flex-wrap gap-3">
                <Button disabled={pending > 0 || (needs1on1 && !assessment.one_on_one_done)}
                  onClick={() => run(async () => {
                    if (note !== (assessment.leader_note ?? '')) {
                      const r = await supabase.rpc('save_leader_note', { a: assessment.id, note })
                      if (r.error) return r
                    }
                    return supabase.rpc('validate_assessment', { a: assessment.id })
                  }, 'Avaliação concluída. A pessoa já vê sua nota ao lado da dela.')}>
                  Concluir avaliação
                </Button>
                <Button variant="secondary" onClick={returnToPerson}>Devolver para a pessoa</Button>
              </div>
            </Card>
          )}
        </div>

        <aside className="space-y-6">
          <Card title="Currículo" tone="preparacao">
            {file ? (
              <p className="text-sm mb-3">
                <button className="underline text-preparacao" onClick={download}>Baixar {file.file_name}</button>
                <span className="text-apoio"> · enviado em {new Date(file.created_at).toLocaleDateString('pt-BR')}</span>
              </p>
            ) : <p className="text-sm text-apoio mb-3">Nenhum arquivo enviado.</p>}

            <p className="text-xs font-card font-semibold text-apoio uppercase mt-4 mb-1">Experiência</p>
            {career.length === 0 ? <p className="text-sm text-apoio">–</p> : (
              <ul className="space-y-2">
                {career.map((c) => (
                  <li key={c.id} className="text-sm">
                    <p className="font-card font-semibold">{c.company}</p>
                    <p className="text-apoio">{[c.job_title, periodo(c.started_on, c.ended_on)].filter(Boolean).join(' · ')}</p>
                    {c.description && <p>{c.description}</p>}
                  </li>
                ))}
              </ul>
            )}

            <p className="text-xs font-card font-semibold text-apoio uppercase mt-4 mb-1">Formação, cursos e certificações</p>
            {courses.length === 0 ? <p className="text-sm text-apoio">–</p> : (
              <ul className="space-y-2">
                {courses.map((c) => (
                  <li key={c.id} className="text-sm">
                    <p className="font-card font-semibold">{c.name} <Tag tone="neutro">{kindLabel(c.kind)}</Tag></p>
                    <p className="text-apoio">{[c.institution, fmtMonth(c.completed_on), c.workload_hours && `${c.workload_hours} h`].filter(Boolean).join(' · ')}</p>
                    {c.credential_url && <a className="underline text-preparacao" href={c.credential_url} target="_blank" rel="noreferrer">Ver comprovante ↗</a>}
                  </li>
                ))}
              </ul>
            )}

            <p className="text-xs font-card font-semibold text-apoio uppercase mt-4 mb-1">Idiomas</p>
            <p className="text-sm">{languages.length ? languages.map((l) => `${l.language} (${levelLabel(l.level).toLowerCase()})`).join(', ') : '–'}</p>
          </Card>

          <Card title={`Projetos (${projects.length})`} tone="seminario">
            {projects.length === 0 ? <p className="text-sm text-apoio">Nenhum projeto cadastrado.</p> : (
              <ul className="space-y-4">
                {projects.map((p) => (
                  <li key={p.id} className="text-sm">
                    <p className="font-card font-semibold">{p.title} {p.is_case && <Tag tone="consolidacao">Case</Tag>}</p>
                    <p className="text-apoio">{[p.client, p.role_in_project, periodo(p.started_on, p.ended_on)].filter(Boolean).join(' · ')}</p>
                    {p.summary && <p className="mt-1">{p.summary}</p>}
                    {p.project_skills.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {p.project_skills.map((s) => <Tag key={s.skill_id} tone="neutro">{skillName[s.skill_id] ?? '…'}</Tag>)}
                      </div>
                    )}
                    {p.link_url && <a className="underline text-preparacao" href={p.link_url} target="_blank" rel="noreferrer">Abrir link do projeto ↗</a>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </div>
  )
}
