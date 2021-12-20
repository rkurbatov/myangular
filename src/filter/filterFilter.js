import {
  filter,
  isBoolean,
  isFunction,
  isNumber,
  isObject,
  isString,
  isNull,
  some,
  isUndefined,
} from 'lodash'

export function filterFilter() {
  return (array, filterExpr) => {
    let predicateFn

    if (isFunction(filterExpr)) {
      predicateFn = filterExpr
    } else if (
      isString(filterExpr) ||
      isNumber(filterExpr) ||
      isBoolean(filterExpr) ||
      isNull(filterExpr)
    ) {
      predicateFn = createPredicateFn(filterExpr)
    } else {
      // No filter, simply return array
      return array
    }

    return filter(array, predicateFn)
  }
}

function createPredicateFn(expression) {
  return (item) => {
    return deepCompare(item, expression, primitiveComparator)
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

function deepCompare(actual, expected, comparator) {
  if (isString(expected) && expected.startsWith('!')) {
    // Filter with string negation
    return !deepCompare(actual, expected.substring(1), comparator)
  }
  if (isObject(actual)) {
    // works for both arrays and objects, recursive to support any nested level
    return some(actual, (value) => deepCompare(value, expected, comparator))
  } else {
    return comparator(actual, expected)
  }
}
