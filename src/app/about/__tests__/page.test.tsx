import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

const mockReadFileSync = vi.hoisted(() =>
  vi.fn().mockReturnValue('# Changelog\n\n## v3.0.3 — July 2026\n')
)
vi.mock('fs', () => ({
  default: { readFileSync: mockReadFileSync },
  readFileSync: mockReadFileSync,
}))

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

import AboutPage from '../page'

describe('AboutPage', () => {
  beforeEach(() => {
    mockReadFileSync.mockReset()
    mockReadFileSync.mockReturnValue('# Changelog\n\n## v3.0.3 — July 2026\n')
  })

  it('should_render_app_overview_text', () => {
    render(AboutPage())

    expect(screen.getByText(/stable state is a multi-tenant lesson-tracking application/i)).toBeDefined()
  })

  it('should_render_back_link_to_barns', () => {
    render(AboutPage())

    expect(
      (screen.getByRole('link', { name: /back/i }) as HTMLAnchorElement).href
    ).toContain('/barns')
  })

  it('should_render_terms_of_service_link', () => {
    render(AboutPage())

    expect(
      (screen.getByRole('link', { name: /terms of service/i }) as HTMLAnchorElement).href
    ).toContain('/terms')
  })

  it('should_render_privacy_policy_link', () => {
    render(AboutPage())

    expect(
      (screen.getByRole('link', { name: /privacy policy/i }) as HTMLAnchorElement).href
    ).toContain('/privacy')
  })

  it('should_render_changelog_link_with_current_version', () => {
    render(AboutPage())

    const changelogLink = screen.getByRole('link', {
      name: /changelog — version v3\.0\.3/i,
    }) as HTMLAnchorElement
    expect(changelogLink.href).toContain('/changelog')
  })

  it('should_omit_version_from_changelog_link_when_changelog_cannot_be_read', () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory')
    })

    render(AboutPage())

    expect(screen.getByRole('link', { name: 'Changelog' })).toBeDefined()
    expect(screen.queryByText(/version v/i)).toBeNull()
  })
})
