/** Cada arquivo desta pasta exporta { 'texto em português': { en, es } }. */
export type Entry = { en: string; es: string }
export type Dict = Record<string, Entry>

const files = import.meta.glob<{ default: Dict }>('./*.ts', { eager: true })

export const DICT: Dict = Object.assign({}, ...Object.entries(files)
  .filter(([path]) => !path.endsWith('/index.ts'))
  .map(([, mod]) => mod.default))
