'use strict'

/**
 * Bans wrapping a Server Function before handing it to `useActionState` (#1396).
 *
 * React only emits the pre-hydration `method="POST"` markup — the `$ACTION_REF_*` hidden fields
 * that let a click landing before hydration submit natively — when the value passed to the hook
 * *is* the Server Function or a `.bind` of one. A closure around it is an ordinary client
 * function: the form still renders, still looks progressively enhanced, and is silently a no-op
 * until React attaches. Nothing else can catch this — a wrapper satisfies the same
 * `(prevState, FormData)` signature, and jsdom cannot observe server markup at all.
 *
 * Resolution is single-file, through ESLint's scope manager: an identifier that resolves to an
 * import or to a parameter passes (a prop is trusted — whoever binds it is out of this file's
 * reach), one that resolves to a local function or variable fails, and one that resolves to
 * nothing passes, so a global is never a false positive.
 */

/** @param {import('eslint').Rule.RuleContext} context @param {any} node */
function resolveVariable(context, node) {
  let scope = context.sourceCode.getScope(node)
  while (scope) {
    const variable = scope.variables.find((v) => v.name === node.name)
    if (variable) return variable
    scope = scope.upper
  }
  return null
}

/** @param {import('eslint').Rule.RuleContext} context @param {any} node */
function isDirectServerAction(context, node) {
  if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') return false

  if (node.type === 'Identifier') {
    const variable = resolveVariable(context, node)
    if (!variable) return true
    const defType = variable.defs.length > 0 ? variable.defs[0].type : null
    return defType !== 'FunctionName' && defType !== 'Variable'
  }

  // `serverAction.bind(null, …)` is as enhanced as `serverAction` itself — recurse on the base.
  if (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    node.callee.property.name === 'bind'
  ) {
    return isDirectServerAction(context, node.callee.object)
  }

  return true
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require the first argument of useActionState to be a Server Function or a .bind of one, never a wrapper',
    },
    schema: [],
    messages: {
      wrappedServerAction:
        'Wrapping the Server Function defeats progressive enhancement: React emits the pre-hydration form markup only for the function itself or a `.bind` of it, so a click before hydration is silently lost. Pass the action directly and move the continuation into a `useEffect` keyed on the returned state (#1396).',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'useActionState') return
        const first = node.arguments[0]
        if (!first || isDirectServerAction(context, first)) return
        context.report({ node: first, messageId: 'wrappedServerAction' })
      },
    }
  },
}
