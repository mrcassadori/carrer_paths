// Lê o currículo enviado (PDF ou DOCX) e devolve SUGESTÕES de cargo, resumo, projetos, cursos e idiomas.
// Nunca sugere notas de skill. Roda com o login de quem chamou, então o RLS do banco vale aqui também.
// Segredo necessário: ANTHROPIC_API_KEY (Edge Functions > Secrets).
import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0'
import { betaZodOutputFormat } from 'npm:@anthropic-ai/sdk@0.131.0/helpers/beta/zod'
import { z } from 'npm:zod@4.6.5'
import mammoth from 'npm:mammoth@1.11.0'
import { Buffer } from 'node:buffer'
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const data = z.string().nullable().describe('Data no formato AAAA-MM-DD; use dia 01 se só souber mês e ano; null se não constar')

const Sugestoes = z.object({
  job_title: z.string().nullable().describe('Cargo atual, como aparece no currículo'),
  job_summary: z.string().nullable().describe('Resumo da atuação atual em até 3 frases, em português'),
  languages: z.array(z.object({
    language: z.string().describe('Nome do idioma em português, ex.: Inglês'),
    level: z.string().describe('Um de: basico, intermediario, avancado, fluente, nativo'),
  })),
  projects: z.array(z.object({
    title: z.string(),
    client: z.string().nullable().describe('Cliente, empresa ou área'),
    role_in_project: z.string().nullable(),
    summary: z.string().nullable().describe('Contexto, desafio e resultado, em até 3 frases'),
    started_on: data,
    ended_on: data,
    skill_slugs: z.array(z.string()).describe('Slugs do catálogo de skills usadas no projeto, só os que o texto sustenta'),
  })),
  courses: z.array(z.object({
    kind: z.string().describe('Um de: curso, certificacao, graduacao, pos_graduacao, outro'),
    name: z.string(),
    institution: z.string().nullable(),
    completed_on: data,
    workload_hours: z.number().int().nullable(),
  })),
})

const SYSTEM = `Você extrai informações de currículos para a plataforma Career Paths, usada pelo time de Design e Produto.
Devolva só o que o currículo sustenta; não invente datas, clientes nem resultados. Escreva em português.
Projetos: experiências relevantes dos últimos anos (cada emprego ou projeto marcante vira um item), no máximo 12.
Cursos: formação acadêmica, cursos e certificações.
Skills: escolha apenas slugs da lista do catálogo enviada junto. Nunca atribua notas ou níveis de skill.`

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const okDate = (d: string | null) => (d && DATE_RE.test(d) ? d : null)
const LEVELS = ['basico', 'intermediario', 'avancado', 'fluente', 'nativo']
const KINDS = ['curso', 'certificacao', 'graduacao', 'pos_graduacao', 'outro']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    return await handle(req)
  } catch (e) {
    console.error(e)
    return new Response(JSON.stringify({ error: 'Erro inesperado na leitura do currículo' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})

async function handle(req: Request): Promise<Response> {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })

  const { import_id } = await req.json().catch(() => ({}))
  if (!import_id) return json({ error: 'import_id ausente' }, 400)

  const { data: imp, error: impErr } = await supabase.from('resume_imports').select('*').eq('id', import_id).single()
  if (impErr || !imp) return json({ error: 'Importação não encontrada' }, 404)

  const fail = async (message: string, status = 500) => {
    await supabase.from('resume_imports').update({ status: 'erro', error: message }).eq('id', import_id)
    return json({ error: message }, status)
  }

  await supabase.from('resume_imports').update({ status: 'processando', error: null }).eq('id', import_id)

  const { data: file, error: dlErr } = await supabase.storage.from('resumes').download(imp.storage_path)
  if (dlErr || !file) return fail('Não foi possível ler o arquivo enviado')
  const bytes = new Uint8Array(await file.arrayBuffer())

  let documentBlock: Anthropic.Beta.BetaContentBlockParam
  if (imp.mime_type === 'application/pdf') {
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    documentBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: btoa(bin) } }
  } else {
    // No Supabase o mammoth roda na versão Node, que só aceita { buffer } (Buffer), não { arrayBuffer }
    let value = ''
    try {
      value = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value
    } catch {
      return fail('Não foi possível abrir o arquivo Word. Salve como PDF e tente de novo.', 422)
    }
    if (!value.trim()) return fail('O arquivo Word não tem texto legível', 422)
    documentBlock = { type: 'document', source: { type: 'text', media_type: 'text/plain', data: value } }
  }

  const { data: skills } = await supabase.from('skills').select('slug, name').eq('active', true)
  const catalog = (skills ?? []).map((s) => `${s.slug}: ${s.name}`).join('\n')
  const validSlugs = new Set((skills ?? []).map((s) => s.slug))

  const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })
  let parsed: z.infer<typeof Sugestoes> | null
  try {
    const response = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(Sugestoes) },
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          documentBlock,
          { type: 'text', text: `Catálogo de skills (slug: nome):\n${catalog}\n\nExtraia as sugestões deste currículo.` },
        ],
      }],
    })
    if (response.stop_reason === 'refusal') return fail('A leitura automática recusou este arquivo', 422)
    parsed = response.parsed_output
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return fail('Muita gente enviando ao mesmo tempo. Tente de novo em instantes.', 429)
    if (e instanceof Anthropic.APIError) return fail(`Erro na leitura automática (${e.status})`)
    return fail('Erro inesperado na leitura do currículo')
  }
  if (!parsed) return fail('Não foi possível entender o currículo')

  const extracted = {
    ...parsed,
    languages: parsed.languages.map((l) => ({ ...l, level: LEVELS.includes(l.level) ? l.level : 'intermediario' })),
    projects: parsed.projects.map((p) => ({
      ...p,
      started_on: okDate(p.started_on),
      ended_on: okDate(p.ended_on),
      skill_slugs: p.skill_slugs.filter((s) => validSlugs.has(s)),
    })),
    courses: parsed.courses.map((c) => ({ ...c, kind: KINDS.includes(c.kind) ? c.kind : 'outro', completed_on: okDate(c.completed_on) })),
  }
  await supabase.from('resume_imports')
    .update({ status: 'pronto_para_revisao', extracted, error: null }).eq('id', import_id)
  return json({ extracted })
}
