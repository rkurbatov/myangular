import { isNull, isString } from 'lodash'
import { AST } from './AST'

// Compiles AST into Expression Function that evaluates expression represented in tree
// For example, the tree
// [
//   { text: 'a', identifier: true },
//   { text: '+' },
//   { text: 'b', identifier: true },
// ]
// is turned into
// {
//   type: AST.BinaryExpression,
//   operator: '+',
//   left: {
//     type: AST.Identifier,
//     name: 'a',
//   },
//   right: {
//     type: AST.Identifier,
//     name: 'b',
//   }
// }
// is turned into a function
// function (scope) {
//   return scope.a + scope.b;
// }
export class ASTCompiler {
  constructor(astBuilder) {
    this.astBuilder = astBuilder
    this.state = {
      body: [], // elements of a generated evaluation function
      nextId: 0, // basis of unique ids used by function
      vars: [], // intermediate vars created for storing values
    }
  }

  compile(text) {
    const ast = this.astBuilder.ast(text)
    this.#recurse(ast)
    const fnBody = `
      var fn=function(s,l){
        ${this.#varsDefinition()} ${this.state.body.join('')}
      };
      return fn;`
    return new Function(
      'ensureSafeMemberName',
      'ensureSafeObject',
      'ensureSafeFunction',
      'ifDefined',
      fnBody,
    )(
      ASTCompiler.#ensureSafeMemberName,
      ASTCompiler.#ensureSafeObject,
      ASTCompiler.#ensureSafeFunction,
      ASTCompiler.#ifDefined,
    )
  }

  #recurse(ast, context, create) {
    switch (ast.type) {
      case AST.Program:
        this.state.body.push('return ', this.#recurse(ast.body), ';')
        break

      case AST.Literal:
        return ASTCompiler.#escape(ast.value)

      case AST.ArrayExpression:
        const elements = ast.elements.map((element) => this.#recurse(element))
        return '[' + elements.join(',') + ']'

      case AST.ObjectExpression:
        const properties = ast.properties.map((property) => {
          const key =
            property.key.type === AST.Identifier
              ? property.key.name
              : ASTCompiler.#escape(property.key.value)
          const value = this.#recurse(property.value)
          return key + ':' + value
        })
        return '{' + properties.join(',') + '}'

      case AST.Identifier: {
        ASTCompiler.#ensureSafeMemberName(ast.name)
        const intoId = this.#nextId()

        const hasL = ASTCompiler.#getHasOwnProperty('l', ast.name)
        const lAssignment = ASTCompiler.#assign(
          intoId,
          ASTCompiler.#nonComputedMember('l', ast.name),
        )
        this.#if_(hasL, lAssignment)

        if (create) {
          const hasS = ASTCompiler.#getHasOwnProperty('s', ast.name)
          const createCondition =
            ASTCompiler.#not(hasL) + ' && s && ' + ASTCompiler.#not(hasS)
          const createAssignment = ASTCompiler.#assign(
            ASTCompiler.#nonComputedMember('s', ast.name),
            '{}',
          )
          this.#if_(createCondition, createAssignment)
        }

        const notHasLAndHasS = ASTCompiler.#not(hasL) + ' && s'
        const sAssignment = ASTCompiler.#assign(
          intoId,
          ASTCompiler.#nonComputedMember('s', ast.name),
        )
        this.#if_(notHasLAndHasS, sAssignment)

        if (context) {
          context.context =
            ASTCompiler.#getHasOwnProperty('l', ast.name) + ' ? l : s'
          context.name = ast.name
          context.computed = false
        }

        this.#addEnsureSafeObject(intoId)
        return intoId
      }

      case AST.ThisExpression:
        return 's'

      case AST.LocalsExpression:
        return 'l'

