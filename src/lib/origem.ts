const ORIGEM_KEY = 'cp_origem'

/** Guarda a etiqueta ?origem= do link de divulgação para mandar junto no cadastro. */
export function captureOrigem() {
  const origem = new URLSearchParams(window.location.search).get('origem')
  if (origem) {
    try { localStorage.setItem(ORIGEM_KEY, origem) } catch { /* modo privado */ }
  }
}

export function readOrigem(): string | undefined {
  try { return localStorage.getItem(ORIGEM_KEY) ?? undefined } catch { return undefined }
}
