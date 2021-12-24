import { initial, last, isEmpty } from 'lodash'

import { AST } from './AST'
import {
  ensure,
  escape,
  getInputs,
  isLiteral,
  markConstantAndWatchExpressions,
} from './helpers'
import { filter } from '../filter'

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
      fn: {
        body: [], // elements of a generated evaluation function
        vars: [], // intermediate vars created for storing values
      },
      inputs: [],
      nextId: 0, // basis of unique ids used by function
      filters: {}, // list of registered filters used in expression
    }
  }

  compile(text) {
    const ast = this.astBuilder.ast(text)
    markConstantAndWatchExpressions(ast)

    this.stage = 'inputs'
    ;(getInputs(ast.body) || []).forEach((input, idx) => {
      const inputKey = 'fn' + idx
      this.state[inputKey] = { body: [], vars: [] }
      this.state.computing = inputKey
      this.state[inputKey].body.push('return ' + this.#recurse(input) + ';')
      this.state.inputs.push(inputKey)
    })

    this.stage = 'main'
    this.state.computing = 'fn'
    this.#recurse(ast)

    const fnBody = `
      ${this.#filterPrefix()}
      var fn=function(s,l){
        ${this.#varsDefinition()} ${this.state.fn.body.join('')}
      };
      ${this.#watchFns()}
      return fn;`

    const fn = new Function(
      'ensureSafeMemberName',
      'ensureSafeObject',
      'ensureSafeFunction',
      'ifDefined',
      'filter',
      fnBody,
    )(
      ensure.safeMemberName,
      ensure.safeObject,
      ensure.safeFunction,
      this.#ifDefined,
      filter,
    )
    fn.literal = isLiteral(ast)
    fn.constant = ast.constant
    return fn
  }

  #recurse(ast, context, create) {
    switch (ast.type) {
      case AST.Program: {
        initial(ast.body).forEach((stmt) => {
          this.state[this.state.computing].body.push(this.#recurse(stmt), ';')
        })
        this.state[this.state.computing].body.push(
          'return ',
          this.#recurse(last(ast.body)),
          ';',
        )
        break
      }

      case AST.Literal:
        return escape(ast.value)

      case AST.ArrayExpression:
        const elements = ast.elements.map((element) => this.#recurse(element))
        return '[' + elements.join(',') + ']'

      case AST.ObjectExpression:
        const properties = ast.properties.map((property) => {
          const key =
            property.key.type === AST.Identifier
              ? property.key.name
              : escape(property.key.value)
          const value = this.#recurse(property.value)
          return key + ':' + value
        })
        return '{' + properties.join(',') + '}'

      case AST.Identifier: {
        ensure.safeMemberName(ast.name)
        const intoId = this.#nextId()

        const hasL =
          this.stage === 'inputs'
            ? 'false'
            : this.#getHasOwnProperty('l', ast.name)
        const lAssignment = this.#assign(
          intoId,
          this.#nonComputedMember('l', ast.name),
        )
        this.#if_(hasL, lAssignment)

        if (create) {
          const hasS = this.#getHasOwnProperty('s', ast.name)
          const createCondition =
            this.#not(hasL) + ' && s && ' + this.#not(hasS)
          const createAssignment = this.#assign(
            this.#nonComputedMember('s', ast.name),
            '{}',
          )
          this.#if_(createCondition, createAssignment)
        }

        const notHasLAndHasS = this.#not(hasL) + ' && s'
        const sAssignment = this.#assign(
          intoId,
          this.#nonComputedMember('s', ast.name),
        )
        this.#if_(notHasLAndHasS, sAssignment)

        if (context) {
          context.context = hasL + ' ? l : s'
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
            const computed = this.#computedMember(left, right)
            const createClause = this.#not(computed)
            const createAssignment = this.#assign(computed, '{}')
            this.#if_(createClause, createAssignment)
          }
          assignment = this.#assign(
            intoId,
            'ensureSafeObject(' + this.#computedMember(left, right) + ')',
          )
          if (context) {
            context.name = right
            context.computed = true
          }
        } else {
          ensure.safeMemberName(ast.property.name)
          if (create) {
            const nonComputed = this.#nonComputedMember(left, ast.property.name)
            const createClause = this.#not(nonComputed)
            const createAssignment = this.#assign(nonComputed, '{}')
            this.#if_(createClause, createAssignment)
          }
          assignment = this.#assign(
            intoId,
            'ensureSafeObject(' +
              this.#nonComputedMember(left, ast.property.name) +
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

      case AST.CallExpression: {
        if (ast.filter) {
          const callee = this.#filter(ast.callee.name)
          const args = ast.arguments.map((arg) => this.#recurse(arg))
          return callee + '(' + args + ')'
        } else {
          const callContext = {}
          let callee = this.#recurse(ast.callee, callContext)
          const args = ast.arguments.map(
            (arg) => 'ensureSafeObject(' + this.#recurse(arg) + ')',
          )
          if (callContext.name) {
            this.#addEnsureSafeObject(callContext.context)
            if (callContext.computed) {
              callee = this.#computedMember(
                callContext.context,
                callContext.name,
              )
            } else {
              callee = this.#nonComputedMember(
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
        }
      }

      case AST.AssignmentExpression: {
        const lftContext = {}
        this.#recurse(ast.left, lftContext, true) // Automatically create missing nested properties
        const leftExpr = lftContext.computed
          ? this.#computedMember(lftContext.context, lftContext.name)
          : this.#nonComputedMember(lftContext.context, lftContext.name)
        const rightExpr = 'ensureSafeObject(' + this.#recurse(ast.right) + ')'
        return this.#assign(leftExpr, rightExpr)
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
        this.state[this.state.computing].body.push(
          this.#assign(intoId, this.#recurse(ast.left)),
        )
        this.#if_(
          ast.operator === '&&' ? intoId : this.#not(intoId),
          this.#assign(intoId, this.#recurse(ast.right)),
        )
        return intoId
      }

      case AST.ConditionalExpression: {
        const intoId = this.#nextId()
        const testId = this.#nextId()
        this.state[this.state.computing].body.push(
          this.#assign(testId, this.#recurse(ast.test)),
        )
        this.#if_(testId, this.#assign(intoId, this.#recurse(ast.consequent)))
        this.#if_(
          this.#not(testId),
          this.#assign(intoId, this.#recurse(ast.alternate)),
        )
        return intoId
      }
    }
  }

  #if_(test, consequent) {
    this.state[this.state.computing].body.push(
      'if(',
      test,
      '){',
      consequent,
      '}',
    )
  }

  #ifDefined_ = (value, defaultValue) =>
    'ifDefined(' + value + ',' + escape(defaultValue) + ')'

  #nextId(skip) {
    const id = 'v' + this.state.nextId++
    if (!skip) this.state[this.state.computing].vars.push(id)
    return id
  }

  #varsDefinition = () =>
    this.state.fn.vars.length ? 'var ' + this.state.fn.vars.join(',') + ';' : ''

  #filter(name) {
    if (!this.state.filters.hasOwnProperty(name)) {
      // reuse already existing name
      this.state.filters[name] = this.#nextId(true)
    }
    return this.state.filters[name]
  }

  #filterPrefix() {
    if (isEmpty(this.state.filters)) {
      return '' // No filters used, don't apply prefix
    } else {
      const parts = []
      for (const [filterName, varName] of Object.entries(this.state.filters)) {
        parts.push(varName + ' = filter(' + escape(filterName) + ')')
      }
      return 'var ' + parts.join(',') + ';'
    }
  }

  #assign = (id, value) => id + '=' + value + ';'
  #not = (e) => '!(' + e + ')'

  #getHasOwnProperty = (object, property) =>
    object + ' && (' + escape(property) + ' in ' + object + ')'

  #nonComputedMember = (left, right) => '(' + left + ').' + right
  #computedMember = (left, right) => '(' + left + ')[' + right + ']'

  #ifDefined = (value, defaultValue) =>
    typeof value === 'undefined' ? defaultValue : value

  #addEnsureSafeMemberName(expr) {
    this.state[this.state.computing].body.push(
      'ensureSafeMemberName(' + expr + ');',
    )
  }

  #addEnsureSafeObject(expr) {
    this.state[this.state.computing].body.push(
      'ensureSafeObject(' + expr + ');',
    )
  }

  #addEnsureSafeFunction(expr) {
    this.state[this.state.computing].body.push(
      'ensureSafeFunction(' + expr + ');',
    )
  }

  #watchFns() {
    const result = []
    this.state.inputs.forEach((inputName) => {
      result.push(
        'var ',
        inputName,
        ' = function(s) {',
        this.state[inputName].vars.length
          ? 'var ' + this.state[inputName].vars.join(',') + ';'
          : '',
        this.state[inputName].body.join(''),
        '};',
      )
    })
    if (result.length) {
      result.push('fn.inputs = [', this.state.inputs.join(','), '];')
    }
    return result.join('')
  }
}
