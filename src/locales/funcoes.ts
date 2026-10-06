import type { Dict } from '.'

/** Mensagens de erro devolvidas pelas Edge Functions ler-curriculo e analisar-perfil. */
export default {
  'Faça login de novo': { en: 'Please sign in again', es: 'Vuelve a iniciar sesión' },
  'Perfil não encontrado': { en: 'Profile not found', es: 'Perfil no encontrado' },
  'Dê nota a pelo menos algumas skills do mapa antes de pedir a análise.': {
    en: 'Rate at least a few skills on your map before asking for the analysis.',
    es: 'Califica al menos algunas skills del mapa antes de pedir el análisis.',
  },
  'A análise automática recusou estes dados': { en: 'The automatic analysis declined this data', es: 'El análisis automático rechazó estos datos' },
  'Muita gente pedindo análise ao mesmo tempo. Tente de novo em instantes.': {
    en: 'Too many people asking for an analysis right now. Try again in a moment.',
    es: 'Mucha gente está pidiendo un análisis al mismo tiempo. Inténtalo de nuevo en unos instantes.',
  },
  'Erro inesperado na análise': { en: 'Unexpected error in the analysis', es: 'Error inesperado en el análisis' },
  'Não foi possível montar a análise': { en: 'The analysis could not be put together', es: 'No fue posible armar el análisis' },
  'Análise feita, mas não foi possível salvar': { en: 'Analysis done, but it could not be saved', es: 'Análisis hecho, pero no fue posible guardarlo' },
  'import_id ausente': { en: 'import_id missing', es: 'falta import_id' },
  'Importação não encontrada': { en: 'Import not found', es: 'Importación no encontrada' },
  'Não foi possível ler o arquivo enviado': { en: 'The uploaded file could not be read', es: 'No fue posible leer el archivo enviado' },
  'Não foi possível abrir o arquivo Word. Salve como PDF e tente de novo.': {
    en: 'The Word file could not be opened. Save it as PDF and try again.',
    es: 'No fue posible abrir el archivo Word. Guárdalo como PDF e inténtalo de nuevo.',
  },
  'O arquivo Word não tem texto legível': { en: 'The Word file has no readable text', es: 'El archivo Word no tiene texto legible' },
  'A leitura automática recusou este arquivo': { en: 'The automatic reading declined this file', es: 'La lectura automática rechazó este archivo' },
  'Muita gente enviando ao mesmo tempo. Tente de novo em instantes.': {
    en: 'Too many people uploading right now. Try again in a moment.',
    es: 'Mucha gente enviando al mismo tiempo. Inténtalo de nuevo en unos instantes.',
  },
  'Erro inesperado na leitura do currículo': { en: 'Unexpected error reading the CV', es: 'Error inesperado al leer el currículum' },
  'Não foi possível entender o currículo': { en: 'The CV could not be understood', es: 'No fue posible entender el currículum' },
} satisfies Dict
