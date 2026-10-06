// Análise do mapa de skills: cruza cargo atual, currículo (experiência, formação, cursos, idiomas),
// notas do mapa e projetos da pessoa logada. Só aponta coerências, lacunas e sugestões; nunca muda nota.
// Roda com o login de quem chamou (o RLS vale aqui) e guarda só a análise mais recente.
// Segredo necessário: ANTHROPIC_API_KEY (o mesmo da ler-curriculo).
import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0'
import { betaZodOutputFormat } from 'npm:@anthropic-ai/sdk@0.131.0/helpers/beta/zod'
import { z } from 'npm:zod@4.6.5'
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const Item = z.object({
  titulo: z.string().describe('Frase curta, até 8 palavras'),
  detalhe: z.string().describe('Até 3 frases, citando skill, nota, projeto ou experiência que sustentam o ponto'),
})
const Analise = z.object({
  resumo: z.string().describe('Visão geral em até 4 frases'),
  pontos_fortes: z.array(Item).describe('3 a 5 itens'),
  pontos_de_atencao: z.array(Item).describe('3 a 5 itens: notas sem sustentação, lacunas para o nível, incoerências'),
  sugestoes_pdi: z.array(Item).describe('3 a 5 ações práticas para o PDI'),
})

const SYSTEM = `Você apoia o PDI de pessoas do time de Design e Produto na plataforma Career Paths.
Recebe o cargo atual, a trilha e o nível, o currículo, os projetos e o mapa de skills (nota de 0 a 5 que a própria pessoa deu,
nota esperada para o nível, meta e, se houver, a nota do líder da prática).
Cruze essas fontes e escreva em português, falando diretamente com a pessoa ("você"), em tom construtivo e específico:
- Pontos fortes: onde notas altas são sustentadas por experiência, formação ou projetos.
- Pontos de atenção: notas altas sem evidência no currículo ou nos projetos, notas abaixo do esperado para o nível,
  diferenças grandes entre a nota da pessoa e a do líder, ou coisas do currículo que não aparecem no mapa.
- Sugestões de PDI: ações práticas (projeto, curso, mentoria, prática) ligadas às lacunas, pensando no próximo nível.
Regras: cite nomes de skills e projetos reais dos dados. Não invente fatos. Nunca sugira uma nota nova nem diga qual nota
a pessoa "deveria" ter; a nota é decisão da pessoa e do líder. Não fale de salário ou promoção como certeza.
Se faltar dado (sem currículo, sem projetos, mapa incompleto), diga isso no resumo e trabalhe com o que existe.`

const fmtDate = (d: string | null) => (d ? d.slice(0, 7) : '?')

// Preço por milhão de tokens (entrada, saída) em dólar. Com "fallbacks", outra versão do modelo pode responder.
const PRICES: Record<string, [number, number]> = {
  'claude-opus-5-5': [4, 20],
  'claude-opus-5': [5, 25],
  'claude-opus-4-8': [5, 25],
  'claude-sonnet-5-5': [2, 10],
}

