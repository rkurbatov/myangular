import { initial, last, isEmpty } from 'lodash'

import { AST } from './AST'
import {
  ensure,
  escape,
  getInputs,
  isLiteral,
  isAssignable,
  markConstantAndWatchExpressions,
} from './astHelpers'
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
      assign: {
        body: [], // keeps assignment expression state
        vars: [],
      },
      inputs: [],
      nextId: 0, // basis of unique ids used by function
      filters: {}, // list of registered filters used in expression
    }
  }

  compile(text) {
    const ast = this.astBuilder.ast(text)
    let extra = ''
    markConstantAndWatchExpressions(ast)

    this.stage = 'inputs'
    ;(getInputs(ast.body) || []).forEach((input, idx) => {
      const inputKey = 'fn' + idx
      this.state[inputKey] = { body: [], vars: [] }
      this.state.computing = inputKey
      this.state[inputKey].body.push('return ' + this.#recurse(input) + ';')
      this.state.inputs.push(inputKey)
    })

    this.stage = 'assign'
    if (isAssignable(ast)) {
      this.state.computing = 'assign'
      this.state.assign.body.push(this.#recurse(AST.externalAssignment(ast)))
      extra =
        'fn.assign = function(s,v,l){' +
        (this.state.assign.vars.length
          ? 'var ' + this.state.assign.vars.join(',') + ';'
          : '') +
        this.state.assign.body.join('') +
        '};'
    }

    this.stage = 'main'
    this.state.computing = 'fn'
    this.#recurse(ast)

    const fnBody = `
      ${this.#filterPrefix()}
      var fn=function(s,l){
        ${this.#varsDefinition()} ${this.state.fn.body.join('')}
      };
      ${this.#watchFns()}
      ${extra}
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

  #bodyPush = (...values) => {
    this.state[this.state.computing].body.push(...values)
  }

  #recurse(ast, context, create) {
    switch (ast.type) {
      case AST.Program: {
        initial(ast.body).forEach((stmt) => {
          this.#bodyPush(this.#recurse(stmt), ';')
        })
        this.#bodyPush('return ', this.#recurse(last(ast.body)), ';')

        break
      }

      case AST.Literal:
        return escape(ast.value)

      case AST.ArrayExpression:
        const elements = ast.elements.map((element) => this.#recurse(element))
        return '[' + elements.join(',') + ']'

      case AST.ObjectExpression: {
        const properties = ast.properties.map((p) => {
          const key =
            p.key.type === AST.Identifier ? p.key.name : escape(p.key.value)
          const value = this.#recurse(p.value)
          return key + ':' + value
        })
        return '{' + properties.join(',') + '}'
      }

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
        this.#addIf(hasL, lAssignment)

        if (create) {
          const hasS = this.#getHasOwnProperty('s', ast.name)
          const createCondition =
            this.#not(hasL) + ' && s && ' + this.#not(hasS)
          const createAssignment = this.#assign(
            this.#nonComputedMember('s', ast.name),
            '{}',
          )
          this.#addIf(createCondition, createAssignment)
        }

        const notHasLAndHasS = this.#not(hasL) + ' && s'
        const sAssignment = this.#assign(
          intoId,
          this.#nonComputedMember('s', ast.name),
        )
        this.#addIf(notHasLAndHasS, sAssignment)

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

      case AST.NGValueParameter:
        return 'v'

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
          const computed = this.#computedMember(left, right)
          if (create) {
            const createClause = this.#not(computed)
            const createAssignment = this.#assign(computed, '{}')
            this.#addIf(createClause, createAssignment)
          }
          assignment = this.#assign(
            intoId,
            'ensureSafeObject(' + computed + ')',
          )
          if (context) {
            context.name = right
            context.computed = true
          }
        } else {
          ensure.safeMemberName(ast.property.name)
          const nonComputed = this.#nonComputedMember(left, ast.property.name)
          if (create) {
            const createClause = this.#not(nonComputed)
            const createAssignment = this.#assign(nonComputed, '{}')
            this.#addIf(createClause, createAssignment)
          }
          assignment = this.#assign(
            intoId,
            'ensureSafeObject(' + nonComputed + ')',
          )
          if (context) {
            context.name = ast.property.name
            context.computed = false
          }
        }
        this.#addIf(left, assignment)
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
        const argument = this.#ifDefined_(this.#recurse(ast.argument), 0)

        return ast.operator + '(' + argument + ')'
      }

      case AST.BinaryExpression: {
        const left = this.#recurse(ast.left)
        const right = this.#recurse(ast.right)

        if (['+', '-'].includes(ast.operator)) {
          const defLeft = this.#ifDefined_(left, 0)
          const defRight = this.#ifDefined_(right, 0)

          return '(' + defLeft + ')' + ast.operator + '(' + defRight + ')'
        } else {
          return '(' + left + ')' + ast.operator + '(' + right + ')'
        }
      }

      case AST.LogicalExpression: {
        const intoId = this.#nextId()
        const left = this.#recurse(ast.left)
        const right = this.#recurse(ast.right)

        this.#bodyPush(this.#assign(intoId, left))
        const cond = ast.operator === '&&' ? intoId : this.#not(intoId)
        this.#addIf(cond, this.#assign(intoId, right))

        return intoId
      }

      case AST.ConditionalExpression: {
        const intoId = this.#nextId()
        const testId = this.#nextId()

        this.#bodyPush(this.#assign(testId, this.#recurse(ast.test)))
        this.#addIf(testId, this.#assign(intoId, this.#recurse(ast.consequent)))
        const alternate = this.#recurse(ast.alternate)
        this.#addIf(this.#not(testId), this.#assign(intoId, alternate))

        return intoId
      }
    }
  }

  #addIf(test, consequent) {
    this.#bodyPush('if(', test, '){', consequent, '}')
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
    this.#bodyPush('ensureSafeMemberName(' + expr + ');')
  }
  #addEnsureSafeObject(expr) {
    this.#bodyPush('ensureSafeObject(' + expr + ');')
  }
  #addEnsureSafeFunction(expr) {
    this.#bodyPush('ensureSafeFunction(' + expr + ');')
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
