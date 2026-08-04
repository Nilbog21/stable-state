import { describe, it, expect } from 'vitest'
import type { Locator } from '@playwright/test'
import { waitForHydrated, hydrateByDriving } from './hydration'

/**
 * A `Locator` stand-in recording the order its methods are called in — `read.test.ts`'s shape,
 * for the same reason: the claim is about *sequencing*, which a call count can't express.
 */
function fakeLocator(): { locator: Locator; calls: string[] } {
  const calls: string[] = []
  const locator = {
    first: () => ({
      waitFor: async () => {
        calls.push('waitFor')
      },
    }),
  } as unknown as Locator
  return { locator, calls }
}

/**
 * A page that only becomes live after `landsOn` drives have been dispatched — the shape of
 * e2e/CLAUDE.md's fact 10, where every click before React is listening is silently discarded.
 * `landsOn: 0` is the already-hydrated page.
 */
function fakePage(landsOn: number): { drive: () => Promise<void>; isLive: () => Promise<boolean>; drives: number } {
  const state = {
    drives: 0,
    drive: async () => {
      state.drives++
    },
    isLive: async () => state.drives >= landsOn,
  }
  return state
}

describe('waitForHydrated', () => {
  it('should_wait_for_the_first_match', async () => {
    const { locator, calls } = fakeLocator()
    await waitForHydrated(locator)
    expect(calls).toEqual(['waitFor'])
  })
})

describe('hydrateByDriving', () => {
  it('should_drive_when_the_page_is_not_yet_live', async () => {
    const page = fakePage(1)
    await hydrateByDriving(page.drive, page.isLive)
    expect(page.drives).toBe(1)
  })

  it('should_not_drive_when_the_page_is_already_live', async () => {
    const page = fakePage(0)
    await hydrateByDriving(page.drive, page.isLive)
    expect(page.drives).toBe(0)
  })

  it('should_retry_until_a_lost_drive_lands', async () => {
    const page = fakePage(3)
    await hydrateByDriving(page.drive, page.isLive)
    expect(page.drives).toBe(3)
  })

  it('should_resolve_once_the_page_is_live', async () => {
    const page = fakePage(2)
    await expect(hydrateByDriving(page.drive, page.isLive)).resolves.toBeUndefined()
  })
})
