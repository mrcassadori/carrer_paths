import { FunctionsHttpError } from '@supabase/supabase-js'
import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, ErrorText, Field, Input, Select, Tag } from '../components/ui'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { COURSE_KINDS, LANGUAGE_LEVELS } from '../lib/types'

interface Extracted {
  job_title: string | null
  job_summary: string | null
  languages: { language: string; level: string }[]
  projects: {
    title: string; client: string | null; role_in_project: string | null; summary: string | null
    started_on: string | null; ended_on: string | null; skill_slugs: string[]
  }[]
  courses: { kind: string; name: string; institution: string | null; completed_on: string | null; workload_hours: number | null }[]
}
interface ResumeFile { id: string; storage_path: string; file_name: string; created_at: string }
interface Course {
  id: string; kind: string; name: string; institution: string | null
  completed_on: string | null; workload_hours: number | null; credential_url: string | null
}
interface Language { language: string; level: string }

const MAX_MB = 10
const TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}
const emptyCourse = { kind: 'curso', name: '', institution: '', completed_on: '', workload_hours: '', credential_url: '' }
type CourseForm = typeof emptyCourse

async function functionError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const body = await error.context.json().catch(() => null)
    if (body?.error) return body.error
    const status = error.context.status
    const msg = body?.message ?? body?.msg ?? body?.code ?? ''
    return `Não foi possível ler o currículo (erro ${status}${msg ? `: ${msg}` : ''}).`
  }
  const detail = error instanceof Error ? ` (${error.message})` : ''
  return `Não foi possível ler o currículo. Tente de novo.${detail}`
}

const norm = (s: string) => s.trim().toLowerCase()
const fmtMonth = (d: string | null) =>
  d ? new Date(d + 'T00:00').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }) : null
const kindLabel = (v: string) => COURSE_KINDS.find(([k]) => k === v)?.[1] ?? v

function toForm(c: Course): CourseForm {
  return {
    kind: c.kind, name: c.name, institution: c.institution ?? '', completed_on: c.completed_on ?? '',
    workload_hours: c.workload_hours ? String(c.workload_hours) : '', credential_url: c.credential_url ?? '',
  }
}
function fromForm(f: CourseForm) {
  return {
    kind: f.kind, name: f.name.trim(), institution: f.institution || null, completed_on: f.completed_on || null,
    workload_hours: f.workload_hours ? Number(f.workload_hours) : null, credential_url: f.credential_url || null,
  }
}

function CourseFields({ form, setForm }: { form: CourseForm; setForm: (f: CourseForm) => void }) {
  const set = (k: keyof CourseForm) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Nome"><Input required value={form.name} onChange={set('name')} /></Field>
      <Field label="Tipo">
        <Select value={form.kind} onChange={set('kind')}>
          {COURSE_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </Field>
      <Field label="Instituição"><Input value={form.institution} onChange={set('institution')} /></Field>
      <Field label="Conclusão"><Input type="date" value={form.completed_on} onChange={set('completed_on')} /></Field>
      <Field label="Carga horária (h)"><Input type="number" min={1} value={form.workload_hours} onChange={set('workload_hours')} /></Field>
      <Field label="Link do certificado"><Input type="url" value={form.credential_url} onChange={set('credential_url')} placeholder="https://" /></Field>
    </div>
  )
}

/**
 * Meu currículo: o arquivo mais recente fica guardado; a leitura por IA preenche formação, cursos, idiomas
 * e projetos, e a pessoa edita ou exclui o que quiser. Notas de skill nunca vêm do currículo.
 */
