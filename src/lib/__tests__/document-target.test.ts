import { describe, it, expect } from 'vitest'
import { canManage } from '@/lib/document-target'

describe('canManage', () => {
  it('should_return_true_for_manager_regardless_of_own_page', () => {
    expect(canManage('manager', false)).toBe(true)
  })

  it('should_return_true_for_trainer_viewing_own_page', () => {
    expect(canManage('trainer', true)).toBe(true)
  })

  it('should_return_false_for_trainer_viewing_another_page', () => {
    expect(canManage('trainer', false)).toBe(false)
  })

  it('should_return_false_for_rider_viewing_own_page', () => {
    expect(canManage('rider', true)).toBe(false)
  })

  it('should_return_false_for_rider_viewing_another_page', () => {
    expect(canManage('rider', false)).toBe(false)
  })
})
