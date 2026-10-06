import { FunctionsHttpError } from '@supabase/supabase-js'
import { useCallback, useEffect, useState } from 'react'
import { Button, Card, ErrorText } from './ui'
import { supabase } from '../lib/supabase'
import { useI18n } from '../lib/i18n'

interface Item { titulo: string; detalhe: string }
interface Content { resumo: string; pontos_fortes: Item[]; pontos_de_atencao: Item[]; sugestoes_pdi: Item[] }
interface Analysis { id: string; created_at: string; content: Content }

const SECTIONS: { key: keyof Omit<Content, 'resumo'>; title: string; bar: string }[] = [
  { key: 'pontos_fortes', title: 'Pontos fortes', bar: 'border-consolidacao' },
  { key: 'pontos_de_atencao', title: 'Pontos de atenção', bar: 'border-pendencias' },
  { key: 'sugestoes_pdi', title: 'Sugestões para o PDI', bar: 'border-seminario' },
]

/**
 * Análise por IA que cruza cargo, currículo, mapa de skills e projetos. A própria pessoa gera;
 * gestor, líder e admin só leem a mais recente. Nunca muda nota.
 */
export default function AnaliseIA({ profileId, canGenerate }: { profileId: string; canGenerate: boolean }) {
  const { t, locale, dateLocale } = useI18n()
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('profile_analyses').select('id, created_at, content')
      .eq('profile_id', profileId).order('created_at', { ascending: false }).limit(1)
    setAnalysis((data?.[0] as Analysis | undefined) ?? null)
  }, [profileId])
  useEffect(() => { void load() }, [load])

  async function generate() {
    setBusy(true)
    setError('')
    const { data, error } = await supabase.functions.invoke('analisar-perfil', { body: { locale } })
    setBusy(false)
    if (error) {
      const body = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null
      setError(body?.error ? t(body.error) : t('Não foi possível gerar a análise. Tente de novo. ({erro})', { erro: error.message }))
      return
    }
    setAnalysis(data.analysis)
  }

  const c = analysis?.content
  return (
    <Card tone="seminario" title={t('Análise do seu perfil por IA')}>
      <p className="text-sm text-apoio mb-4">
        {canGenerate
          ? t('A IA cruza seu cargo, currículo, mapa de skills e projetos e aponta pontos fortes, pontos de atenção e ideias para o PDI. Ela não muda nenhuma nota.')
          : t('Análise gerada pela própria pessoa. A IA cruza cargo, currículo, mapa de skills e projetos; não muda nenhuma nota.')}
      </p>
      {c ? (
        <div className="space-y-5">
          <p className="text-sm">{c.resumo}</p>
          {SECTIONS.map((s) => c[s.key]?.length > 0 && (
            <div key={s.key}>
              <p className="font-card font-semibold mb-2">{t(s.title)}</p>
              <ul className="space-y-2">
                {c[s.key].map((it, i) => (
                  <li key={i} className={`border-l-4 ${s.bar} pl-3 text-sm`}>
                    <p className="font-card font-semibold">{it.titulo}</p>
                    <p>{it.detalhe}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-xs text-apoio">{t('Gerada em {data}. Confira antes de usar; a IA pode errar.', { data: new Date(analysis!.created_at).toLocaleString(dateLocale) })}</p>
        </div>
      ) : (
        !canGenerate && <p className="text-sm text-apoio">{t('A pessoa ainda não gerou uma análise.')}</p>
      )}
      <ErrorText>{error}</ErrorText>
      {canGenerate && (
        <div className="mt-4 flex items-center gap-3">
          <Button type="button" onClick={generate} disabled={busy}>
            {busy ? t('Analisando…') : c ? t('Atualizar análise') : t('Gerar análise')}
          </Button>
          {busy && <span className="text-sm text-apoio">{t('Isso leva menos de um minuto.')}</span>}
        </div>
      )}
    </Card>
  )
}
