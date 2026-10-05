import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, ErrorText, Field, Input } from '../components/ui'
import { readOrigem } from '../lib/origem'
import { supabase } from '../lib/supabase'

type Mode = 'entrar' | 'criar'

/**
 * Entrada por e-mail e senha, sem confirmação por e-mail (desligada no Supabase).
 * O domínio corporativo continua sendo checado pelo hook before-user-created.
 */
export default function Entrar() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('entrar')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function switchMode(next: Mode) {
    setMode(next)
    setError('')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const cleanEmail = email.trim().toLowerCase()

    if (mode === 'criar') {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: { data: { full_name: name.trim(), origem: readOrigem() } },
      })
      setBusy(false)
      if (error) {
        const msg = error.message.toLowerCase()
        setError(error.message.includes('corporativo')
          ? error.message
          : msg.includes('already registered')
            ? 'Esse e-mail já tem conta. Use "Já tenho conta" para entrar.'
            : msg.includes('password')
              ? 'A senha precisa ter pelo menos 8 caracteres.'
              : 'Não foi possível criar a conta. Confira se é o seu e-mail corporativo e tente de novo.')
        return
      }
      if (!data.session) {
        setError('Conta criada, mas o acesso ainda pede confirmação por e-mail. Avise o Massao.')
        return
      }
      navigate('/', { replace: true })
      return
    }

    const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
    setBusy(false)
    if (error) {
      setError('E-mail ou senha incorretos. Se ainda não tem conta, use "Criar conta".')
      return
    }
    navigate('/', { replace: true })
  }

  const criando = mode === 'criar'

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <p className="font-card text-sm text-preparacao uppercase tracking-wide">Design & Produto</p>
        <h1 className="mb-2">Career Paths</h1>
        <p className="text-apoio mb-8">
          Registre seu cargo, projetos, cursos, idiomas e seu mapa de skills. Serve para o seu PDI e para dar
          visibilidade aos pontos fortes do time. Não é avaliação de desempenho.
        </p>

        <div className="flex gap-6 mb-6 border-b border-midnight/10">
          {(['entrar', 'criar'] as const).map((m) => (
            <button key={m} type="button" onClick={() => switchMode(m)}
              className={`pb-2 font-card font-semibold -mb-px border-b-2 ${mode === m
                ? 'border-preparacao text-midnight'
                : 'border-transparent text-apoio'}`}>
              {m === 'entrar' ? 'Já tenho conta' : 'Criar conta'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          {criando && (
            <Field label="Nome completo">
              <Input required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          )}
          <Field label="E-mail corporativo">
            <Input type="email" required autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="nome@stefanini.com" />
          </Field>
          <Field label={criando ? 'Crie uma senha (mínimo 8 caracteres)' : 'Senha'}>
            <Input type="password" required minLength={criando ? 8 : undefined}
              autoComplete={criando ? 'new-password' : 'current-password'}
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Aguarde…' : criando ? 'Criar conta' : 'Entrar'}
          </Button>
        </form>
      </div>
    </main>
  )
}
