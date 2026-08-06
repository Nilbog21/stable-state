import type { ReactNode } from 'react'
import { NavigationBlockerProvider, useNavigationBlocker } from '@/app/barn/[slug]/(protected)/NavigationBlocker'

/** Renders the context's dirty flag so tests can assert a form armed/cleared the nav guard. */
export function DirtyProbe() {
  const { dirty } = useNavigationBlocker()
  return <div data-testid="dirty">{dirty ? 'dirty' : 'clean'}</div>
}

/** Wraps a component under test in the provider with a DirtyProbe alongside it. */
export function withBlocker(ui: ReactNode) {
  return (
    <NavigationBlockerProvider>
      <DirtyProbe />
      {ui}
    </NavigationBlockerProvider>
  )
}
