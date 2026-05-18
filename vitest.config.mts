import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['html', 'json'],
      include: ['src/**'],
      exclude: [
        'src/app/layout.tsx',
        'src/lib/supabase/client.ts',
        'src/lib/supabase/server.ts',
      ],
    },
  },
})
