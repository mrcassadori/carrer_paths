import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }) {
  const base = 'rounded-md px-5 py-2.5 font-card font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed'
  const styles = variant === 'primary'
    ? 'bg-preparacao text-white hover:brightness-110'
    : 'border border-midnight/30 text-midnight hover:bg-midnight/5'
  return <button className={`${base} ${styles} ${className}`} {...props} />
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block font-card font-semibold text-sm mb-1">{label}</span>
      {children}
      {hint && <span className="block text-sm text-apoio mt-1">{hint}</span>}
    </label>
  )
}

const inputClass = 'w-full rounded-md border border-midnight/25 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-preparacao'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={inputClass} {...props} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={inputClass} rows={3} {...props} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={inputClass} {...props} />
}

/** Card branco com faixa superior na cor da fase/status. */
export function Card({ tone = 'preparacao', title, children, className = '' }: {
  tone?: 'preparacao' | 'seminario' | 'consolidacao' | 'pendencias'
  title?: ReactNode
  children: ReactNode
  className?: string
}) {
  const bar = {
    preparacao: 'border-t-preparacao',
    seminario: 'border-t-seminario',
    consolidacao: 'border-t-consolidacao',
    pendencias: 'border-t-pendencias',
  }[tone]
  return (
    <section className={`bg-white rounded-lg border border-midnight/10 border-t-4 ${bar} shadow-sm p-5 ${className}`}>
      {title && <h3 className="mb-3">{title}</h3>}
      {children}
    </section>
  )
}

export function Tag({ tone, children }: { tone: 'preparacao' | 'seminario' | 'consolidacao' | 'pendencias' | 'neutro'; children: ReactNode }) {
  const styles = {
    preparacao: 'bg-preparacao text-white',
    seminario: 'bg-seminario text-white',
    consolidacao: 'bg-consolidacao text-white',
    pendencias: 'bg-pendencias text-midnight',
    neutro: 'bg-midnight/10 text-midnight',
  }[tone]
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-card font-semibold ${styles}`}>{children}</span>
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p role="alert" className="text-sm text-midnight bg-pendencias/15 border-l-4 border-pendencias px-3 py-2 rounded">{children}</p>
}
