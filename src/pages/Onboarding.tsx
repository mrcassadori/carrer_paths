import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import MeuCurriculo from '../components/MeuCurriculo'
import { Button, Card, ErrorText, Field, Input, Select, Textarea } from '../components/ui'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { tempoDesde } from '../lib/time'
import type { Level, Track } from '../lib/types'

interface Manager { id: string; full_name: string }

/** Passo 1 do cadastro: dados básicos que definem a nota esperada e o tempo de casa/cargo, e no final o currículo. */
export default function Onboarding() {
  const { profile, reloadProfile } = useAuth()
  const navigate = useNavigate()
  const { hash } = useLocation()
  const [tracks, setTracks] = useState<Track[]>([])
  const [levels, setLevels] = useState<Level[]>([])
  const [managers, setManagers] = useState<Manager[]>([])
  const [form, setForm] = useState({
    full_name: profile?.full_name ?? '',
    manager_id: profile?.manager_id ?? '',
    job_title: profile?.job_title ?? '',
    job_summary: profile?.job_summary ?? '',
    hire_date: profile?.hire_date ?? '',
    level_since: profile?.level_since ?? '',
    track_id: profile?.track_id ?? '',
    secondary_track_id: profile?.secondary_track_id ?? '',
    level_id: profile?.level_id ?? '',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Depois de salvos, gestor/trilha/nível só mudam pelo líder da prática (regra do banco)
  const locked = {
    manager_id: Boolean(profile?.manager_id),
    track_id: Boolean(profile?.track_id),
    level_id: Boolean(profile?.level_id),
  }

  useEffect(() => {
    supabase.from('career_tracks').select('*').order('name').then(({ data }) => setTracks(data ?? []))
    supabase.from('career_levels').select('*').order('rank').order('code').then(({ data }) => setLevels(data ?? []))
    supabase.rpc('list_managers').then(({ data }) => setManagers((data ?? []).filter((m: Manager) => m.id !== profile?.id)))
  }, [profile?.id])

  // Links para /cadastro#curriculo (Meu perfil, Mapa de skills) descem até a seção do currículo
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' })
  }, [hash])

  // A leitura do currículo preenche cargo e descrição quando estão vazios; traz para o formulário sem apagar o que foi digitado
  const filledJobTitle = profile?.job_title
  const filledJobSummary = profile?.job_summary
  useEffect(() => {
    setForm((f) => ({
      ...f,
      job_title: f.job_title || filledJobTitle || '',
      job_summary: f.job_summary || filledJobSummary || '',
    }))
  }, [filledJobTitle, filledJobSummary])

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    setError('')
    const update = Object.fromEntries(
      Object.entries(form)
        .filter(([k]) => !(k in locked && locked[k as keyof typeof locked]))
        .map(([k, v]) => [k, v === '' ? null : v]),
    )
    const { error } = await supabase.from('profiles').update(update).eq('id', profile.id)
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    await reloadProfile()
    navigate('/skills')
  }

  const level = levels.find((l) => l.id === form.level_id)
  const track = tracks.find((t) => t.id === form.track_id)

  return (
    <div className="max-w-3xl">
      <p className="font-card text-sm text-apoio">Passo 1 de 3</p>
      <h1 className="mb-6">Sobre você</h1>
      <form id="sobre-voce" onSubmit={submit} className="space-y-6">
        <Card title="Quem é você">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome completo">
              <Input required value={form.full_name} onChange={set('full_name')} />
            </Field>
            <Field label="Seu gestor (opcional)" hint={locked.manager_id ? undefined : 'Se o seu gestor não aparecer, deixe em branco e escolha depois.'}>
              <Select value={form.manager_id} onChange={set('manager_id')} disabled={locked.manager_id}>
                <option value="">Selecione</option>
                {managers.map((m) => <option key={m.id} value={m.id}>{m.full_name || 'Sem nome'}</option>)}
              </Select>
            </Field>
          </div>
        </Card>

        <Card title="Cargo e tempo">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cargo">
              <Input required value={form.job_title} onChange={set('job_title')} placeholder="Ex.: Product Designer Pleno" />
            </Field>
            <div />
            <div className="sm:col-span-2">
              <Field label="Pequena descrição da sua atuação">
                <Textarea required value={form.job_summary} onChange={set('job_summary')}
                  placeholder="Ex.: Squad de pagamentos, do discovery ao handover para engenharia." />
              </Field>
            </div>
            <Field label="Entrada na empresa" hint={`Tempo de casa: ${tempoDesde(form.hire_date)}`}>
              <Input type="date" required value={form.hire_date} onChange={set('hire_date')} />
            </Field>
            <Field label="Entrada no cargo atual" hint={`Tempo no cargo: ${tempoDesde(form.level_since)}`}>
              <Input type="date" required value={form.level_since} onChange={set('level_since')} />
            </Field>
          </div>
        </Card>

        <Card title="Trilha e nível">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Trilha principal" hint={track?.description ?? undefined}>
              <Select required value={form.track_id} onChange={set('track_id')} disabled={locked.track_id}>
                <option value="">Selecione</option>
                {tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            <Field label="Trilha secundária (opcional)">
              <Select value={form.secondary_track_id} onChange={set('secondary_track_id')}>
                <option value="">Nenhuma</option>
                {tracks.filter((t) => t.id !== form.track_id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            <Field label="Nível atual" hint={level?.description ?? undefined}>
              <Select required value={form.level_id} onChange={set('level_id')} disabled={locked.level_id}>
                <option value="">Selecione</option>
                {levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </Field>
          </div>
          {(locked.track_id || locked.manager_id) && (
            <p className="text-sm text-apoio mt-3">Gestor, trilha e nível só mudam com o líder da prática.</p>
          )}
        </Card>
      </form>

      {/* Fora do <form> principal: o currículo tem formulários próprios e salva cada item na hora */}
      <div className="mt-6">
        <MeuCurriculo />
      </div>

      <div className="mt-6 space-y-3">
        <ErrorText>{error}</ErrorText>
        <Button type="submit" form="sobre-voce" disabled={busy}>{busy ? 'Salvando…' : 'Salvar e ir para o mapa de skills'}</Button>
      </div>
    </div>
  )
}
