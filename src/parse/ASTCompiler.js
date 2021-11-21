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
    return new Function('s', this.#varsDefinition() + this.state.body.join(''))
  }

  #recurse(ast) {
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

      case AST.Identifier:
        const intoId = this.#nextId()
        const assignment = ASTCompiler.#assign(
          intoId,
          ASTCompiler.#nonComputedMethod('s', ast.name),
        )
        this.#if_('s', assignment)
        return intoId
    }
  }

  #if_(test, consequent) {
    this.state.body.push('if(', test, '){', consequent, '}')
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

  static #stringEscapeRegex = /[^ a-zA-Z0-9]/g
  static #stringEscapeFn = (c) =>
    '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4)

  static #nonComputedMethod = (left, right) => '(' + left + ').' + right
}
