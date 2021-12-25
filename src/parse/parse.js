import {
  isFunction,
  isUndefined,
  isNaN,
  noop,
  some,
  times,
  constant,
} from 'lodash'

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
      parseFn.$$watchDelegate = getWatchDelegate(parseFn, oneTime)
      return parseFn

    case 'function':
      // Don't parse if used for $watch arguments
      return expr

    default:
      return noop
  }
}

function getWatchDelegate({ constant, literal, inputs }, oneTime) {
  if (constant) return constantWatchDelegate
  if (oneTime)
    return literal ? oneTimeLiteralWatchDelegate : oneTimeWatchDelegate
  if (inputs) return inputsWatchDelegate
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

function inputsWatchDelegate(scope, listenerFn, valueEq, watchFn) {
  const inputsExpressions = watchFn.inputs
  const oldValues = times(
    inputsExpressions.length,
    constant(() => {}),
  )
  let lastResult

  return scope.$watch(
    function () {
      let changed = false
      inputsExpressions.forEach((inputExpr, i) => {
        const newValue = inputExpr(scope)
        if (changed || !expressionInputDirtyCheck(newValue, oldValues[i])) {
          changed = true
          oldValues[i] = newValue
        }
      })

      if (changed) {
        lastResult = watchFn(scope)
      }
      return lastResult
    },
    listenerFn,
    valueEq,
  )
}

const expressionInputDirtyCheck = (newValue, oldValue) =>
  newValue === oldValue || (Number.isNaN(newValue) && Number.isNaN(oldValue))
