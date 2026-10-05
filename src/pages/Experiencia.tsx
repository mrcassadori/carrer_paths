import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Button, Card, ErrorText, Field, Input, Select, Tag, Textarea } from '../components/ui'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { COURSE_KINDS } from '../lib/types'

interface Project {
  id: string
  title: string
  client: string | null
  role_in_project: string | null
  summary: string | null
  started_on: string | null
  ended_on: string | null
  link_url: string | null
  is_case: boolean
  project_skills: { skill_id: string }[]
}
interface Course {
  id: string
  kind: string
  name: string
  institution: string | null
  completed_on: string | null
  workload_hours: number | null
  credential_url: string | null
}
interface SkillOption { id: string; name: string; category: { name: string; sort_order: number }; sort_order: number }

const emptyProject = { title: '', client: '', role_in_project: '', summary: '', started_on: '', ended_on: '', link_url: '', is_case: false }
const emptyCourse = { kind: 'curso', name: '', institution: '', completed_on: '', workload_hours: '', credential_url: '' }

const blankToNull = <T extends Record<string, unknown>>(o: T) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === '' ? null : v]))

function periodo(start: string | null, end: string | null) {
  const fmt = (d: string) => new Date(d + 'T00:00').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
  if (!start && !end) return ''
  return `${start ? fmt(start) : '?'} – ${end ? fmt(end) : 'atual'}`
}

