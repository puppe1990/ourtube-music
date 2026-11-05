export function accountLabel(state) {
  if (!state?.loggedIn) return 'Entrar com Google'
  return state.displayName || 'Conta conectada'
}
