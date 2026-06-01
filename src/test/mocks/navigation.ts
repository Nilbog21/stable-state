import { vi } from 'vitest'

export function createThrowingRedirect() {
  return vi.fn((url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), {
      digest: `NEXT_REDIRECT;replace;${url}`,
    })
  })
}

export function createSimpleRedirect() {
  return vi.fn()
}

export function createNotFound() {
  return vi.fn(() => { throw new Error('NEXT_NOT_FOUND') })
}