      case AST.MemberExpression: {
        const intoId = this.#nextId()
        const left = this.#recurse(ast.object, undefined, create)
        if (context) {
          context.context = left
        }
        let assignment
        if (ast.computed) {
          const right = this.#recurse(ast.property)
          this.#addEnsureSafeMemberName(right)
          if (create) {
            const computed = ASTCompiler.#computedMember(left, right)
            const createClause = ASTCompiler.#not(computed)
            const createAssignment = ASTCompiler.#assign(computed, '{}')
            this.#if_(createClause, createAssignment)
          }
          assignment = ASTCompiler.#assign(
            intoId,
            'ensureSafeObject(' +
              ASTCompiler.#computedMember(left, right) +
              ')',
          )
          if (context) {
            context.name = right
            context.computed = true
          }
        } else {
          ASTCompiler.#ensureSafeMemberName(ast.property.name)
          if (create) {
            const nonComputed = ASTCompiler.#nonComputedMember(
              left,
              ast.property.name,
            )
            const createClause = ASTCompiler.#not(nonComputed)
            const createAssignment = ASTCompiler.#assign(nonComputed, '{}')
            this.#if_(createClause, createAssignment)
          }
          assignment = ASTCompiler.#assign(
            intoId,
            'ensureSafeObject(' +
              ASTCompiler.#nonComputedMember(left, ast.property.name) +
              ')',
          )
          if (context) {
            context.name = ast.property.name
            context.computed = false
          }
        }
        this.#if_(left, assignment)
        return intoId
      }

      case AST.CallExpression:
        const callContext = {}
        let callee = this.#recurse(ast.callee, callContext)
        const args = ast.arguments.map(
          (arg) => 'ensureSafeObject(' + this.#recurse(arg) + ')',
        )
        if (callContext.name) {
          this.#addEnsureSafeObject(callContext.context)
          if (callContext.computed) {
            callee = ASTCompiler.#computedMember(
              callContext.context,
              callContext.name,
            )
          } else {
            callee = ASTCompiler.#nonComputedMember(
              callContext.context,
              callContext.name,
            )
          }
        }
        this.#addEnsureSafeFunction(callee)
        return (
          callee +
          ' && ensureSafeObject(' +
          callee +
          '(' +
          args.join(',') +
          '))'
        )

      case AST.AssignmentExpression: {
        const lftContext = {}
        this.#recurse(ast.left, lftContext, true) // Automatically create missing nested properties
        const leftExpr = lftContext.computed
          ? ASTCompiler.#computedMember(lftContext.context, lftContext.name)
          : ASTCompiler.#nonComputedMember(lftContext.context, lftContext.name)
        const rightExpr = 'ensureSafeObject(' + this.#recurse(ast.right) + ')'
        return ASTCompiler.#assign(leftExpr, rightExpr)
      }

      case AST.UnaryExpression: {
        return (
          ast.operator +
          '(' +
          this.#ifDefined_(this.#recurse(ast.argument), 0) +
          ')'
        )
      }

      case AST.BinaryExpression: {
        if (['+', '-'].includes(ast.operator)) {
          return (
            '(' +
            this.#ifDefined_(this.#recurse(ast.left), 0) +
            ')' +
            ast.operator +
            '(' +
            this.#ifDefined_(this.#recurse(ast.right), 0) +
            ')'
          )
        } else {
          return (
            '(' +
            this.#recurse(ast.left) +
            ')' +
            ast.operator +
            '(' +
            this.#recurse(ast.right) +
            ')'
          )
        }
      }

      case AST.LogicalExpression: {
        const intoId = this.#nextId()
        this.state.body.push(
          ASTCompiler.#assign(intoId, this.#recurse(ast.left)),
        )
        this.#if_(
          ast.operator === '&&' ? intoId : ASTCompiler.#not(intoId),
          ASTCompiler.#assign(intoId, this.#recurse(ast.right)),
        )
        return intoId
      }

      case AST.ConditionalExpression: {
        const intoId = this.#nextId()
        const testId = this.#nextId()
        this.state.body.push(
          ASTCompiler.#assign(testId, this.#recurse(ast.test)),
        )
        this.#if_(
          testId,
          ASTCompiler.#assign(intoId, this.#recurse(ast.consequent)),
        )
        this.#if_(
          ASTCompiler.#not(testId),
          ASTCompiler.#assign(intoId, this.#recurse(ast.alternate)),
        )
        return intoId
      }
    }
  }

  #if_(test, consequent) {
    this.state.body.push('if(', test, '){', consequent, '}')
  }

  #ifDefined_(value, defaultValue) {
    return 'ifDefined(' + value + ',' + ASTCompiler.#escape(defaultValue) + ')'
  }

  #nextId() {
    const id = 'v' + this.state.nextId++
    this.state.vars.push(id)
    return id
  }

  #varsDefinition() {
    return this.state.vars.length
      ? 'var ' + this.state.vars.join(',') + ';'
      : ''
  }

  static #assign(id, value) {
    return id + '=' + value + ';'
  }

  static #not(e) {
    return '!(' + e + ')'
  }

  static #escape(value) {
    if (isString(value)) {
      return (
        "'" +
        value.replace(
          ASTCompiler.#stringEscapeRegex,
          ASTCompiler.#stringEscapeFn,
        ) +
        "'"
      )
    } else if (isNull(value)) {
      return 'null'
    } else {
      return value
    }
  }

  static #getHasOwnProperty(object, property) {
    return (
      object + ' && (' + ASTCompiler.#escape(property) + ' in ' + object + ')'
    )
  }

  static #stringEscapeRegex = /[^ a-zA-Z0-9]/g
  static #stringEscapeFn = (c) =>
    '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4)

  static #nonComputedMember = (left, right) => '(' + left + ').' + right
  static #computedMember = (left, right) => '(' + left + ')[' + right + ']'

  static #ensureSafeMemberName(name) {
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
  }

  static #ensureSafeObject(obj) {
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
  }

  static #ensureSafeFunction(obj) {
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
  }

  static #ifDefined(value, defaultValue) {
    return typeof value === 'undefined' ? defaultValue : value
  }

  #addEnsureSafeMemberName(expr) {
    this.state.body.push('ensureSafeMemberName(' + expr + ');')
  }

  #addEnsureSafeObject(expr) {
    this.state.body.push('ensureSafeObject(' + expr + ');')
  }

  #addEnsureSafeFunction(expr) {
    this.state.body.push('ensureSafeFunction(' + expr + ');')
  }
}

function isDomNode(obj) {
  return obj.children && (obj.nodeName || (obj.prop && obj.find && obj.attr))
}
