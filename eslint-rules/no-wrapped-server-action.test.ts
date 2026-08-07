import { describe, it, afterAll } from 'vitest'
import { RuleTester } from 'eslint'
import tsParser from '@typescript-eslint/parser'
import rule from './no-wrapped-server-action.js'

// RuleTester drives its own test runner; vitest's globals are off, so hand it the imports.
// Object.assign, not three assignments: `afterAll` is read at runtime but missing from ESLint's
// published types, so a direct assignment doesn't typecheck.
Object.assign(RuleTester, { afterAll, it, describe })

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
})

// The real config parses .tsx through @typescript-eslint/parser, so a cast is a node shape the
// rule actually meets in this repo — espree can't produce one, hence the second tester.
const tsRuleTester = new RuleTester({
  languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: 'module' },
})

ruleTester.run('no-wrapped-server-action', rule as any, {
  valid: [
    {
      name: 'imported Server Function',
      code: `import { deleteAction } from './actions'
        function C() { const [s, f] = useActionState(deleteAction, { error: null }) }`,
    },
    {
      name: 'prop parameter — destructured',
      code: `function C({ action }) { const [s, f] = useActionState(action, { error: null }) }`,
    },
    {
      name: 'prop parameter — whole props object',
      code: `function C(props) { const [s, f] = useActionState(props.action, { error: null }) }`,
    },
    {
      name: 'bind of an imported Server Function',
      code: `import { deleteAction } from './actions'
        function C({ id }) { const [s, f] = useActionState(deleteAction.bind(null, id), { error: null }) }`,
    },
    {
      name: 'unresolvable identifier is left alone',
      code: `function C() { const [s, f] = useActionState(someGlobalAction, { error: null }) }`,
    },
    {
      name: 'a shadowing parameter wins over an outer local',
      code: `function wrapper() {}
        function C(wrapper) { const [s, f] = useActionState(wrapper, { error: null }) }`,
    },
    {
      name: 'some other hook taking a closure',
      code: `function C({ action }) { const cb = useCallback(async () => action(), [action]) }`,
    },
  ],
  invalid: [
    {
      name: 'inline arrow closure',
      code: `function C({ action }) {
        const [s, f] = useActionState(async () => { await action() }, null)
      }`,
      errors: [{ messageId: 'wrappedServerAction' }],
    },
    {
      name: 'inline function expression',
      code: `function C({ action }) {
        const [s, f] = useActionState(async function (p, d) { return action(p, d) }, null)
      }`,
      errors: [{ messageId: 'wrappedServerAction' }],
    },
    {
      name: 'local function declaration',
      code: `function C({ action }) {
        async function wrappedAction(p, d) { return action(p, d) }
        const [s, f] = useActionState(wrappedAction, { error: null })
      }`,
      errors: [{ messageId: 'wrappedServerAction' }],
    },
    {
      name: 'local const holding a closure',
      code: `function C({ action }) {
        const wrappedAction = async (p, d) => action(p, d)
        const [s, f] = useActionState(wrappedAction, { error: null })
      }`,
      errors: [{ messageId: 'wrappedServerAction' }],
    },
    {
      name: 'bind of a local wrapper',
      code: `function C({ action }) {
        async function wrappedAction(id, p, d) { return action(p, d) }
        const [s, f] = useActionState(wrappedAction.bind(null, 'x'), { error: null })
      }`,
      errors: [{ messageId: 'wrappedServerAction' }],
    },
  ],
})

tsRuleTester.run('no-wrapped-server-action (TypeScript)', rule as any, {
  valid: [
    {
      name: 'cast of an imported Server Function',
      code: `import { deleteAction } from './actions'
        function C() { const [s, f] = useActionState(deleteAction as any, { error: null }) }`,
    },
    {
      name: 'non-null assertion on a prop',
      code: `function C({ action }) { const [s, f] = useActionState(action!, { error: null }) }`,
    },
  ],
  invalid: [
    {
      name: 'cast does not launder a local wrapper',
      code: `function C({ action }) {
        const wrappedAction = async (p, d) => action(p, d)
        const [s, f] = useActionState(wrappedAction as typeof action, { error: null })
      }`,
      errors: [{ messageId: 'wrappedServerAction' }],
    },
    {
      name: 'non-null assertion does not launder a local wrapper',
      code: `function C({ action }) {
        const wrappedAction = async (p, d) => action(p, d)
        const [s, f] = useActionState(wrappedAction!, { error: null })
      }`,
      errors: [{ messageId: 'wrappedServerAction' }],
    },
    {
      name: 'satisfies does not launder an inline closure',
      code: `function C({ action }) {
        const [s, f] = useActionState((async (p, d) => action(p, d)) satisfies unknown, null)
      }`,
      errors: [{ messageId: 'wrappedServerAction' }],
    },
  ],
})
