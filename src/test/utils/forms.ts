export function makeFormData(fields: Record<string, string | string[]>): FormData {
  const fd = new FormData()
  Object.entries(fields).forEach(([k, v]) =>
    Array.isArray(v) ? v.forEach(val => fd.append(k, val)) : fd.append(k, v)
  )
  return fd
}
