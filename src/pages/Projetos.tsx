import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Button, Card, ErrorText, Field, Input, Tag, Textarea } from '../components/ui'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

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
interface SkillOption { id: string; name: string; category: { name: string; sort_order: number }; sort_order: number }

const emptyForm = { title: '', client: '', role_in_project: '', summary: '', started_on: '', ended_on: '', link_url: '', is_case: false }
type ProjectForm = typeof emptyForm

function toForm(p: Project): ProjectForm {
  return {
    title: p.title, client: p.client ?? '', role_in_project: p.role_in_project ?? '', summary: p.summary ?? '',
    started_on: p.started_on ?? '', ended_on: p.ended_on ?? '', link_url: p.link_url ?? '', is_case: p.is_case,
  }
}
function fromForm(f: ProjectForm) {
  const blank = (v: string) => (v.trim() === '' ? null : v.trim())
  return {
    title: f.title.trim(), client: blank(f.client), role_in_project: blank(f.role_in_project), summary: blank(f.summary),
    started_on: f.started_on || null, ended_on: f.ended_on || null, link_url: blank(f.link_url), is_case: f.is_case,
  }
}

function periodo(start: string | null, end: string | null) {
  const fmt = (d: string) => new Date(d + 'T00:00').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
  if (!start && !end) return ''
  return `${start ? fmt(start) : '?'} – ${end ? fmt(end) : 'atual'}`
}

/** Projetos e cases: as evidências que sustentam as notas do mapa de skills. Cursos ficam em Meu currículo. */
export default function Projetos() {
  const { profile } = useAuth()
  const profileId = profile?.id
  const [projects, setProjects] = useState<Project[]>([])
  const [skills, setSkills] = useState<SkillOption[]>([])
  const [form, setForm] = useState<ProjectForm>(emptyForm)
  const [formSkills, setFormSkills] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!profileId) return
    const { data } = await supabase.from('projects').select('*, project_skills(skill_id)').eq('profile_id', profileId)
      .order('started_on', { ascending: false, nullsFirst: true })
    setProjects(data ?? [])
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

  const set = (k: keyof ProjectForm) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const toggleSkill = (id: string) =>
    setFormSkills((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  function startEdit(p: Project) {
    setEditingId(p.id)
    setForm(toForm(p))
    setFormSkills(p.project_skills.map((s) => s.skill_id))
    setError('')
    document.getElementById('form-projeto')?.scrollIntoView({ behavior: 'smooth' })
  }

  function resetForm() {
    setEditingId(null)
    setForm(emptyForm)
    setFormSkills([])
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!profileId) return
    setBusy(true)
    setError('')
    let projectId = editingId
    if (editingId) {
      const { error } = await supabase.from('projects').update(fromForm(form)).eq('id', editingId)
      if (error) { setBusy(false); setError(error.message); return }
      await supabase.from('project_skills').delete().eq('project_id', editingId)
    } else {
      const { data, error } = await supabase.from('projects').insert({ ...fromForm(form), profile_id: profileId }).select('id').single()
      if (error || !data) { setBusy(false); setError(error?.message ?? 'Erro ao salvar'); return }
      projectId = data.id
    }
    if (projectId && formSkills.length > 0) {
      const res = await supabase.from('project_skills').insert(formSkills.map((skill_id) => ({ project_id: projectId, skill_id })))
      if (res.error) setError(res.error.message)
    }
    setBusy(false)
    resetForm()
    load()
  }

  async function remove(p: Project) {
    if (!window.confirm(`Excluir "${p.title}"?`)) return
    await supabase.from('projects').delete().eq('id', p.id)
    if (editingId === p.id) resetForm()
    load()
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="mb-2">Projetos</h1>
        <p className="text-apoio">
          Projetos e cases são as evidências do seu mapa de skills. Notas a partir de 3 vão precisar de um projeto que as
          sustente quando o líder da prática validar. Os projetos lidos do currículo também aparecem aqui.
        </p>
      </div>

      {projects.length > 0 && (
        <Card title={`Seus projetos (${projects.length})`}>
          <ul className="divide-y divide-midnight/10">
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
                    {p.link_url && (
                      <a className="inline-block mt-2 text-sm font-card font-semibold text-preparacao underline" href={p.link_url} target="_blank" rel="noreferrer">
                        Abrir link do projeto ↗
                      </a>
                    )}
                  </div>
                  <div className="flex gap-3 shrink-0 text-sm">
                    <button className="underline" onClick={() => startEdit(p)}>Editar</button>
                    <button className="underline text-apoio" onClick={() => remove(p)}>Excluir</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={editingId ? 'Editar projeto' : 'Adicionar projeto'} tone={editingId ? 'seminario' : 'preparacao'}>
        <form id="form-projeto" onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome do projeto"><Input required value={form.title} onChange={set('title')} /></Field>
            <Field label="Cliente ou área"><Input value={form.client} onChange={set('client')} /></Field>
            <Field label="Seu papel"><Input value={form.role_in_project} onChange={set('role_in_project')} placeholder="Ex.: UX lead" /></Field>
            <Field label="Link do projeto" hint="Figma, protótipo, site, case publicado ou apresentação.">
              <Input type="url" value={form.link_url} onChange={set('link_url')} placeholder="https://" />
            </Field>
            <Field label="Início"><Input type="date" value={form.started_on} onChange={set('started_on')} /></Field>
            <Field label="Fim" hint="Deixe em branco se ainda está no projeto."><Input type="date" value={form.ended_on} onChange={set('ended_on')} /></Field>
          </div>
          <Field label="Contexto, desafio e resultado">
            <Textarea value={form.summary} onChange={set('summary')} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_case} onChange={(e) => setForm((f) => ({ ...f, is_case: e.target.checked }))} />
            É um case que pode ser apresentado para o time
          </label>
          <details className="rounded-md border border-midnight/15 p-3" open={editingId !== null && formSkills.length > 0}>
            <summary className="cursor-pointer font-card font-semibold text-sm">
              Skills usadas no projeto {formSkills.length > 0 && `(${formSkills.length})`}
            </summary>
            <div className="mt-3 space-y-3">
              {skillGroups.map((g) => (
                <div key={g.name}>
                  <p className="text-xs font-card font-semibold text-apoio uppercase mb-1">{g.name}</p>
                  <div className="flex flex-wrap gap-1">
                    {g.items.map((s) => {
                      const on = formSkills.includes(s.id)
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
          <div className="flex gap-3">
            <Button type="submit" disabled={busy}>{editingId ? 'Salvar alterações' : 'Adicionar projeto'}</Button>
            {editingId && <Button type="button" variant="secondary" onClick={resetForm}>Cancelar</Button>}
          </div>
        </form>
      </Card>
      <ErrorText>{error}</ErrorText>
    </div>
  )
}
