import { beforeEach, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)
