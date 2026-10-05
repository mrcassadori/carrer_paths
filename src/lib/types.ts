export type AppRole = 'colaborador' | 'especialista' | 'gestor' | 'lider_pratica' | 'admin'
export type Weight = 'nucleo' | 'complementar' | 'exposicao'

export interface Profile {
  id: string
  email: string
  full_name: string
  app_role: AppRole
  manager_id: string | null
  track_id: string | null
  secondary_track_id: string | null
  level_id: string | null
  job_title: string | null
  job_summary: string | null
  hire_date: string | null
  level_since: string | null
  first_login_at: string | null
}

export interface Track { id: string; slug: string; name: string; description: string | null }
export interface Level { id: string; code: string; name: string; rank: number; description: string | null }
export interface ScaleLevel { score: number; label: string; description: string; min_evidence: string | null }

export interface ScoreRow {
  skill_id: string
  self_score: number | null
  target_score: number | null
  skill: {
    name: string
    description: string | null
    sort_order: number
    active: boolean
    category: { name: string; kind: 'hard' | 'soft'; sort_order: number }
  }
}

export const WEIGHT_LABEL: Record<Weight, string> = {
  nucleo: 'Núcleo',
  complementar: 'Complementar',
  exposicao: 'Exposição',
}

export const LANGUAGE_LEVELS = [
  ['basico', 'Básico'],
  ['intermediario', 'Intermediário'],
  ['avancado', 'Avançado'],
  ['fluente', 'Fluente'],
  ['nativo', 'Nativo'],
] as const

export function hasBasics(p: Profile | null): boolean {
  return Boolean(
    p && p.full_name && p.job_title && p.job_summary &&
      p.hire_date && p.level_since && p.track_id && p.level_id,
  )
}
