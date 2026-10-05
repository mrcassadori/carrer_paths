import { FunctionsHttpError } from '@supabase/supabase-js'
import { useEffect, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, ErrorText, Tag } from '../components/ui'
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
interface Import { id: string; storage_path: string; extracted: Extracted | null }

const MAX_MB = 10
const TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

async function functionError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const body = await error.context.json().catch(() => null)
    if (body?.error) return body.error
  }
  return 'Não foi possível ler o currículo. Tente de novo.'
}

const ano = (d: string | null) => (d ? d.slice(0, 4) : null)

/** Importação do currículo: a IA só sugere; a pessoa escolhe o que entra no perfil. O arquivo é apagado no fim. */
export default function Curriculo() {
  const { profile, reloadProfile } = useAuth()
  const [imp, setImp] = useState<Import | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [useTitle, setUseTitle] = useState(true)
  const [useSummary, setUseSummary] = useState(true)
  const [pick, setPick] = useState<{ languages: boolean[]; projects: boolean[]; courses: boolean[] }>({ languages: [], projects: [], courses: [] })
  const [skillNames, setSkillNames] = useState<Record<string, { id: string; name: string }>>({})

  const startReview = (row: Import) => {
    const x = row.extracted!
    setImp(row)
    setPick({ languages: x.languages.map(() => true), projects: x.projects.map(() => true), courses: x.courses.map(() => true) })
  }

  useEffect(() => {
    if (!profile) return
    supabase.from('skills').select('id, slug, name').then(({ data }) =>
      setSkillNames(Object.fromEntries((data ?? []).map((s) => [s.slug, { id: s.id, name: s.name }]))))
    // Retoma uma revisão que ficou pela metade
    supabase.from('resume_imports').select('id, storage_path, extracted')
      .eq('profile_id', profile.id).eq('status', 'pronto_para_revisao')
      .order('created_at', { ascending: false }).limit(1)
      .then(({ data }) => { if (data?.[0]?.extracted) startReview(data[0] as Import) })
  }, [profile])

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !profile) return
    setError('')
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!TYPES[ext]) { setError('Envie um arquivo PDF ou Word (.docx). Arquivos .doc antigos: salve como .docx antes.'); return }
    if (file.size > MAX_MB * 1024 * 1024) { setError(`O arquivo passa de ${MAX_MB} MB.`); return }

    setBusy('Enviando o arquivo…')
    const path = `${profile.id}/${crypto.randomUUID()}.${ext}`
    const up = await supabase.storage.from('resumes').upload(path, file, { contentType: TYPES[ext] })
    if (up.error) { setBusy(''); setError('Não foi possível enviar o arquivo.'); return }
    const { data: row, error: insErr } = await supabase.from('resume_imports')
      .insert({ profile_id: profile.id, storage_path: path, file_name: file.name, mime_type: TYPES[ext] })
      .select('id, storage_path').single()
    if (insErr || !row) { setBusy(''); setError(insErr?.message ?? 'Erro ao registrar o envio.'); return }

    setBusy('Lendo o currículo. Isso leva menos de um minuto…')
    const { data, error: fnErr } = await supabase.functions.invoke('ler-curriculo', { body: { import_id: row.id } })
    setBusy('')
    if (fnErr || !data?.extracted) {
      setError(await functionError(fnErr))
      await supabase.storage.from('resumes').remove([path])
      return
    }
    startReview({ ...row, extracted: data.extracted })
  }

  async function discard() {
    if (!imp) return
    await supabase.storage.from('resumes').remove([imp.storage_path])
    await supabase.from('resume_imports').delete().eq('id', imp.id)
    setImp(null)
  }

  async function apply() {
    if (!imp?.extracted || !profile) return
    const x = imp.extracted
    setBusy('Salvando no seu perfil…')
    setError('')
    const fail = (msg: string) => { setBusy(''); setError(msg) }

    const changes: Record<string, string> = {}
    if (useTitle && x.job_title) changes.job_title = x.job_title
    if (useSummary && x.job_summary) changes.job_summary = x.job_summary
    if (Object.keys(changes).length) {
      const { error } = await supabase.from('profiles').update(changes).eq('id', profile.id)
      if (error) return fail(error.message)
    }

    const langs = x.languages.filter((_, i) => pick.languages[i])
    if (langs.length) {
      const { error } = await supabase.from('profile_languages')
        .upsert(langs.map((l) => ({ profile_id: profile.id, language: l.language, level: l.level })))
      if (error) return fail(error.message)
    }

    for (const p of x.projects.filter((_, i) => pick.projects[i])) {
      const { skill_slugs, ...fields } = p
      const { data, error } = await supabase.from('projects').insert({ ...fields, profile_id: profile.id }).select('id').single()
      if (error || !data) return fail(error?.message ?? 'Erro ao salvar projeto')
      const ids = skill_slugs.map((s) => skillNames[s]?.id).filter(Boolean)
      if (ids.length) await supabase.from('project_skills').insert(ids.map((skill_id) => ({ project_id: data.id, skill_id })))
    }

    const courses = x.courses.filter((_, i) => pick.courses[i])
    if (courses.length) {
      const { error } = await supabase.from('courses').insert(courses.map((c) => ({ ...c, profile_id: profile.id })))
      if (error) return fail(error.message)
    }

    await supabase.from('resume_imports')
      .update({ status: 'aplicado', applied_at: new Date().toISOString(), extracted: null }).eq('id', imp.id)
    await supabase.storage.from('resumes').remove([imp.storage_path])
    await reloadProfile()
    setBusy('')
    setImp(null)
    setDone(true)
  }

  const toggle = (group: keyof typeof pick, i: number) =>
    setPick((cur) => ({ ...cur, [group]: cur[group].map((v, j) => (j === i ? !v : v)) }))
  const levelLabel = (v: string) => LANGUAGE_LEVELS.find(([k]) => k === v)?.[1] ?? v
  const kindLabel = (v: string) => COURSE_KINDS.find(([k]) => k === v)?.[1] ?? v
  const x = imp?.extracted

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="mb-2">Importar currículo</h1>
        <p className="text-apoio">
          Envie seu currículo em PDF ou Word e a plataforma sugere cargo, projetos, cursos e idiomas. Você revisa e escolhe
          o que entra. As notas do mapa de skills continuam sendo só suas.
        </p>
      </div>

      {done && (
        <Card tone="consolidacao" title="Pronto, o perfil foi atualizado">
          <p>O arquivo do currículo foi apagado. Confira o que entrou em <Link className="underline" to="/experiencia">Projetos e cursos</Link>.</p>
        </Card>
      )}

      {!x && (
        <Card>
          <label className="block">
            <span className="block font-card font-semibold text-sm mb-2">Arquivo do currículo (PDF ou .docx, até {MAX_MB} MB)</span>
            <input type="file" accept=".pdf,.docx" onChange={upload} disabled={!!busy}
              className="block text-sm file:mr-4 file:rounded-md file:border-0 file:bg-preparacao file:px-4 file:py-2 file:text-white file:font-card file:font-semibold" />
          </label>
          <p className="text-sm text-apoio mt-4">
            O arquivo é lido por IA (Claude, da Anthropic) só para gerar as sugestões e é apagado assim que você aplica ou
            descarta a revisão.
          </p>
        </Card>
      )}

      {busy && <p role="status" className="text-apoio">{busy}</p>}
      <ErrorText>{error}</ErrorText>

      {x && (
        <>
          {(x.job_title || x.job_summary) && (
            <Card title="Cargo e descrição">
              {x.job_title && (
                <label className="flex gap-2 items-start mb-2">
                  <input type="checkbox" className="mt-1" checked={useTitle} onChange={() => setUseTitle(!useTitle)} />
                  <span><span className="font-card font-semibold">Cargo:</span> {x.job_title}
                    {profile?.job_title && <span className="text-apoio"> (hoje: {profile.job_title})</span>}</span>
                </label>
              )}
              {x.job_summary && (
                <label className="flex gap-2 items-start">
                  <input type="checkbox" className="mt-1" checked={useSummary} onChange={() => setUseSummary(!useSummary)} />
                  <span><span className="font-card font-semibold">Descrição:</span> {x.job_summary}</span>
                </label>
              )}
            </Card>
          )}

          {x.projects.length > 0 && (
            <Card title={`Projetos (${x.projects.length})`}>
              <ul className="space-y-3">
                {x.projects.map((p, i) => (
                  <li key={i}>
                    <label className="flex gap-2 items-start">
                      <input type="checkbox" className="mt-1" checked={pick.projects[i] ?? false} onChange={() => toggle('projects', i)} />
                      <span>
                        <span className="font-card font-semibold">{p.title}</span>
                        <span className="text-apoio text-sm"> {[p.client, p.role_in_project,
                          (p.started_on || p.ended_on) && `${ano(p.started_on) ?? '?'}–${ano(p.ended_on) ?? 'atual'}`].filter(Boolean).join(' · ')}</span>
                        {p.summary && <span className="block text-sm">{p.summary}</span>}
                        {p.skill_slugs.length > 0 && (
                          <span className="flex flex-wrap gap-1 mt-1">
                            {p.skill_slugs.map((s) => <Tag key={s} tone="neutro">{skillNames[s]?.name ?? s}</Tag>)}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {x.courses.length > 0 && (
            <Card title={`Cursos e formação (${x.courses.length})`} tone="seminario">
              <ul className="space-y-2">
                {x.courses.map((c, i) => (
                  <li key={i}>
                    <label className="flex gap-2 items-start">
                      <input type="checkbox" className="mt-1" checked={pick.courses[i] ?? false} onChange={() => toggle('courses', i)} />
                      <span>
                        <span className="font-card font-semibold">{c.name}</span> <Tag tone="neutro">{kindLabel(c.kind)}</Tag>
                        <span className="text-apoio text-sm"> {[c.institution, ano(c.completed_on)].filter(Boolean).join(' · ')}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {x.languages.length > 0 && (
            <Card title="Idiomas" tone="consolidacao">
              <ul className="space-y-2">
                {x.languages.map((l, i) => (
                  <li key={i}>
                    <label className="flex gap-2 items-center">
                      <input type="checkbox" checked={pick.languages[i] ?? false} onChange={() => toggle('languages', i)} />
                      <span><span className="font-card font-semibold">{l.language}</span> · {levelLabel(l.level)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="flex flex-wrap gap-3">
            <Button onClick={apply} disabled={!!busy}>Adicionar os itens marcados ao perfil</Button>
            <Button variant="secondary" onClick={discard} disabled={!!busy}>Descartar e apagar o arquivo</Button>
          </div>
        </>
      )}
    </div>
  )
}
