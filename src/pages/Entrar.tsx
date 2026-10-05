import { useState, type FormEvent } from 'react'
import { Button, ErrorText, Field, Input } from '../components/ui'
import { readOrigem } from '../lib/origem'
import { supabase } from '../lib/supabase'

export default function Entrar() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
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
        : 'Não foi possível enviar o link. Confira se é o seu e-mail corporativo e tente de novo.')
      return
    }
    setSent(true)
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
          <div className="border-l-4 border-consolidacao bg-consolidacao/10 px-4 py-3 rounded">
            <p className="font-card font-semibold">Enviamos um link de acesso para {email}.</p>
            <p className="text-sm text-apoio mt-1">Abra o e-mail neste mesmo navegador. O link vale por 1 hora.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field label="E-mail corporativo">
              <Input type="email" required autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="nome@empresa.com" />
            </Field>
            <ErrorText>{error}</ErrorText>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Enviando…' : 'Receber link de acesso'}
            </Button>
          </form>
        )}
      </div>
    </main>
  )
}
