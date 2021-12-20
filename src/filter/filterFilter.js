import {
  filter,
  isBoolean,
  isFunction,
  isNumber,
  isObject,
  isArray,
  isString,
  isNull,
  isUndefined,
  toPlainObject,
  some,
  every,
  isEqual,
} from 'lodash'

export function filterFilter() {
  return (array, filterExpr, comparator) => {
    let predicateFn

    if (isFunction(filterExpr)) {
      predicateFn = filterExpr
    } else if (
      isString(filterExpr) ||
      isNumber(filterExpr) ||
      isBoolean(filterExpr) ||
      isNull(filterExpr) ||
      isObject(filterExpr)
    ) {
      predicateFn = createPredicateFn(filterExpr, comparator)
    } else {
      // No filter, simply return array
      return array
    }

    return filter(array, predicateFn)
  }
}

function createPredicateFn(expression, comparator = primitiveComparator) {
  const shouldMatchPrimitives = isObject(expression) && '$' in expression
  if (comparator === true) comparator = isEqual // strict comparator
  return (item) => {
    if (shouldMatchPrimitives && !isObject(item)) {
      return deepCompare(item, expression.$, comparator, false)
    }
    return deepCompare(item, expression, comparator, true)
  }
}

function primitiveComparator(actual, expected) {
  // Undefined values never pass a filter
  if (isUndefined(actual)) {
    return false
  }
  if (isNull(actual) || isNull(expected)) {
    return actual === expected
  }
  // Coerce both values to lowercase string and compare
  return String(actual).toLowerCase().includes(String(expected).toLowerCase())
}

function deepCompare(
  actual,
  expected,
  comparator,
  matchAnyProperty,
  inWildcard,
) {
  if (isString(expected) && expected.startsWith('!')) {
    // Filter with string negation
    return !deepCompare(
      actual,
      expected.substring(1),
      comparator,
      matchAnyProperty,
    )
  }
  if (isArray(actual)) {
    // The nested array matches if ANY element in the array matches expected (recursively)
    return some(actual, (actualItem) =>
      deepCompare(actualItem, expected, comparator, matchAnyProperty),
    )
  }
  if (isObject(actual)) {
    // Works for both arrays and objects, recursive to support any nested level
    if (isObject(expected) && !inWildcard) {
      // Recursive object filtering. Expected is turned into plain object to
      // check the props provided via prototypal inheritance.
      return every(toPlainObject(expected), (expectedVal, expectedKey) => {
        if (isUndefined(expectedVal)) {
          return true
        }
        const isWildcard = expectedKey === '$'
        const actualVal = isWildcard ? actual : actual[expectedKey]
        // Matches objects values only on the same level (if not in wildcard mode)
        return deepCompare(
          actualVal,
          expectedVal,
          comparator,
          isWildcard,
          isWildcard,
        )
      })
    } else if (matchAnyProperty) {
      return some(actual, (value) =>
        deepCompare(value, expected, comparator, matchAnyProperty),
      )
    } else {
      return comparator(actual, expected)
    }
  } else {
    return comparator(actual, expected)
  }
}
