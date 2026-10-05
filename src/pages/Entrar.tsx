import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, ErrorText, Field, Input } from '../components/ui'
import { readOrigem } from '../lib/origem'
import { supabase } from '../lib/supabase'

/** Erro que o Supabase devolve no #hash quando um link de e-mail falha (ex.: expirado). */
function hashError(): string {
  const params = new URLSearchParams(window.location.hash.slice(1))
  return params.get('error_code') === 'otp_expired'
    ? 'Esse link expirou ou já foi usado. Use o código que chega no e-mail.'
    : params.get('error_description') ?? ''
}

/**
 * Entrada por código de 6 dígitos enviado por e-mail. Usamos código em vez de só o link
 * porque a segurança do e-mail corporativo costuma abrir o link antes da pessoa e invalidá-lo.
 */
export default function Entrar() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(hashError)
  const [busy, setBusy] = useState(false)

  async function sendCode(e?: FormEvent) {
    e?.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: window.location.origin,
        data: { origem: readOrigem() }, // usado só no primeiro cadastro
      },
    })
    setBusy(false)
    if (error) {
      setError(error.message.includes('corporativo')
        ? error.message
        : error.status === 429
          ? 'Muitas tentativas seguidas. Espere um minuto e tente de novo.'
          : 'Não foi possível enviar o código. Confira se é o seu e-mail corporativo e tente de novo.')
      return
    }
    setSent(true)
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.replace(/\D/g, ''),
      type: 'email',
    })
    setBusy(false)
    if (error) {
      setError('Código inválido ou expirado. Confira os números ou peça um código novo.')
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <p className="font-card text-sm text-preparacao uppercase tracking-wide">Design & Produto</p>
        <h1 className="mb-2">Career Paths</h1>
        <p className="text-apoio mb-8">
          Registre seu cargo, projetos, cursos, idiomas e seu mapa de skills. Serve para o seu PDI e para dar
          visibilidade aos pontos fortes do time. Não é avaliação de desempenho.
        </p>
        {sent ? (
          <form onSubmit={verify} className="space-y-4">
            <p>Enviamos um código para <strong>{email}</strong>. Ele vale por 1 hora.</p>
            <Field label="Código do e-mail">
              <Input inputMode="numeric" autoComplete="one-time-code" required autoFocus
                value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
            </Field>
            <ErrorText>{error}</ErrorText>
            <Button type="submit" disabled={busy || code.replace(/\D/g, '').length < 6} className="w-full">
              {busy ? 'Entrando…' : 'Entrar'}
            </Button>
            <div className="flex justify-between text-sm">
              <button type="button" className="underline text-apoio" onClick={() => { setSent(false); setCode('') }}>
                Trocar e-mail
              </button>
              <button type="button" className="underline text-apoio" disabled={busy} onClick={() => sendCode()}>
                Reenviar código
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={sendCode} className="space-y-4">
            <Field label="E-mail corporativo">
              <Input type="email" required autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="nome@empresa.com" />
            </Field>
            <ErrorText>{error}</ErrorText>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Enviando…' : 'Receber código de acesso'}
            </Button>
          </form>
        )}
      </div>
    </main>
  )
}
