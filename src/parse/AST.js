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
    let primary
    if (this.#expect('[')) {
      primary = this.#array()
    } else if (this.#expect('{')) {
      primary = this.#object()
    } else if (this.tokens[0].text in AST.#primitiveValues) {
      primary = this.#primitiveValue()
    } else if (this.#peek().identifier) {
      primary = this.#identifier()
    } else {
      primary = this.#constant()
    }
    while (this.#expect('.')) {
      primary = {
        type: AST.MemberExpression,
        object: primary,
        property: this.#identifier(),
      }
    }
    return primary
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

  #primitiveValue() {
    return AST.#primitiveValues[this.#consume().text]
  }

  #array() {
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

  #peek(element) {
    if (this.tokens.length > 0) {
      const firstToken = this.tokens[0]
      if (firstToken.text === element || !element) {
        return firstToken
      }
    }
  }

  // @TODO: rename to peekAndTake()
  #expect(e) {
    if (this.#peek(e)) {
      return this.tokens.shift()
    }
  }

  // @TODO: rename to expect()
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
  static ThisExpression = 'ThisExpression'
  static MemberExpression = 'MemberExpression'

  static #primitiveValues = {
    null: { type: AST.Literal, value: null },
    true: { type: AST.Literal, value: true },
    false: { type: AST.Literal, value: false },
    this: { type: AST.ThisExpression },
  }
}
