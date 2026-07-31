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
    // Pinned so viewer-local, barn-local and UTC are three *different* frames in every run
    // (#1221). Unpinned, the runner is the developer's own zone — usually America/New_York,
    // which is the barns.timezone default, collapsing viewer-local into barn-local — and UTC
    // in CI, collapsing viewer-local into UTC. Neither environment can fail a wrong-frame
    // call site, which is why fourteen timezone bugs had to be caught by a human reading code.
    // Asia/Kolkata is +5:30 with no DST: distinct from both, and its half-hour offset also
    // catches anything assuming whole-hour offsets.
    env: { TZ: 'Asia/Kolkata' },
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
