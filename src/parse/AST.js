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

  // Defines the precedence of operators:
  // Assignment calls multiplicative that calls unary that calls primary.
  // The precedence is opposite:
  // 1. Primary, 2. Unary, 3. Multiplicative, 4. Assignment
  #assignment() {
    const left = this.#multiplicative()
    if (this.#expect('=')) {
      const right = this.#multiplicative()
      return {
        type: AST.AssignmentExpression,
        left,
        right,
      }
    }
    return left
  }

  #multiplicative() {
    let left = this.#unary()
    let token

    // Fallbacks to the unary in the worst case
    while ((token = this.#expect('*', '/', '%'))) {
      left = {
        type: AST.BinaryExpression,
        left: left,
        operator: token.text,
        right: this.#unary(),
      }
    }

    return left
  }

  #unary() {
    const token = this.#expect('+', '!', '-')
    if (token) {
      return {
        type: AST.UnaryExpression,
        operator: token.text,
        argument: this.#unary(), // Lets parsing of several '!' operators in a row
      }
    } else {
      return this.#primary() // Fallback to primary
    }
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

    // Object property lookup both computed and non-computed and function calls
    let next
    while ((next = this.#expect('.', '[', '('))) {
      if (next.text === '[') {
        // Computed expression (x[24], x['someField'], x[someField])
        primary = {
          type: AST.MemberExpression,
          object: primary,
          property: this.#primary(),
          computed: true,
        }
        this.#consume(']')
      } else if (next.text === '.') {
        // Non-computed expression (x.someField)
        primary = {
          type: AST.MemberExpression,
          object: primary,
          property: this.#identifier(),
          computed: false,
        }
      } else if (next.text === '(') {
        primary = {
          type: AST.CallExpression,
          callee: primary,
          arguments: this.#parseArguments(),
        }
        this.#consume(')')
      }
    }

    return primary
  }

  #program() {
    return { type: AST.Program, body: this.#assignment() }
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
        elements.push(this.#assignment())
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
        property.value = this.#assignment()
        properties.push(property)
      } while (this.#expect(','))
    }
    this.#consume('}')
    return { type: AST.ObjectExpression, properties }
  }

  #parseArguments() {
    const args = []
    if (!this.#peek(')')) {
      do {
        args.push(this.#assignment())
      } while (this.#expect(','))
    }
    return args
  }

  #peek(...elements) {
    if (this.tokens.length > 0) {
      const firstToken = this.tokens[0]
      if (elements.includes(firstToken.text) || !elements.some(Boolean)) {
        return firstToken
      }
    }
  }

  // @TODO: rename to peekAndTake()
  #expect(...elements) {
    if (this.#peek(...elements)) {
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
  static LocalsExpression = 'LocalsExpression'
  static MemberExpression = 'MemberExpression'
  static CallExpression = 'CallExpression'
  static AssignmentExpression = 'AssignmentExpression'
  static UnaryExpression = 'UnaryExpression'
  static BinaryExpression = 'BinaryExpression'

  static #primitiveValues = {
    null: { type: AST.Literal, value: null },
    true: { type: AST.Literal, value: true },
    false: { type: AST.Literal, value: false },
    this: { type: AST.ThisExpression },
    $locals: { type: AST.LocalsExpression },
  }
}
