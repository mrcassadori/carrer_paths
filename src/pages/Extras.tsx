import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, ErrorText, Field, Input, Select } from '../components/ui'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { LANGUAGE_LEVELS } from '../lib/types'

interface Language { language: string; level: string }

/** Passo 3: idiomas (o "item extra" do cadastro completo). Projetos, cursos e currículo entram nos próximos marcos. */
export default function Extras() {
  const { profile } = useAuth()
  const [items, setItems] = useState<Language[]>([])
  const [language, setLanguage] = useState('')
  const [level, setLevel] = useState('intermediario')
  const [error, setError] = useState('')

  const profileId = profile?.id
  const load = useCallback(async () => {
    if (!profileId) return
    const { data } = await supabase.from('profile_languages').select('language, level').eq('profile_id', profileId).order('language')
    setItems(data ?? [])
  }, [profileId])
  useEffect(() => { void load() }, [load])

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!profile || !language.trim()) return
    setError('')
    const { error } = await supabase.from('profile_languages')
      .upsert({ profile_id: profile.id, language: language.trim(), level })
    if (error) { setError(error.message); return }
    setLanguage('')
    load()
  }

  async function remove(lang: string) {
    if (!profile) return
    await supabase.from('profile_languages').delete().eq('profile_id', profile.id).eq('language', lang)
    load()
  }

  const levelLabel = (v: string) => LANGUAGE_LEVELS.find(([k]) => k === v)?.[1] ?? v

  return (
    <div className="max-w-3xl">
      <p className="font-card text-sm text-apoio">Passo 3 de 3</p>
      <h1 className="mb-6">Idiomas</h1>
      <Card title="Idiomas que você usa no trabalho">
        {items.length > 0 && (
          <ul className="divide-y divide-midnight/10 mb-4">
            {items.map((i) => (
              <li key={i.language} className="flex items-center justify-between py-2">
                <span><span className="font-card font-semibold">{i.language}</span> · {levelLabel(i.level)}</span>
                <button onClick={() => remove(i.language)} className="text-sm text-apoio underline">Remover</button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-[1fr_200px_auto] items-end">
          <Field label="Idioma"><Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="Ex.: Inglês" /></Field>
          <Field label="Nível">
            <Select value={level} onChange={(e) => setLevel(e.target.value)}>
              {LANGUAGE_LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          <Button type="submit">Adicionar</Button>
        </form>
        <ErrorText>{error}</ErrorText>
      </Card>
      <p className="text-apoio text-sm mt-4">Em breve: projetos e cases, cursos e certificados, e importação do currículo.</p>
      <Link to="/"><Button className="mt-6">Ver meu perfil</Button></Link>
    </div>
  )
}
