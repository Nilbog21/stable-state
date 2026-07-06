import { describe, it, expect } from 'vitest'
import { formatChargeGenerationSummary } from './generate-agreement-charges'

describe('formatChargeGenerationSummary', () => {
  it('should_report_success_when_no_errors', () => {
    expect(formatChargeGenerationSummary(4, 0)).toBe('Generated charges for 4 active monthly agreement(s).')
  })

  it('should_report_failure_count_when_errors_occurred', () => {
    expect(formatChargeGenerationSummary(4, 1)).toBe('Generated charges for 4 active monthly agreement(s); 1 failed.')
  })
})
