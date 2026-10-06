import { FunctionsHttpError } from '@supabase/supabase-js'
import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Button, Card, ErrorText, Field, Input, Select, Tag, Textarea } from './ui'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { COURSE_KINDS, LANGUAGE_LEVELS } from '../lib/types'

interface Extracted {
  job_title: string | null
  job_summary: string | null
  languages: { language: string; level: string }[]
  career: { company: string; job_title: string | null; started_on: string | null; ended_on: string | null; description: string | null }[]
  courses: { kind: string; name: string; institution: string | null; completed_on: string | null; workload_hours: number | null }[]
}
interface ResumeFile { id: string; storage_path: string; file_name: string; created_at: string }
interface CareerEntry {
  id: string; company: string; job_title: string | null
  started_on: string | null; ended_on: string | null; description: string | null
}
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
const FORMACAO = ['graduacao', 'pos_graduacao']
const CURSO = ['curso', 'certificacao', 'outro']

const emptyCareer = { company: '', job_title: '', started_on: '', ended_on: '', description: '' }
type CareerForm = typeof emptyCareer
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

const norm = (s: string | null) => (s ?? '').trim().toLowerCase()
const blank = (v: string) => (v.trim() === '' ? null : v.trim())
const fmtMonth = (d: string | null) =>
  d ? new Date(d + 'T00:00').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }) : null
const periodo = (start: string | null, end: string | null) =>
  !start && !end ? null : `${fmtMonth(start) ?? '?'} – ${fmtMonth(end) ?? 'atual'}`
const kindLabel = (v: string) => COURSE_KINDS.find(([k]) => k === v)?.[1] ?? v

function careerToForm(c: CareerEntry): CareerForm {
  return {
    company: c.company, job_title: c.job_title ?? '', started_on: c.started_on ?? '',
    ended_on: c.ended_on ?? '', description: c.description ?? '',
  }
}
function careerFromForm(f: CareerForm) {
  return {
    company: f.company.trim(), job_title: blank(f.job_title), started_on: f.started_on || null,
    ended_on: f.ended_on || null, description: blank(f.description),
  }
}
function courseToForm(c: Course): CourseForm {
  return {
    kind: c.kind, name: c.name, institution: c.institution ?? '', completed_on: c.completed_on ?? '',
    workload_hours: c.workload_hours ? String(c.workload_hours) : '', credential_url: c.credential_url ?? '',
  }
}
function courseFromForm(f: CourseForm) {
  return {
    kind: f.kind, name: f.name.trim(), institution: blank(f.institution), completed_on: f.completed_on || null,
    workload_hours: f.workload_hours ? Number(f.workload_hours) : null, credential_url: blank(f.credential_url),
  }
}

function CareerFields({ form, setForm }: { form: CareerForm; setForm: (f: CareerForm) => void }) {
  const set = (k: keyof CareerForm) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Empresa"><Input required value={form.company} onChange={set('company')} /></Field>
        <Field label="Cargo"><Input value={form.job_title} onChange={set('job_title')} /></Field>
        <Field label="Entrada"><Input type="date" value={form.started_on} onChange={set('started_on')} /></Field>
        <Field label="Saída" hint="Deixe em branco se ainda trabalha lá."><Input type="date" value={form.ended_on} onChange={set('ended_on')} /></Field>
      </div>
      <Field label="O que você fazia"><Textarea value={form.description} onChange={set('description')} /></Field>
    </div>
  )
}

function CourseFields({ form, setForm, kinds }: { form: CourseForm; setForm: (f: CourseForm) => void; kinds: string[] }) {
  const set = (k: keyof CourseForm) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })
  const academic = kinds.includes('graduacao')
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={academic ? 'Curso' : 'Nome'}><Input required value={form.name} onChange={set('name')} /></Field>
      <Field label="Tipo">
        <Select value={form.kind} onChange={set('kind')}>
          {COURSE_KINDS.filter(([v]) => kinds.includes(v)).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </Field>
      <Field label="Instituição"><Input value={form.institution} onChange={set('institution')} /></Field>
      <Field label="Conclusão"><Input type="date" value={form.completed_on} onChange={set('completed_on')} /></Field>
      {!academic && <Field label="Carga horária (h)"><Input type="number" min={1} value={form.workload_hours} onChange={set('workload_hours')} /></Field>}
      <Field label={academic ? 'Link do diploma' : 'Link do certificado'}>
        <Input type="url" value={form.credential_url} onChange={set('credential_url')} placeholder="https://" />
      </Field>
    </div>
  )
}

