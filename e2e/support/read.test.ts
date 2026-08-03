import { describe, it, expect } from 'vitest'
import type { Locator } from '@playwright/test'
import { settledInnerTexts, settledTextContents } from './read'

/**
 * A `Locator` stand-in recording the order its methods are called in. The claim under test is
 * about *sequencing* — that the wait happens before the read — which a mock's call count can't
 * express and a real browser can only demonstrate by flaking.
 */
function fakeLocator(texts: string[]): { locator: Locator; calls: string[] } {
  const calls: string[] = []
  const locator = {
    first: () => ({
      waitFor: async () => {
        calls.push('waitFor')
      },
    }),
    allInnerTexts: async () => {
      calls.push('allInnerTexts')
      return texts
    },
    allTextContents: async () => {
      calls.push('allTextContents')
      return texts
    },
  } as unknown as Locator
  return { locator, calls }
}

describe('settledInnerTexts', () => {
  it('should_wait_for_the_first_match_before_reading', async () => {
    const { locator, calls } = fakeLocator(['Bella'])
    await settledInnerTexts(locator)
    expect(calls).toEqual(['waitFor', 'allInnerTexts'])
  })

  it('should_return_the_texts_it_read', async () => {
    const { locator } = fakeLocator(['Bella', 'Dancer'])
    expect(await settledInnerTexts(locator)).toEqual(['Bella', 'Dancer'])
  })
})

describe('settledTextContents', () => {
  it('should_wait_for_the_first_match_before_reading', async () => {
    const { locator, calls } = fakeLocator(['Horse'])
    await settledTextContents(locator)
    expect(calls).toEqual(['waitFor', 'allTextContents'])
  })

  it('should_return_the_texts_it_read', async () => {
    const { locator } = fakeLocator(['Horse ▲', 'Gross'])
    expect(await settledTextContents(locator)).toEqual(['Horse ▲', 'Gross'])
  })
})