/** Projetos/cases e cursos/certificações: as evidências que sustentam as notas do mapa de skills. */
export default function Experiencia() {
  const { profile } = useAuth()
  const profileId = profile?.id
  const [projects, setProjects] = useState<Project[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [skills, setSkills] = useState<SkillOption[]>([])
  const [project, setProject] = useState(emptyProject)
  const [projectSkills, setProjectSkills] = useState<string[]>([])
  const [course, setCourse] = useState(emptyCourse)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!profileId) return
    const [p, c] = await Promise.all([
      supabase.from('projects').select('*, project_skills(skill_id)').eq('profile_id', profileId)
        .order('started_on', { ascending: false, nullsFirst: true }),
      supabase.from('courses').select('*').eq('profile_id', profileId)
        .order('completed_on', { ascending: false, nullsFirst: true }),
    ])
    setProjects(p.data ?? [])
    setCourses(c.data ?? [])
  }, [profileId])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    supabase.from('skills').select('id, name, sort_order, category:skill_categories(name, sort_order)').eq('active', true)
      .then(({ data }) => setSkills((data ?? []) as unknown as SkillOption[]))
  }, [])

  const skillName = useMemo(() => Object.fromEntries(skills.map((s) => [s.id, s.name])), [skills])
  const skillGroups = useMemo(() => {
    const groups = new Map<string, { order: number; items: SkillOption[] }>()
    for (const s of skills) {
      const g = groups.get(s.category.name) ?? { order: s.category.sort_order, items: [] }
      g.items.push(s)
      groups.set(s.category.name, g)
    }
    return [...groups.entries()]
      .sort((a, b) => a[1].order - b[1].order)
      .map(([name, g]) => ({ name, items: g.items.sort((a, b) => a.sort_order - b.sort_order) }))
  }, [skills])

  const setP = (k: keyof typeof emptyProject) => (e: { target: { value: string } }) =>
    setProject((f) => ({ ...f, [k]: e.target.value }))
  const setC = (k: keyof typeof emptyCourse) => (e: { target: { value: string } }) =>
    setCourse((f) => ({ ...f, [k]: e.target.value }))
  const toggleSkill = (id: string) =>
    setProjectSkills((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  async function addProject(e: FormEvent) {
    e.preventDefault()
    if (!profileId) return
    setBusy(true)
    setError('')
    const { data, error } = await supabase.from('projects')
      .insert({ ...blankToNull(project), is_case: project.is_case, profile_id: profileId })
      .select('id').single()
    if (!error && data && projectSkills.length > 0) {
      const res = await supabase.from('project_skills')
        .insert(projectSkills.map((skill_id) => ({ project_id: data.id, skill_id })))
      if (res.error) setError(res.error.message)
    }
    setBusy(false)
    if (error) { setError(error.message); return }
    setProject(emptyProject)
    setProjectSkills([])
    load()
  }

  async function addCourse(e: FormEvent) {
    e.preventDefault()
    if (!profileId) return
    setBusy(true)
    setError('')
    const { error } = await supabase.from('courses').insert({
      ...blankToNull(course),
      workload_hours: course.workload_hours ? Number(course.workload_hours) : null,
      profile_id: profileId,
    })
    setBusy(false)
    if (error) { setError(error.message); return }
    setCourse(emptyCourse)
    load()
  }

  async function remove(table: 'projects' | 'courses', id: string, label: string) {
    if (!window.confirm(`Remover "${label}"?`)) return
    await supabase.from(table).delete().eq('id', id)
    load()
  }

  const kindLabel = (v: string) => COURSE_KINDS.find(([k]) => k === v)?.[1] ?? v

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="mb-2">Projetos e cursos</h1>
        <p className="text-apoio">
          São as evidências do seu mapa de skills. Notas a partir de 3 vão precisar de um projeto ou curso que as sustente
          quando o líder da prática validar.
        </p>
      </div>

      <Card title="Projetos e cases">
        {projects.length > 0 && (
          <ul className="divide-y divide-midnight/10 mb-6">
            {projects.map((p) => (
              <li key={p.id} className="py-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-card font-semibold">
                      {p.title} {p.is_case && <Tag tone="consolidacao">Case</Tag>}
                    </p>
                    <p className="text-sm text-apoio">
                      {[p.client, p.role_in_project, periodo(p.started_on, p.ended_on)].filter(Boolean).join(' · ')}
                    </p>
                    {p.summary && <p className="text-sm mt-1">{p.summary}</p>}
                    {p.project_skills.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {p.project_skills.map((s) => <Tag key={s.skill_id} tone="neutro">{skillName[s.skill_id] ?? '…'}</Tag>)}
                      </div>
                    )}
                    {p.link_url && <a className="text-sm underline text-preparacao" href={p.link_url} target="_blank" rel="noreferrer">Ver link</a>}
                  </div>
                  <button onClick={() => remove('projects', p.id, p.title)} className="text-sm text-apoio underline shrink-0">Remover</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={addProject} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome do projeto"><Input required value={project.title} onChange={setP('title')} /></Field>
            <Field label="Cliente ou área"><Input value={project.client} onChange={setP('client')} /></Field>
            <Field label="Seu papel"><Input value={project.role_in_project} onChange={setP('role_in_project')} placeholder="Ex.: UX lead" /></Field>
            <Field label="Link (opcional)"><Input type="url" value={project.link_url} onChange={setP('link_url')} placeholder="https://" /></Field>
            <Field label="Início"><Input type="date" value={project.started_on} onChange={setP('started_on')} /></Field>
            <Field label="Fim" hint="Deixe em branco se ainda está no projeto."><Input type="date" value={project.ended_on} onChange={setP('ended_on')} /></Field>
          </div>
          <Field label="Contexto, desafio e resultado">
            <Textarea value={project.summary} onChange={setP('summary')} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={project.is_case}
              onChange={(e) => setProject((f) => ({ ...f, is_case: e.target.checked }))} />
            É um case que pode ser apresentado para o time
          </label>
          <details className="rounded-md border border-midnight/15 p-3">
            <summary className="cursor-pointer font-card font-semibold text-sm">
              Skills usadas no projeto {projectSkills.length > 0 && `(${projectSkills.length})`}
            </summary>
            <div className="mt-3 space-y-3">
              {skillGroups.map((g) => (
                <div key={g.name}>
                  <p className="text-xs font-card font-semibold text-apoio uppercase mb-1">{g.name}</p>
                  <div className="flex flex-wrap gap-1">
                    {g.items.map((s) => {
                      const on = projectSkills.includes(s.id)
                      return (
                        <button key={s.id} type="button" onClick={() => toggleSkill(s.id)} aria-pressed={on}
                          className={`rounded px-2 py-1 text-xs border ${on
                            ? 'bg-preparacao text-white border-preparacao'
                            : 'border-midnight/20 hover:bg-midnight/5'}`}>
                          {s.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </details>
          <Button type="submit" disabled={busy}>Adicionar projeto</Button>
        </form>
      </Card>

      <Card title="Cursos, certificações e formação" tone="seminario">
        {courses.length > 0 && (
          <ul className="divide-y divide-midnight/10 mb-6">
            {courses.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-4 py-3">
                <div>
                  <p className="font-card font-semibold">{c.name} <Tag tone="neutro">{kindLabel(c.kind)}</Tag></p>
                  <p className="text-sm text-apoio">
                    {[c.institution,
                      c.completed_on && new Date(c.completed_on + 'T00:00').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }),
                      c.workload_hours && `${c.workload_hours} h`].filter(Boolean).join(' · ')}
                  </p>
                  {c.credential_url && <a className="text-sm underline text-preparacao" href={c.credential_url} target="_blank" rel="noreferrer">Ver certificado</a>}
                </div>
                <button onClick={() => remove('courses', c.id, c.name)} className="text-sm text-apoio underline shrink-0">Remover</button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={addCourse} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome"><Input required value={course.name} onChange={setC('name')} /></Field>
            <Field label="Tipo">
              <Select value={course.kind} onChange={setC('kind')}>
                {COURSE_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Instituição"><Input value={course.institution} onChange={setC('institution')} /></Field>
            <Field label="Conclusão"><Input type="date" value={course.completed_on} onChange={setC('completed_on')} /></Field>
            <Field label="Carga horária (h)"><Input type="number" min={1} value={course.workload_hours} onChange={setC('workload_hours')} /></Field>
            <Field label="Link do certificado"><Input type="url" value={course.credential_url} onChange={setC('credential_url')} placeholder="https://" /></Field>
          </div>
          <Button type="submit" disabled={busy}>Adicionar</Button>
        </form>
      </Card>
      <ErrorText>{error}</ErrorText>
    </div>
  )
}
