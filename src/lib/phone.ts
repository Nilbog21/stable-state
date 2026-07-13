export function isValidPhone(value: string): boolean {
  if (!/^\+?[0-9\-() ]+$/.test(value)) return false
  const digitCount = (value.match(/\d/g) ?? []).length
  return digitCount >= 7 && digitCount <= 15
}
