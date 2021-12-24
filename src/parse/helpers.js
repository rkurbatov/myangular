import { isNull, isString, reduce } from 'lodash'

import { AST } from './AST'
import { filter } from '../filter'

export const isDomNode = (obj) =>
  obj.children && (obj.nodeName || (obj.prop && obj.find && obj.attr))

export const getInputs = (ast) => {
  if (ast.length === 1) {
    const candidate = ast[0].toWatch
    if (candidate.length !== 1 || candidate[0] !== ast[0]) {
      return candidate
    }
  }
}

export const isLiteral = (ast) =>
  ast.body.length === 0 ||
  (ast.body.length === 1 &&
    [AST.Literal, AST.ArrayExpression, AST.ObjectExpression].includes(
      ast.body[0].type,
    ))

export const ensure = {
  safeMemberName: (name) => {
    if (
      [
        'constructor',
        '__proto__',
        '__defineGetter__',
        '__defineSetter__',
        '__lookupGetter__',
        '__lookupSetter__',
      ].includes(name)
    ) {
      throw 'Attempting to access a disallowed field in Angular expressions!'
    }
  },
  safeObject: (obj) => {
    if (obj) {
      if (obj.window === obj) {
        throw 'Referencing window in Angular expressions is disallowed!'
      } else if (isDomNode(obj)) {
        throw 'Referencing DOM nodes in Angular expressions is disallowed!'
      } else if (obj.constructor === obj) {
        throw 'Referencing Function in Angular expressions is disallowed!'
      } else if (obj === Object) {
        throw 'Referencing Object in Angular expressions is disallowed!'
      }
    }
    return obj
  },
  safeFunction: (obj) => {
    if (obj) {
      if (obj.constructor === obj) {
        throw 'Referencing Function in Angular expressions is disallowed!'
      } else if (
        [
          Function.prototype.call,
          Function.prototype.bind,
          Function.prototype.apply,
        ].includes(obj)
      ) {
        throw 'Referencing call, apply or bind in Angular expressions is disallowed'
      }
    }
  },
}

const stringEscapeRegex = /[^ a-zA-Z0-9]/g
const stringEscapeFn = (c) =>
  '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4)

export const escape = (value) => {
  if (isString(value)) {
    return "'" + value.replace(stringEscapeRegex, stringEscapeFn) + "'"
  } else if (isNull(value)) {
    return 'null'
  } else {
    return value
  }
}

export function markConstantAndWatchExpressions(ast) {
  let argsToWatch

  switch (ast.type) {
    case AST.Literal:
      ast.constant = true
      ast.toWatch = []
      break

    case AST.Identifier:
      ast.constant = false
      ast.toWatch = [ast]
      break

    case AST.ThisExpression:
    case AST.LocalsExpression:
      ast.constant = false
      ast.toWatch = []
      break

    case AST.Program:
      ast.constant = reduce(
        ast.body,
        (allConstants, expr) => {
          markConstantAndWatchExpressions(expr)
          return allConstants && expr.constant
        },
        true,
      )
      break

    case AST.ArrayExpression:
      argsToWatch = []
      ast.constant = reduce(
        ast.elements,
        (allConstants, element) => {
          markConstantAndWatchExpressions(element)
          if (!element.constant) {
            argsToWatch.push.apply(argsToWatch, element.toWatch)
          }
          return allConstants && element.constant
        },
        true,
      )
      ast.toWatch = argsToWatch
      break

    case AST.ObjectExpression:
      argsToWatch = []
      ast.constant = reduce(
        ast.properties,
        (allConstants, property) => {
          markConstantAndWatchExpressions(property.value)
          if (!property.value.constant) {
            argsToWatch.push.apply(argsToWatch, property.value.toWatch)
          }
          return allConstants && property.value.constant
        },
        true,
      )
      ast.toWatch = argsToWatch
      break

    case AST.CallExpression:
      const stateless = ast.filter && !filter(ast.callee.name).$stateful
      argsToWatch = []
      ast.constant = reduce(
        ast.arguments,
        (allConstants, arg) => {
          markConstantAndWatchExpressions(arg)
          if (!arg.constant) {
            argsToWatch.push.apply(argsToWatch, arg.toWatch)
          }
          return allConstants && arg.constant
        },
        !!stateless,
      )
      ast.toWatch = stateless ? argsToWatch : [ast]
      break

    case AST.MemberExpression:
      markConstantAndWatchExpressions(ast.object)
      if (ast.computed) {
        markConstantAndWatchExpressions(ast.property)
      }
      ast.constant =
        ast.object.constant && (!ast.computed || ast.property.constant)
      ast.toWatch = [ast]
      break

    case AST.AssignmentExpression:
    case AST.LogicalExpression:
      markConstantAndWatchExpressions(ast.left)
      markConstantAndWatchExpressions(ast.right)
      ast.constant = ast.left.constant && ast.right.constant
      ast.toWatch = [ast]
      break

    case AST.BinaryExpression:
      markConstantAndWatchExpressions(ast.left)
      markConstantAndWatchExpressions(ast.right)
      ast.constant = ast.left.constant && ast.right.constant
      ast.toWatch = [...ast.left.toWatch, ...ast.right.toWatch]
      break

    case AST.ConditionalExpression:
      markConstantAndWatchExpressions(ast.test)
      markConstantAndWatchExpressions(ast.consequent)
      markConstantAndWatchExpressions(ast.alternate)
      ast.constant =
        ast.test.constant && ast.consequent.constant && ast.alternate.constant
      ast.toWatch = [ast]
      break

    case AST.UnaryExpression:
      markConstantAndWatchExpressions(ast.argument)
      ast.constant = ast.argument.constant
      ast.toWatch = ast.argument.toWatch
      break
  }
}
