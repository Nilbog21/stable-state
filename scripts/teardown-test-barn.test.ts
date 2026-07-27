import { describe, it, expect, vi } from 'vitest'
import { teardown, teardownAllTestBarns, teardownTestBarnsByPrefix } from './teardown-test-barn'

function chain(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {}
  const methods = ['select', 'delete', 'eq', 'in', 'like']
  for (const m of methods) builder[m] = vi.fn(() => builder)
  builder.maybeSingle = vi.fn(() => Promise.resolve(result))
  builder.then = (resolve: (v: unknown) => void) => resolve(result)
  return builder
}

function buildClient(opts: {
  barns: Record<string, { id: string; is_test_barn: boolean } | null>
  testBarnSlugs?: string[]
}) {
  const from = vi.fn((table: string) => {
    if (table === 'barns') {
      return {
        select: vi.fn((cols: string) => {
          if (cols === 'slug') {
            return chain({
              data: (opts.testBarnSlugs ?? []).map((slug) => ({ slug })),
              error: null,
            })
          }
          return {
            eq: vi.fn((_col: string, slug: string) => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: opts.barns[slug] ?? null, error: null })),
            })),
          }
        }),
        delete: vi.fn(() => chain({ data: null, error: null })),
      }
    }
    return chain({ data: [], error: null })
  })

  return {
    from,
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    auth: { admin: { listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }), deleteUser: vi.fn() } },
    storage: { from: vi.fn().mockReturnValue({ remove: vi.fn().mockResolvedValue({ error: null }) }) },
  } as any
}

describe('teardown', () => {
  it('should_throw_when_barn_exists_but_is_not_marked_as_a_test_barn', async () => {
    const client = buildClient({ barns: { 'real-customer': { id: 'b1', is_test_barn: false } } })
    await expect(teardown('real-customer', client)).rejects.toThrow('is not marked as a test barn')
  })

  it('should_not_throw_when_barn_does_not_exist', async () => {
    const client = buildClient({ barns: {} })
    await expect(teardown('no-such-barn', client)).resolves.not.toThrow()
  })

  it('should_delete_barn_when_marked_as_a_test_barn', async () => {
    const client = buildClient({ barns: { 'test-barn-1': { id: 'b1', is_test_barn: true } } })
    await teardown('test-barn-1', client)
    expect(client.from).toHaveBeenCalledWith('barns')
  })
})

describe('teardownAllTestBarns', () => {
  it('should_tear_down_every_barn_marked_as_a_test_barn', async () => {
    const client = buildClient({
      barns: {
        'test-barn-1': { id: 'b1', is_test_barn: true },
        'test-barn-2': { id: 'b2', is_test_barn: true },
      },
      testBarnSlugs: ['test-barn-1', 'test-barn-2'],
    })
    const slugs = await teardownAllTestBarns(client)
    expect(slugs).toEqual(['test-barn-1', 'test-barn-2'])
  })

  it('should_return_empty_array_when_no_test_barns_exist', async () => {
    const client = buildClient({ barns: {}, testBarnSlugs: [] })
    const slugs = await teardownAllTestBarns(client)
    expect(slugs).toEqual([])
  })
})

describe('teardownTestBarnsByPrefix', () => {
  it('should_tear_down_every_test_barn_the_prefix_query_returns', async () => {
    const client = buildClient({
      barns: {
        'e2e-1-2-smoke': { id: 'b1', is_test_barn: true },
        'e2e-1-2-dashboard': { id: 'b2', is_test_barn: true },
      },
      testBarnSlugs: ['e2e-1-2-smoke', 'e2e-1-2-dashboard'],
    })
    const slugs = await teardownTestBarnsByPrefix(client, 'e2e-1-2')
    expect(slugs).toEqual(['e2e-1-2-smoke', 'e2e-1-2-dashboard'])
  })

  it('should_return_empty_array_when_no_barn_matches_the_prefix', async () => {
    const client = buildClient({ barns: {}, testBarnSlugs: [] })
    const slugs = await teardownTestBarnsByPrefix(client, 'e2e-9-9')
    expect(slugs).toEqual([])
  })
})
