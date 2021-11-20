// Builds Abstract Syntax Tree out of array of tokens provided by lexer
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
export class AST {
  constructor(lexer) {
    this.lexer = lexer
  }

  ast(text) {
    this.tokens = this.lexer.lex(text)
    return this.#program()
  }

  #primary() {
    if (this.#expect('[')) {
      return this.#arrayDeclaration()
    } else if (this.#expect('{')) {
      return this.#object()
    } else if (AST.#constants.hasOwnProperty(this.tokens[0].text)) {
      return AST.#constants[this.#consume().text]
    } else if (this.#peek().identifier) {
      return this.#identifier()
    } else {
      return this.#constant()
    }
  }

  #program() {
    return { type: AST.Program, body: this.#primary() }
  }

  #constant() {
    return { type: AST.Literal, value: this.#consume().value }
  }

  #identifier() {
    return { type: AST.Identifier, name: this.#consume().text }
  }

  #arrayDeclaration() {
    const elements = []
    if (!this.#peek(']')) {
      do {
        if (this.#peek(']')) {
          break // Trailing coma case
        }
        elements.push(this.#primary())
      } while (this.#expect(','))
    }
    this.#consume(']')
    return { type: AST.ArrayExpression, elements }
  }

  #object() {
    const properties = []
    if (!this.#peek('}')) {
      do {
        const property = { type: AST.Property }
        property.key = this.#peek().identifier
          ? this.#identifier()
          : this.#constant()
        this.#consume(':')
        property.value = this.#primary()
        properties.push(property)
      } while (this.#expect(','))
    }
    this.#consume('}')
    return { type: AST.ObjectExpression, properties }
  }

  #peek(e) {
    if (this.tokens.length > 0) {
      const text = this.tokens[0].text
      if (text === e || !e) {
        return this.tokens[0]
      }
    }
  }

  #expect(e) {
    const token = this.#peek(e)
    if (token) {
      return this.tokens.shift()
    }
  }

  #consume(e) {
    const token = this.#expect(e)
    if (!token) {
      throw 'Unexpected! Expecting: ' + e
    }
    return token
  }

  static Program = 'Program'
  static Literal = 'Literal'
  static ArrayExpression = 'ArrayExpression'
  static ObjectExpression = 'ObjectExpression'
  static Property = 'Property'
  static Identifier = 'Identifier'

  static #constants = {
    null: { type: AST.Literal, value: null },
    true: { type: AST.Literal, value: true },
    false: { type: AST.Literal, value: false },
  }
}
