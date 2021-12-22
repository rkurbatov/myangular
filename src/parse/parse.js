import { isFunction, isUndefined, noop, some } from 'lodash'

import { Lexer } from './Lexer'
import { AST } from './AST'
import { ASTCompiler } from './ASTCompiler'

// Combines lexer, AST builder and compiler into single abstraction
export const parse = (expr) => {
  switch (typeof expr) {
    case 'string':
      const lexer = new Lexer()
      const ast = new AST(lexer)
      const astCompiler = new ASTCompiler(ast)

      const oneTime = expr.startsWith('::')
      if (oneTime) expr = expr.substring(2)

      const parseFn = astCompiler.compile(expr)
      if (parseFn.constant) {
        parseFn.$$watchDelegate = constantWatchDelegate
      } else if (oneTime) {
        parseFn.$$watchDelegate = parseFn.literal
          ? oneTimeLiteralWatchDelegate
          : oneTimeWatchDelegate
      }

      return parseFn

    case 'function':
      // Don't parse if used for $watch arguments
      return expr

    default:
      return noop
  }
}

function constantWatchDelegate(scope, listenerFn, valueEq, watchFn) {
  const unwatch = scope.$watch(
    () => watchFn(scope),
    (newValue, oldValue, scope) => {
      if (isFunction(listenerFn)) {
        listenerFn(newValue, oldValue, scope)
      }
      unwatch()
    },
    valueEq,
  )

  return unwatch
}

function oneTimeWatchDelegate(scope, listenerFn, valueEq, watchFn) {
  let lastValue
  const unwatch = scope.$watch(
    () => watchFn(scope),
    (newValue, oldValue, scope) => {
      lastValue = newValue
      if (isFunction(listenerFn)) {
        listenerFn(newValue, oldValue, scope)
      }

      // Watcher should be removed if its value is other than undefined.
      // That makes one-time watchers useful for async cases when the value
      // arrives in a while.
      if (!isUndefined(newValue)) {
        // The removal happens only in $$postDigest stage when the final value stabilizes
        scope.$$postDigest(() => {
          if (!isUndefined(lastValue)) {
            unwatch()
          }
        })
      }
    },
    valueEq,
  )

  return unwatch
}

// Applied to arrays and objects containing at least one non-constant item
function oneTimeLiteralWatchDelegate(scope, listenerFn, valueEq, watchFn) {
  const isAllDefined = (val) => !some(val, isUndefined)

  const unwatch = scope.$watch(
    () => watchFn(scope),
    (newValue, oldValue, scope) => {
      if (isFunction(listenerFn)) {
        listenerFn(newValue, oldValue, scope)
      }

      if (isAllDefined(newValue)) {
        scope.$$postDigest(() => {
          if (isAllDefined(newValue)) {
            unwatch()
          }
        })
      }
    },
    valueEq,
  )

  return unwatch
}
