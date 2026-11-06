export function accountLabel(state) {
  if (!state?.loggedIn) return 'Entrar com Google'
  return state.email || state.displayName || 'Conta conectada'
}

export function mergeAccount(listed, menu, stored) {
  return {
    displayName: listed?.displayName || stored?.displayName || menu?.displayName || '',
    email: listed?.email || stored?.email || menu?.email || '',
    handle: menu?.handle || listed?.handle || stored?.handle || '',
    photoUrl: listed?.photoUrl || menu?.photoUrl || stored?.photoUrl || '',
  }
}
