import { useCallback, useEffect, useMemo, useState } from 'react'
import { ErrorText, Input, Tag } from '../components/ui'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { ROLE_LABEL, type AppRole } from '../lib/types'

interface Person {
  id: string
  full_name: string
  email: string
  app_role: AppRole
  job_title: string | null
  track_name: string | null
  level_name: string | null
  is_complete: boolean
  skills_self_rated: number
  skills_total: number
}

const ROLES = Object.keys(ROLE_LABEL) as AppRole[]

/** Só admin: lista de quem tem conta e troca de papel (gestor, líder, especialista) sem SQL. */
export default function Pessoas() {
  const { profile } = useAuth()
  const { t } = useI18n()
  const [people, setPeople] = useState<Person[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('profile_overview')
      .select('id, full_name, email, app_role, job_title, track_name, level_name, is_complete, skills_self_rated, skills_total')
      .order('full_name')
    if (error) setError(error.message)
    setPeople(data ?? [])
  }, [])
  useEffect(() => { void load() }, [load])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? people.filter((p) => `${p.full_name} ${p.email}`.toLowerCase().includes(q)) : people
  }, [people, query])

  async function changeRole(p: Person, role: AppRole) {
    setError('')
    setSaved('')
    const { error } = await supabase.from('profiles').update({ app_role: role }).eq('id', p.id)
    if (error) { setError(error.message); return }
    setSaved(t('{name} agora é {role}.', { name: p.full_name || p.email, role: t(ROLE_LABEL[role]).toLowerCase() }))
    load()
  }

  if (profile?.app_role !== 'admin') return <p className="text-apoio">{t('Esta tela é só para admin.')}</p>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2">{t('Pessoas')}</h1>
        <p className="text-apoio">
          {t('Quem já criou conta. Torne gestor quem deve aparecer na lista de gestores do cadastro, e líder da prática quem vai validar as notas.')}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="w-full sm:w-80">
          <Input placeholder={t('Buscar por nome ou e-mail')} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <span className="text-sm text-apoio">{t('{n} contas', { n: people.length })}</span>
      </div>
      <ErrorText>{t(error)}</ErrorText>
      {saved && <p role="status" className="text-sm bg-consolidacao/10 border-l-4 border-consolidacao px-3 py-2 rounded">{saved}</p>}

      <div className="overflow-x-auto bg-white rounded-lg border border-midnight/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-apoio border-b border-midnight/10">
              <th className="p-3">{t('Pessoa')}</th>
              <th className="p-3">{t('Cargo · trilha · nível')}</th>
              <th className="p-3">{t('Cadastro')}</th>
              <th className="p-3">{t('Papel')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id} className="border-t border-midnight/10 align-top">
                <td className="p-3">
                  <p className="font-card font-semibold">{p.full_name || t('Sem nome')}</p>
                  <p className="text-apoio">{p.email}</p>
                </td>
                <td className="p-3">{[p.job_title, t(p.track_name), t(p.level_name)].filter(Boolean).join(' · ') || '–'}</td>
                <td className="p-3">
                  {p.is_complete
                    ? <Tag tone="consolidacao">{t('Completo')}</Tag>
                    : <Tag tone="neutro">{t('Skills {a}/{b}', { a: p.skills_self_rated, b: p.skills_total })}</Tag>}
                </td>
                <td className="p-3">
                  <select value={p.app_role} disabled={p.id === profile.id}
                    onChange={(e) => changeRole(p, e.target.value as AppRole)}
                    className="rounded-md border border-midnight/25 px-2 py-1 bg-white disabled:opacity-60"
                    title={p.id === profile.id ? t('Você não pode mudar o próprio papel') : undefined}>
                    {ROLES.map((r) => <option key={r} value={r}>{t(ROLE_LABEL[r])}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
