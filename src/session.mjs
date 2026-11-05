export function accountLabel(state) {
  if (!state?.loggedIn) return 'Entrar com Google'
  return state.displayName || 'Conta conectada'
}

export function pollLabel(status, detail) {
  if (status === 'pending') return 'Aguardando você autorizar no Google…'
  if (status === 'slow_down') return 'O Google pediu para esperar um pouco…'
  if (status === 'authorized') return 'Autorizado!'
  return String(detail ?? status ?? 'falha ao autorizar')
}
