import { describe, it, expect } from 'vitest'
import { isNavLinkActive } from '../nav-active'

describe('isNavLinkActive', () => {
  it('should_be_active_on_exact_pathname_match', () => {
    expect(isNavLinkActive('/barn/green-acres/horses', '/barn/green-acres/horses')).toBe(true)
  })

  it('should_be_active_on_nested_path_match', () => {
    expect(isNavLinkActive('/barn/green-acres/lessons/123', '/barn/green-acres/lessons')).toBe(true)
  })

  it('should_be_inactive_on_unrelated_path', () => {
    expect(isNavLinkActive('/barn/green-acres/horses', '/barn/green-acres/lessons')).toBe(false)
  })

  it('should_be_inactive_on_similar_prefix_without_slash_boundary', () => {
    expect(isNavLinkActive('/barn/green-acres/horses-foo', '/barn/green-acres/horses')).toBe(false)
  })

  it('should_be_active_when_query_matches', () => {
    expect(
      isNavLinkActive('/barn/green-acres/agreements?kind=lease', '/barn/green-acres/agreements?kind=lease')
    ).toBe(true)
  })

  it('should_be_inactive_when_query_differs', () => {
    expect(
      isNavLinkActive('/barn/green-acres/agreements?kind=board', '/barn/green-acres/agreements?kind=lease')
    ).toBe(false)
  })

  it('should_be_active_on_nested_path_ignoring_current_query_when_href_has_no_query', () => {
    expect(isNavLinkActive('/barn/green-acres/lessons/123?foo=bar', '/barn/green-acres/lessons')).toBe(true)
  })
})
