import { describe, it, expect } from 'vitest'
import { mustSucceed, resolveBarnId } from './seed-account'

describe('mustSucceed', () => {
  it('should_throw_with_label_and_message_when_result_has_error', () => {
    expect(() =>
      mustSucceed({ data: null, error: { message: 'boom' } }, 'test-label')
    ).toThrow('test-label: boom')
  })

  it('should_return_data_when_result_has_no_error', () => {
    expect(mustSucceed({ data: [1, 2, 3], error: null }, 'ok')).toEqual([1, 2, 3])
  })
})

describe('resolveBarnId', () => {
  it('should_throw_with_slug_in_message_when_barn_not_found', async () => {
    const mock = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: null, error: { message: 'not found' } }),
          }),
        }),
      }),
    }
    await expect(resolveBarnId(mock as never, 'bad-slug')).rejects.toThrow('bad-slug')
  })

  it('should_return_id_when_barn_found', async () => {
    const mock = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: { id: 'barn-uuid' }, error: null }),
          }),
        }),
      }),
    }
    expect(await resolveBarnId(mock as never, 'my-barn')).toBe('barn-uuid')
  })
})
