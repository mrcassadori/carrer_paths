import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorText, Input, Tag } from '../components/ui'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { ASSESSMENT_STATUS } from '../lib/types'

interface Person {
  id: string
  full_name: string
  email: string
  job_title: string | null
  track_name: string | null
  level_name: string | null
  assessment_status: string | null
  skills_self_rated: number
  skills_total: number
}

// Quem está esperando o líder aparece primeiro
const ORDER: Record<string, number> = { enviada: 0, em_revisao: 1, contestada: 2, rascunho: 3, validada: 4 }

/** Líder da prática e admin: lista de pessoas da prática para avaliar. */
export default function Avaliacoes() {
  const { profile } = useAuth()
  const { t } = useI18n()
  const [people, setPeople] = useState<Person[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!profile) return
    supabase.from('profile_overview')
      .select('id, full_name, email, job_title, track_name, level_name, assessment_status, skills_self_rated, skills_total')
      .neq('id', profile.id)
      .then(({ data, error }) => {
        if (error) setError(t(error.message))
        setPeople(data ?? [])
      })
  }, [profile, t])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return people
      .filter((p) => !q || `${p.full_name} ${p.email}`.toLowerCase().includes(q))
      .sort((a, b) => (ORDER[a.assessment_status ?? 'rascunho'] ?? 9) - (ORDER[b.assessment_status ?? 'rascunho'] ?? 9)
        || (a.full_name || a.email).localeCompare(b.full_name || b.email))
  }, [people, query])

  if (profile && !['lider_pratica', 'admin'].includes(profile.app_role)) {
    return <p className="text-apoio">{t('Esta tela é para o líder da prática.')}</p>
  }

  const waiting = people.filter((p) => p.assessment_status === 'enviada' || p.assessment_status === 'em_revisao').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2">{t('Avaliações')}</h1>
        <p className="text-apoio">
          {t('Abra uma pessoa para ver o currículo, os projetos e o mapa de skills. Sua nota fica ao lado da nota que ela deu, sem substituí-la.')}
          {' '}{waiting > 0 && <strong>{t('{n} esperando sua avaliação.', { n: waiting })}</strong>}
        </p>
      </div>
      <div className="w-full sm:w-80">
        <Input placeholder={t('Buscar por nome ou e-mail')} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <ErrorText>{error}</ErrorText>

      <div className="overflow-x-auto bg-white rounded-lg border border-midnight/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-apoio border-b border-midnight/10">
              <th className="p-3">{t('Pessoa')}</th>
              <th className="p-3">{t('Cargo · trilha · nível')}</th>
              <th className="p-3">{t('Situação')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => {
              const st = ASSESSMENT_STATUS[p.assessment_status ?? 'rascunho']
              return (
                <tr key={p.id} className="border-t border-midnight/10 align-top">
                  <td className="p-3">
                    <Link to={`/avaliacoes/${p.id}`} className="font-card font-semibold underline">{p.full_name || t('Sem nome')}</Link>
                    <p className="text-apoio">{p.email}</p>
                  </td>
                  <td className="p-3">{[p.job_title, t(p.track_name), t(p.level_name)].filter(Boolean).join(' · ') || '–'}</td>
                  <td className="p-3">
                    <Tag tone={st.tone}>{t(st.label)}</Tag>
                    {(p.assessment_status ?? 'rascunho') === 'rascunho' && (
                      <p className="text-apoio mt-1">
                        {p.skills_total > 0 && p.skills_self_rated === p.skills_total
                          ? t('Mapa completo; falta a pessoa clicar em Enviar')
                          : t('Mapa de skills: {a} de {b} com nota', { a: p.skills_self_rated, b: p.skills_total })}
                      </p>
                    )}
                  </td>
                </tr>
              )
            })}
            {shown.length === 0 && (
              <tr><td colSpan={3} className="p-3 text-apoio">{t('Ninguém da sua prática se cadastrou ainda.')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
