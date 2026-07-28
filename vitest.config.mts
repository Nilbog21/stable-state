import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    // e2e/support holds the pure fixture helpers (date anchoring, slug derivation) the
    // Playwright specs build on — unit-tested here, not by running the suite. Matched on
    // *.test.ts only, so Playwright's own *.spec.ts files are never handed to vitest.
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'scripts/**/*.{test,spec}.ts', 'e2e/support/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['html', 'json'],
      include: ['src/**'],
      exclude: [
        'src/app/layout.tsx',
        'src/lib/supabase/client.ts',
        'src/lib/supabase/server.ts',
        'src/test/**',
      ],
    },
  },
})
