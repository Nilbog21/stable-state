import type { FullConfig } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { E2E_USERS, E2E_PASSWORD, authStorageState } from './support/fixtures'

// The e2e logins are a one-time per-project bootstrap, not part of any barn seed, so the fix for
// a rejected grant is always to run that bootstrap — never to reseed a barn. Passed to
// authStorageState rather than stated here, because only a *rejected grant* has this fix: a
// missing env var does not, and neither does the throwaway login #1425's spec mints through the
// same function.
const MISSING_LOGIN_HINT =
  'If the login does not exist, create it with: bash scripts/e2e-auth-users.sh create ' +
  '(scripts/reset-db.sh does this too, on the dev project)'

async function globalSetup(_config: FullConfig) {
  const authDir = path.join(__dirname, '.auth')

  fs.mkdirSync(authDir, { recursive: true })

  for (const user of Object.values(E2E_USERS)) {
    // Auth token only. The barn_session_<slug> cookie can't live here — the slug isn't known
    // until a spec file's beforeAll seeds its own barn — so support/test.ts's page fixture
    // sets it per context instead.
    const storageState = await authStorageState(user.email, E2E_PASSWORD, MISSING_LOGIN_HINT).catch(
      (err: Error) => {
        throw new Error(`[global-setup] ${err.message}`)
      }
    )

    fs.writeFileSync(
      path.join(authDir, `${user.role}.json`),
      JSON.stringify(storageState, null, 2),
    )
    console.log(`[global-setup] ${user.role}.json written`)
  }
}

export default globalSetup
