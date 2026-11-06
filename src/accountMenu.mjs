import { accountLabel } from './session.mjs'

const MANAGE_URL = 'https://myaccount.google.com/'

const SWITCH_ICON =
  '<span class="account-menu-glyph" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="8" r="3"/><path d="M4 19c0-2.8 2.2-5 5-5"/><path d="M16 14l4 3-4 3"/><path d="M20 17h-6"/></svg></span>'

const LOGOUT_ICON =
  '<span class="account-menu-glyph" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 7V5a2 2 0 0 1 2-2h7v18h-7a2 2 0 0 1-2-2v-2"/><path d="M4 12h11"/><path d="M12 8l4 4-4 4"/></svg></span>'

export function accountMenuModel(state) {
  if (!state?.loggedIn) return null
  const email = state.email || ''
  const current = email.toLowerCase()
  const others = (state.accounts || []).filter(
    (account) => account.email && account.email.toLowerCase() !== current,
  )
  return {
    displayName: state.displayName || '',
    email,
    handle: state.handle || '',
    photoUrl: state.photoUrl || '',
    manageUrl: MANAGE_URL,
    others,
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function photoHtml(url, name, className) {
  if (url) {
    return `<img class="${className}" src="${escapeHtml(url)}" alt="" width="40" height="40">`
  }
  const initial = String(name || '?')
    .trim()
    .slice(0, 1)
    .toUpperCase()
  return `<span class="${className} ${className}-fallback" aria-hidden="true">${escapeHtml(initial || '?')}</span>`
}

function metaLines(model) {
  const lines = []
  if (model.handle) lines.push(model.handle)
  if (model.email) lines.push(model.email)
  return lines.map((line) => `<span>${escapeHtml(line)}</span>`).join('')
}

function otherRows(others) {
  return others
    .map(
      (account) =>
        `<button type="button" class="account-menu-item" data-account-action="switch" data-account-email="${escapeHtml(account.email)}">${photoHtml(account.photoUrl, account.displayName, 'account-menu-other-photo')}<span class="account-menu-copy"><strong>${escapeHtml(account.displayName)}</strong><span>${escapeHtml(account.email)}</span></span></button>`,
    )
    .join('')
}

export function renderAccountMenu(model) {
  if (!model) return ''
  const chevron = '<span class="account-menu-chevron" aria-hidden="true">›</span>'
  const header = `<div class="account-menu-header">${photoHtml(model.photoUrl, model.displayName, 'account-menu-photo')}<div class="account-menu-id"><strong>${escapeHtml(model.displayName)}</strong>${metaLines(model)}</div></div>`
  const manage = `<a class="account-menu-manage" href="${escapeHtml(model.manageUrl)}" target="_blank" rel="noopener noreferrer">Gerenciar sua Conta do Google</a>`
  const switchRow = `<button type="button" class="account-menu-item" data-account-action="switch">${SWITCH_ICON}<span>Mudar de conta</span>${chevron}</button>`
  const logoutRow = `<button type="button" class="account-menu-item" data-account-action="logout">${LOGOUT_ICON}<span>Sair</span></button>`
  return `${header}${manage}<div class="account-menu-sep"></div>${otherRows(model.others || [])}${switchRow}${logoutRow}`
}

export function renderAccountButton(state) {
  const label = accountLabel(state)
  if (!state?.loggedIn) return escapeHtml(label)
  return `${photoHtml(state.photoUrl, state.displayName || label, 'account-avatar')}<span class="account-label">${escapeHtml(label)}</span>`
}