export default function Curriculo() {
  const { profile, reloadProfile } = useAuth()
  const profileId = profile?.id
  const [file, setFile] = useState<ResumeFile | null>(null)
  const [courses, setCourses] = useState<Course[]>([])
  const [languages, setLanguages] = useState<Language[]>([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [newCourse, setNewCourse] = useState<CourseForm>(emptyCourse)
  const [editing, setEditing] = useState<{ id: string; form: CourseForm } | null>(null)
  const [newLang, setNewLang] = useState({ language: '', level: 'intermediario' })

  const load = useCallback(async () => {
    if (!profileId) return
    const [f, c, l] = await Promise.all([
      supabase.from('resume_imports').select('id, storage_path, file_name, created_at')
        .eq('profile_id', profileId).eq('status', 'aplicado').order('created_at', { ascending: false }).limit(1),
      supabase.from('courses').select('*').eq('profile_id', profileId).order('completed_on', { ascending: false, nullsFirst: true }),
      supabase.from('profile_languages').select('language, level').eq('profile_id', profileId).order('language'),
    ])
    setFile(f.data?.[0] ?? null)
    setCourses(c.data ?? [])
    setLanguages(l.data ?? [])
  }, [profileId])
  useEffect(() => { void load() }, [load])

  /** Grava o que a IA leu, sem duplicar o que já existe. Cargo e descrição só entram se estiverem vazios. */
  async function saveExtracted(x: Extracted) {
    if (!profile) return { courses: 0, languages: 0, projects: 0 }
    const changes: Record<string, string> = {}
    if (!profile.job_title && x.job_title) changes.job_title = x.job_title
    if (!profile.job_summary && x.job_summary) changes.job_summary = x.job_summary
    if (Object.keys(changes).length) await supabase.from('profiles').update(changes).eq('id', profile.id)

    const haveCourses = new Set(courses.map((c) => norm(c.name)))
    const newCourses = x.courses.filter((c) => !haveCourses.has(norm(c.name)))
    if (newCourses.length) await supabase.from('courses').insert(newCourses.map((c) => ({ ...c, profile_id: profile.id })))

    const haveLangs = new Set(languages.map((l) => norm(l.language)))
    const newLangs = x.languages.filter((l) => !haveLangs.has(norm(l.language)))
    if (newLangs.length) await supabase.from('profile_languages').insert(newLangs.map((l) => ({ ...l, profile_id: profile.id })))

    const { data: existing } = await supabase.from('projects').select('title').eq('profile_id', profile.id)
    const haveProjects = new Set((existing ?? []).map((p) => norm(p.title)))
    const newProjects = x.projects.filter((p) => !haveProjects.has(norm(p.title)))
    if (newProjects.length) {
      const { data: skills } = await supabase.from('skills').select('id, slug')
      const skillId = Object.fromEntries((skills ?? []).map((s) => [s.slug, s.id]))
      for (const p of newProjects) {
        const { skill_slugs, ...fields } = p
        const { data } = await supabase.from('projects').insert({ ...fields, profile_id: profile.id }).select('id').single()
        const ids = skill_slugs.map((s) => skillId[s]).filter(Boolean)
        if (data && ids.length) await supabase.from('project_skills').insert(ids.map((skill_id) => ({ project_id: data.id, skill_id })))
      }
    }
    return { courses: newCourses.length, languages: newLangs.length, projects: newProjects.length }
  }

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f || !profile) return
    setError('')
    setNotice('')
    const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
    if (!TYPES[ext]) { setError('Envie um arquivo PDF ou Word (.docx). Arquivos .doc antigos: salve como .docx antes.'); return }
    if (f.size > MAX_MB * 1024 * 1024) { setError(`O arquivo passa de ${MAX_MB} MB.`); return }

    setBusy('Enviando o arquivo…')
    const path = `${profile.id}/${crypto.randomUUID()}.${ext}`
    const up = await supabase.storage.from('resumes').upload(path, f, { contentType: TYPES[ext] })
    if (up.error) { setBusy(''); setError('Não foi possível enviar o arquivo.'); return }
    const { data: row, error: insErr } = await supabase.from('resume_imports')
      .insert({ profile_id: profile.id, storage_path: path, file_name: f.name, mime_type: TYPES[ext] })
      .select('id').single()
    if (insErr || !row) { setBusy(''); setError(insErr?.message ?? 'Erro ao registrar o envio.'); return }

    setBusy('Lendo o currículo. Isso leva menos de um minuto…')
    const { data, error: fnErr } = await supabase.functions.invoke('ler-curriculo', { body: { import_id: row.id } })
    if (fnErr || !data?.extracted) {
      setBusy('')
      setError(fnErr ? await functionError(fnErr) : `A função respondeu sem sugestões: ${JSON.stringify(data).slice(0, 200)}`)
      await supabase.storage.from('resumes').remove([path])
      await supabase.from('resume_imports').delete().eq('id', row.id)
      return
    }

    setBusy('Salvando no seu perfil…')
    const added = await saveExtracted(data.extracted as Extracted)
    await supabase.from('resume_imports')
      .update({ status: 'aplicado', applied_at: new Date().toISOString(), extracted: null }).eq('id', row.id)
    // Guarda só o currículo mais recente
    if (file) {
      await supabase.storage.from('resumes').remove([file.storage_path])
      await supabase.from('resume_imports').delete().eq('id', file.id)
    }
    await reloadProfile()
    await load()
    setBusy('')
    setNotice(`Currículo lido. Entraram ${added.courses} cursos, ${added.languages} idiomas e ${added.projects} projetos. ` +
      'Confira abaixo e em Projetos; edite ou exclua o que não estiver certo.')
  }

  async function download() {
    if (!file) return
    const { data } = await supabase.storage.from('resumes').createSignedUrl(file.storage_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function removeFile() {
    if (!file || !window.confirm('Excluir o arquivo do currículo? Cursos, idiomas e projetos continuam no perfil.')) return
    await supabase.storage.from('resumes').remove([file.storage_path])
    await supabase.from('resume_imports').delete().eq('id', file.id)
    load()
  }

  async function addCourse(e: FormEvent) {
    e.preventDefault()
    if (!profileId) return
    setError('')
    const { error } = await supabase.from('courses').insert({ ...fromForm(newCourse), profile_id: profileId })
    if (error) { setError(error.message); return }
    setNewCourse(emptyCourse)
    load()
  }

  async function saveCourse(e: FormEvent) {
    e.preventDefault()
    if (!editing) return
    const { error } = await supabase.from('courses').update(fromForm(editing.form)).eq('id', editing.id)
    if (error) { setError(error.message); return }
    setEditing(null)
    load()
  }

  async function removeCourse(c: Course) {
    if (!window.confirm(`Excluir "${c.name}"?`)) return
    await supabase.from('courses').delete().eq('id', c.id)
    load()
  }

  async function addLanguage(e: FormEvent) {
    e.preventDefault()
    if (!profileId || !newLang.language.trim()) return
    const { error } = await supabase.from('profile_languages')
      .upsert({ profile_id: profileId, language: newLang.language.trim(), level: newLang.level })
    if (error) { setError(error.message); return }
    setNewLang({ language: '', level: 'intermediario' })
    load()
  }

  async function changeLevel(language: string, level: string) {
    if (!profileId) return
    await supabase.from('profile_languages').update({ level }).eq('profile_id', profileId).eq('language', language)
    load()
  }

  async function removeLanguage(language: string) {
    if (!profileId) return
    await supabase.from('profile_languages').delete().eq('profile_id', profileId).eq('language', language)
    load()
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="mb-2">Meu currículo</h1>
        <p className="text-apoio">
          Envie seu currículo e a plataforma preenche formação, cursos, idiomas e projetos. Depois é só editar ou excluir
          o que precisar. As notas do mapa de skills continuam sendo só suas.
        </p>
      </div>

      <Card title="Arquivo do currículo">
        {file && (
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className="font-card font-semibold">{file.file_name}</span>
            <span className="text-sm text-apoio">enviado em {new Date(file.created_at).toLocaleDateString('pt-BR')}</span>
            <button className="text-sm underline text-preparacao" onClick={download}>Baixar</button>
            <button className="text-sm underline text-apoio" onClick={removeFile}>Excluir arquivo</button>
          </div>
        )}
        <label className="block">
          <span className="block font-card font-semibold text-sm mb-2">
            {file ? 'Enviar uma versão nova' : 'Enviar currículo'} (PDF ou .docx, até {MAX_MB} MB)
          </span>
          <input type="file" accept=".pdf,.docx" onChange={upload} disabled={!!busy}
            className="block text-sm file:mr-4 file:rounded-md file:border-0 file:bg-preparacao file:px-4 file:py-2 file:text-white file:font-card file:font-semibold" />
        </label>
        <p className="text-sm text-apoio mt-4">
          O arquivo é lido por IA (Claude, da Anthropic) para preencher o perfil. Fica guardado só o mais recente, visível
          para você, seu gestor, o líder da prática e o admin.
        </p>
      </Card>

      {busy && <p role="status" className="text-apoio">{busy}</p>}
      {notice && <p role="status" className="text-sm bg-consolidacao/10 border-l-4 border-consolidacao px-3 py-2 rounded">{notice}</p>}
      <ErrorText>{error}</ErrorText>

      <Card title="Formação, cursos e certificações" tone="seminario">
        {courses.length > 0 && (
          <ul className="divide-y divide-midnight/10 mb-6">
            {courses.map((c) => (
              <li key={c.id} className="py-3">
                {editing?.id === c.id ? (
                  <form onSubmit={saveCourse} className="space-y-3">
                    <CourseFields form={editing.form} setForm={(form) => setEditing({ id: c.id, form })} />
                    <div className="flex gap-3">
                      <Button type="submit">Salvar</Button>
                      <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-card font-semibold">{c.name} <Tag tone="neutro">{kindLabel(c.kind)}</Tag></p>
                      <p className="text-sm text-apoio">
                        {[c.institution, fmtMonth(c.completed_on), c.workload_hours && `${c.workload_hours} h`].filter(Boolean).join(' · ')}
                      </p>
                      {c.credential_url && <a className="text-sm underline text-preparacao" href={c.credential_url} target="_blank" rel="noreferrer">Ver certificado</a>}
                    </div>
                    <div className="flex gap-3 shrink-0 text-sm">
                      <button className="underline" onClick={() => setEditing({ id: c.id, form: toForm(c) })}>Editar</button>
                      <button className="underline text-apoio" onClick={() => removeCourse(c)}>Excluir</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={addCourse} className="space-y-4">
          <p className="font-card font-semibold text-sm">Adicionar curso ou formação</p>
          <CourseFields form={newCourse} setForm={setNewCourse} />
          <Button type="submit">Adicionar</Button>
        </form>
      </Card>

      <Card title="Idiomas" tone="consolidacao">
        {languages.length > 0 && (
          <ul className="divide-y divide-midnight/10 mb-4">
            {languages.map((l) => (
              <li key={l.language} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span className="font-card font-semibold">{l.language}</span>
                <div className="flex items-center gap-3">
                  <select value={l.level} onChange={(e) => changeLevel(l.language, e.target.value)}
                    className="rounded-md border border-midnight/25 px-2 py-1 bg-white" aria-label={`Nível em ${l.language}`}>
                    {LANGUAGE_LEVELS.map(([v, lab]) => <option key={v} value={v}>{lab}</option>)}
                  </select>
                  <button onClick={() => removeLanguage(l.language)} className="text-sm text-apoio underline">Excluir</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={addLanguage} className="grid gap-3 sm:grid-cols-[1fr_200px_auto] items-end">
          <Field label="Idioma"><Input value={newLang.language} onChange={(e) => setNewLang({ ...newLang, language: e.target.value })} placeholder="Ex.: Inglês" /></Field>
          <Field label="Nível">
            <Select value={newLang.level} onChange={(e) => setNewLang({ ...newLang, level: e.target.value })}>
              {LANGUAGE_LEVELS.map(([v, lab]) => <option key={v} value={v}>{lab}</option>)}
            </Select>
          </Field>
          <Button type="submit">Adicionar</Button>
        </form>
      </Card>

      <p className="text-sm text-apoio">Os projetos lidos do currículo ficam em <Link className="underline" to="/projetos">Projetos</Link>.</p>
    </div>
  )
}
