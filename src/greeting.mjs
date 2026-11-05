export function greeting(hour) {
  const value = Number(hour)
  if (value >= 5 && value < 12) return 'Bom dia'
  if (value >= 12 && value < 18) return 'Boa tarde'
  return 'Boa noite'
}