function RowActions({ onEdit, onRemove }: { onEdit: () => void; onRemove: () => void }) {
  return (
    <div className="flex gap-3 shrink-0 text-sm">
      <button className="underline" onClick={onEdit}>Editar</button>
      <button className="underline text-apoio" onClick={onRemove}>Excluir</button>
    </div>
  )
}

/** Cursos e formações usam a mesma tabela; cada seção mostra só os tipos dela. */
function CourseSection({ title, tone, kinds, addLabel, courses, onChanged, setError }: {
  title: string; tone: 'preparacao' | 'seminario' | 'consolidacao'; kinds: string[]; addLabel: string
  courses: Course[]; onChanged: () => void; setError: (e: string) => void
}) {
  const { profile } = useAuth()
  const empty = { ...emptyCourse, kind: kinds[0] }
  const [adding, setAdding] = useState(false)
  const [newForm, setNewForm] = useState<CourseForm>(empty)
  const [editing, setEditing] = useState<{ id: string; form: CourseForm } | null>(null)
  const items = courses.filter((c) => kinds.includes(c.kind))

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    const { error } = await supabase.from('courses').insert({ ...courseFromForm(newForm), profile_id: profile.id })
    if (error) { setError(error.message); return }
    setNewForm(empty)
    setAdding(false)
    onChanged()
  }
  async function save(e: FormEvent) {
    e.preventDefault()
    if (!editing) return
    const { error } = await supabase.from('courses').update(courseFromForm(editing.form)).eq('id', editing.id)
    if (error) { setError(error.message); return }
    setEditing(null)
    onChanged()
  }
  async function remove(c: Course) {
    if (!window.confirm(`Excluir "${c.name}"?`)) return
    await supabase.from('courses').delete().eq('id', c.id)
    onChanged()
  }

  return (
    <Card title={title} tone={tone}>
      {items.length === 0 && !adding && <p className="text-sm text-apoio mb-4">Nada cadastrado ainda.</p>}
      {items.length > 0 && (
        <ul className="divide-y divide-midnight/10 mb-4">
          {items.map((c) => (
            <li key={c.id} className="py-3">
              {editing?.id === c.id ? (
                <form onSubmit={save} className="space-y-3">
                  <CourseFields form={editing.form} setForm={(form) => setEditing({ id: c.id, form })} kinds={kinds} />
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
                    {c.credential_url && <a className="text-sm underline text-preparacao" href={c.credential_url} target="_blank" rel="noreferrer">Ver comprovante ↗</a>}
                  </div>
                  <RowActions onEdit={() => setEditing({ id: c.id, form: courseToForm(c) })} onRemove={() => remove(c)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <form onSubmit={add} className="space-y-4">
          <CourseFields form={newForm} setForm={setNewForm} kinds={kinds} />
          <div className="flex gap-3">
            <Button type="submit">Adicionar</Button>
            <Button type="button" variant="secondary" onClick={() => setAdding(false)}>Cancelar</Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="secondary" onClick={() => setAdding(true)}>{addLabel}</Button>
      )}
    </Card>
  )
}

/**
 * Currículo dentro de Meu perfil: o arquivo mais recente fica guardado; a leitura por IA preenche carreira,
 * formações, cursos e idiomas, e a pessoa edita ou exclui o que quiser. Notas de skill nunca vêm do currículo.
 */
export default function MeuCurriculo({ onChanged }: { onChanged: () => void }) {
  const { profile, reloadProfile } = useAuth()
  const profileId = profile?.id
  const [file, setFile] = useState<ResumeFile | null>(null)
  const [career, setCareer] = useState<CareerEntry[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [languages, setLanguages] = useState<Language[]>([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [addingCareer, setAddingCareer] = useState(false)
  const [newCareer, setNewCareer] = useState<CareerForm>(emptyCareer)
  const [editingCareer, setEditingCareer] = useState<{ id: string; form: CareerForm } | null>(null)
  const [newLang, setNewLang] = useState({ language: '', level: 'intermediario' })

  const load = useCallback(async () => {
    if (!profileId) return
    const [f, ca, c, l] = await Promise.all([
      supabase.from('resume_imports').select('id, storage_path, file_name, created_at')
        .eq('profile_id', profileId).eq('status', 'aplicado').order('created_at', { ascending: false }).limit(1),
      supabase.from('career_entries').select('*').eq('profile_id', profileId)
        .order('ended_on', { ascending: false, nullsFirst: true }).order('started_on', { ascending: false }),
      supabase.from('courses').select('*').eq('profile_id', profileId).order('completed_on', { ascending: false, nullsFirst: true }),
      supabase.from('profile_languages').select('language, level').eq('profile_id', profileId).order('language'),
    ])
    setFile(f.data?.[0] ?? null)
    setCareer(ca.data ?? [])
    setCourses(c.data ?? [])
    setLanguages(l.data ?? [])
  }, [profileId])
  useEffect(() => { void load() }, [load])

  const changed = useCallback(() => { void load(); onChanged() }, [load, onChanged])

  /** Grava o que a IA leu, sem duplicar o que já existe. Cargo e descrição só entram se estiverem vazios. */
  async function saveExtracted(x: Extracted) {
    if (!profile) return { career: 0, courses: 0, languages: 0 }
    const changes: Record<string, string> = {}
    if (!profile.job_title && x.job_title) changes.job_title = x.job_title
    if (!profile.job_summary && x.job_summary) changes.job_summary = x.job_summary
    if (Object.keys(changes).length) await supabase.from('profiles').update(changes).eq('id', profile.id)

    const careerKey = (c: { company: string; job_title: string | null }) => `${norm(c.company)}|${norm(c.job_title)}`
    const haveCareer = new Set(career.map(careerKey))
    const newCareer = (x.career ?? []).filter((c) => !haveCareer.has(careerKey(c)))
    if (newCareer.length) await supabase.from('career_entries').insert(newCareer.map((c) => ({ ...c, profile_id: profile.id })))

    const haveCourses = new Set(courses.map((c) => norm(c.name)))
    const newCourses = x.courses.filter((c) => !haveCourses.has(norm(c.name)))
    if (newCourses.length) await supabase.from('courses').insert(newCourses.map((c) => ({ ...c, profile_id: profile.id })))

    const haveLangs = new Set(languages.map((l) => norm(l.language)))
    const newLangs = x.languages.filter((l) => !haveLangs.has(norm(l.language)))
    if (newLangs.length) await supabase.from('profile_languages').insert(newLangs.map((l) => ({ ...l, profile_id: profile.id })))

    return { career: newCareer.length, courses: newCourses.length, languages: newLangs.length }
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
    changed()
    setBusy('')
    setNotice(`Currículo lido. Entraram ${added.career} empresas, ${added.courses} cursos e formações e ${added.languages} idiomas. ` +
      'Confira abaixo; edite ou exclua o que não estiver certo.')
  }

  async function download() {
    if (!file) return
    const { data } = await supabase.storage.from('resumes').createSignedUrl(file.storage_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function removeFile() {
    if (!file || !window.confirm('Excluir o arquivo do currículo? Carreira, formações, cursos e idiomas continuam no perfil.')) return
    await supabase.storage.from('resumes').remove([file.storage_path])
    await supabase.from('resume_imports').delete().eq('id', file.id)
    changed()
  }

  async function addCareer(e: FormEvent) {
    e.preventDefault()
    if (!profileId) return
    const { error } = await supabase.from('career_entries').insert({ ...careerFromForm(newCareer), profile_id: profileId })
    if (error) { setError(error.message); return }
    setNewCareer(emptyCareer)
    setAddingCareer(false)
    changed()
  }

  async function saveCareer(e: FormEvent) {
    e.preventDefault()
    if (!editingCareer) return
    const { error } = await supabase.from('career_entries').update(careerFromForm(editingCareer.form)).eq('id', editingCareer.id)
    if (error) { setError(error.message); return }
    setEditingCareer(null)
    changed()
  }

  async function removeCareer(c: CareerEntry) {
    if (!window.confirm(`Excluir "${c.company}"?`)) return
    await supabase.from('career_entries').delete().eq('id', c.id)
    changed()
  }

  async function addLanguage(e: FormEvent) {
    e.preventDefault()
    if (!profileId || !newLang.language.trim()) return
    const { error } = await supabase.from('profile_languages')
      .upsert({ profile_id: profileId, language: newLang.language.trim(), level: newLang.level })
    if (error) { setError(error.message); return }
    setNewLang({ language: '', level: 'intermediario' })
    changed()
  }

  async function changeLevel(language: string, level: string) {
    if (!profileId) return
    await supabase.from('profile_languages').update({ level }).eq('profile_id', profileId).eq('language', language)
    load()
  }

  async function removeLanguage(language: string) {
    if (!profileId) return
    await supabase.from('profile_languages').delete().eq('profile_id', profileId).eq('language', language)
    changed()
  }

  return (
    <section id="curriculo" className="space-y-6 scroll-mt-6">
      <div>
        <h2 className="mb-1">Currículo</h2>
        <p className="text-apoio">
          Envie seu currículo e a plataforma preenche carreira, formações, cursos e idiomas. Depois é só editar ou
          excluir o que precisar. As notas do mapa de skills continuam sendo só suas.
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

      <Card title="Carreira" tone="preparacao">
        {career.length === 0 && !addingCareer && <p className="text-sm text-apoio mb-4">Nenhuma empresa cadastrada ainda.</p>}
        {career.length > 0 && (
          <ul className="divide-y divide-midnight/10 mb-4">
            {career.map((c) => (
              <li key={c.id} className="py-3">
                {editingCareer?.id === c.id ? (
                  <form onSubmit={saveCareer} className="space-y-3">
                    <CareerFields form={editingCareer.form} setForm={(form) => setEditingCareer({ id: c.id, form })} />
                    <div className="flex gap-3">
                      <Button type="submit">Salvar</Button>
                      <Button type="button" variant="secondary" onClick={() => setEditingCareer(null)}>Cancelar</Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-card font-semibold">{c.company}</p>
                      <p className="text-sm text-apoio">{[c.job_title, periodo(c.started_on, c.ended_on)].filter(Boolean).join(' · ')}</p>
                      {c.description && <p className="text-sm mt-1">{c.description}</p>}
                    </div>
                    <RowActions onEdit={() => setEditingCareer({ id: c.id, form: careerToForm(c) })} onRemove={() => removeCareer(c)} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {addingCareer ? (
          <form onSubmit={addCareer} className="space-y-4">
            <CareerFields form={newCareer} setForm={setNewCareer} />
            <div className="flex gap-3">
              <Button type="submit">Adicionar</Button>
              <Button type="button" variant="secondary" onClick={() => setAddingCareer(false)}>Cancelar</Button>
            </div>
          </form>
        ) : (
          <Button type="button" variant="secondary" onClick={() => setAddingCareer(true)}>Adicionar empresa</Button>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <CourseSection title="Formações" tone="seminario" kinds={FORMACAO} addLabel="Adicionar formação"
          courses={courses} onChanged={changed} setError={setError} />
        <CourseSection title="Cursos e certificações" tone="seminario" kinds={CURSO} addLabel="Adicionar curso"
          courses={courses} onChanged={changed} setError={setError} />
      </div>

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
    </section>
  )
}