/** Registra tokens e custo estimado da chamada para o contador do painel de Adoção. Nunca derruba a função. */
// deno-lint-ignore no-explicit-any
async function logUsage(supabase: any, feature: string, response: Anthropic.Beta.BetaMessage) {
  try {
    const u = response.usage
    const [pin, pout] = PRICES[response.model] ?? [5, 25]
    const cacheWrite = u.cache_creation_input_tokens ?? 0
    const cacheRead = u.cache_read_input_tokens ?? 0
    const cost = (u.input_tokens * pin + cacheWrite * pin * 1.25 + cacheRead * pin * 0.1 + u.output_tokens * pout) / 1e6
    await supabase.from('ai_usage').insert({
      feature, model: response.model, input_tokens: u.input_tokens + cacheWrite + cacheRead,
      output_tokens: u.output_tokens, cost_usd: Number(cost.toFixed(4)),
    })
  } catch (e) {
    console.error('Falha ao registrar uso da IA', e)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    return await handle(req)
  } catch (e) {
    console.error(e)
    return json({ error: 'Erro inesperado na análise' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

async function handle(req: Request): Promise<Response> {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return json({ error: 'Faça login de novo' }, 401)
  const id = user.id

  const { data: p } = await supabase.from('profile_overview')
    .select('job_title, track_id, track_name, level_id, level_name, months_at_company, months_in_level, assessment_id')
    .eq('id', id).single()
  if (!p) return json({ error: 'Perfil não encontrado' }, 404)
  const { data: prof } = await supabase.from('profiles').select('job_summary').eq('id', id).single()

  const [career, courses, langs, projects, scores, expected] = await Promise.all([
    supabase.from('career_entries').select('company, job_title, started_on, ended_on, description').eq('profile_id', id),
    supabase.from('courses').select('kind, name, institution, completed_on').eq('profile_id', id),
    supabase.from('profile_languages').select('language, level').eq('profile_id', id),
    supabase.from('projects').select('title, client, role_in_project, summary, started_on, ended_on, is_case, project_skills(skill:skills(name))').eq('profile_id', id),
    p.assessment_id
      ? supabase.from('assessment_scores')
        .select('skill_id, self_score, target_score, leader_score, justification, skill:skills(name, active, category:skill_categories(name, kind))')
        .eq('assessment_id', p.assessment_id)
      : Promise.resolve({ data: [] as never[] }),
    p.track_id && p.level_id
      ? supabase.from('skill_expectations').select('skill_id, expected_level').eq('track_id', p.track_id).eq('level_id', p.level_id)
      : Promise.resolve({ data: [] as never[] }),
  ])

  // deno-lint-ignore no-explicit-any
  const rows = ((scores.data ?? []) as any[]).filter((r) => r.skill?.active)
  if (rows.filter((r) => r.self_score !== null).length < 5) {
    return json({ error: 'Dê nota a pelo menos algumas skills do mapa antes de pedir a análise.' }, 422)
  }
  const exp = Object.fromEntries((expected.data ?? []).map((e: { skill_id: string; expected_level: number }) => [e.skill_id, e.expected_level]))

  const anos = (m: number | null) => (m === null ? '?' : `${Math.floor(m / 12)} anos e ${m % 12} meses`)
  const text = [
    `CARGO ATUAL: ${p.job_title ?? '?'} · trilha ${p.track_name ?? '?'} · nível ${p.level_name ?? '?'}`,
    `Descrição da atuação: ${prof?.job_summary ?? '—'}`,
    `Tempo de casa: ${anos(p.months_at_company)} · no cargo: ${anos(p.months_in_level)}`,
    '',
    'EXPERIÊNCIA (currículo):',
    ...(career.data ?? []).map((c) => `- ${c.company}${c.job_title ? `, ${c.job_title}` : ''} (${fmtDate(c.started_on)} a ${c.ended_on ? fmtDate(c.ended_on) : 'atual'})${c.description ? `: ${c.description}` : ''}`),
    (career.data ?? []).length ? '' : '- (nada cadastrado)',
    'FORMAÇÃO E CURSOS:',
    ...(courses.data ?? []).map((c) => `- [${c.kind}] ${c.name}${c.institution ? `, ${c.institution}` : ''}${c.completed_on ? ` (${fmtDate(c.completed_on)})` : ''}`),
    (courses.data ?? []).length ? '' : '- (nada cadastrado)',
    `IDIOMAS: ${(langs.data ?? []).map((l) => `${l.language} (${l.level})`).join(', ') || '—'}`,
    '',
    'PROJETOS:',
    // deno-lint-ignore no-explicit-any
    ...((projects.data ?? []) as any[]).map((pr) => `- ${pr.title}${pr.is_case ? ' [case]' : ''}${pr.client ? `, ${pr.client}` : ''}${pr.role_in_project ? `, papel: ${pr.role_in_project}` : ''}${pr.summary ? `. ${pr.summary}` : ''}${pr.project_skills?.length ? ` Skills: ${pr.project_skills.map((s: { skill: { name: string } }) => s.skill?.name).join(', ')}` : ''}`),
    (projects.data ?? []).length ? '' : '- (nada cadastrado)',
    '',
    'MAPA DE SKILLS (categoria | skill | nota da pessoa | esperado no nível | meta | nota do líder | justificativa do líder):',
    ...rows.map((r) => [r.skill.category.name + (r.skill.category.kind === 'soft' ? ' (soft)' : ''), r.skill.name,
      r.self_score ?? '-', exp[r.skill_id] ?? '-', r.target_score ?? '-', r.leader_score ?? '-', r.justification ?? ''].join(' | ')),
  ].join('\n')

  const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })
  let parsed: z.infer<typeof Analise> | null
  try {
    const response = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(Analise) },
      system: SYSTEM,
      messages: [{ role: 'user', content: text }],
    })
    await logUsage(supabase, 'analisar-perfil', response)
    if (response.stop_reason === 'refusal') return json({ error: 'A análise automática recusou estes dados' }, 422)
    parsed = response.parsed_output
  } catch (e) {
    console.error(e)
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'Muita gente pedindo análise ao mesmo tempo. Tente de novo em instantes.' }, 429)
    if (e instanceof Anthropic.APIError) return json({ error: `Erro na análise automática (${e.status})` }, 502)
    return json({ error: 'Erro inesperado na análise' }, 500)
  }
  if (!parsed) return json({ error: 'Não foi possível montar a análise' }, 502)

  const { data: saved, error } = await supabase.from('profile_analyses')
    .insert({ profile_id: id, content: parsed }).select('id, created_at').single()
  if (error || !saved) return json({ error: 'Análise feita, mas não foi possível salvar' }, 500)
  await supabase.from('profile_analyses').delete().eq('profile_id', id).neq('id', saved.id)
  return json({ analysis: { ...saved, content: parsed } })
}
