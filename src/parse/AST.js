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

  #program() {
    const body = []
    while (true) {
      if (this.tokens.length) {
        body.push(this.#filter())
      }
      if (!this.#peekAndTake(';')) {
        return { type: AST.Program, body }
      }
    }
  }

  // Defines the precedence of operators:
  // filter() calls assignment() that calls ternary() that call logicalOr() that calls logicalAnd()
  // that calls relational() that calls additive() that calls multiplicative()
  // that calls unary() that calls primary().
  // The precedence is opposite:
  // 1. Primary
  // 2. Unary
  // 3. Multiplicative
  // 4. Additive
  // 5. Relational
  // 6. Equality
  // 7. Logical AND
  // 8. Logical OR
  // 9. Ternary
  // 10. Assignment
  // 11. Filter
  #filter() {
    let left = this.#assignment()
    while (this.#peekAndTake('|')) {
      const args = [left]
      left = {
        type: AST.CallExpression,
        callee: this.#identifier(),
        arguments: args,
        filter: true, // Unlike normal functions filters are not in the scope
      }
      // Parse filter params
      while (this.#peekAndTake(':')) {
        args.push(this.#assignment())
      }
    }

    return left
  }

  #assignment() {
    const left = this.#ternary()
    if (this.#peekAndTake('=')) {
      const right = this.#ternary()
      return {
        type: AST.AssignmentExpression,
        left,
        right,
      }
    }

    return left
  }

  #ternary() {
    const test = this.#logicalOr()
    if (this.#peekAndTake('?')) {
      const consequent = this.#assignment()
      if (this.#expect(':')) {
        const alternate = this.#assignment()
        return {
          type: AST.ConditionalExpression,
          test,
          consequent,
          alternate,
        }
      }
    }

    return test
  }

  #logicalOr() {
    let left = this.#logicalAnd()
    let token
    while ((token = this.#peekAndTake('||'))) {
      left = {
        type: AST.LogicalExpression,
        left,
        operator: token.text,
        right: this.#logicalAnd(),
      }
    }

    return left
  }

  #logicalAnd() {
    let left = this.#equality()
    let token
    while ((token = this.#peekAndTake('&&'))) {
      left = {
        type: AST.LogicalExpression,
        left,
        operator: token.text,
        right: this.#equality(),
      }
    }

    return left
  }

  #equality() {
    let left = this.#relational()
    let token
    while ((token = this.#peekAndTake('==', '===', '!=', '!=='))) {
      left = {
        type: AST.BinaryExpression,
        left,
        operator: token.text,
        right: this.#relational(),
      }
    }

    return left
  }

  #relational() {
    let left = this.#additive()
    let token
    while ((token = this.#peekAndTake('>', '<', '>=', '<='))) {
      left = {
        type: AST.BinaryExpression,
        left,
        operator: token.text,
        right: this.#additive(),
      }
    }

    return left
  }

  #additive() {
    let left = this.#multiplicative()
    let token
    while ((token = this.#peekAndTake('+', '-'))) {
      left = {
        type: AST.BinaryExpression,
        left,
        operator: token.text,
        right: this.#multiplicative(),
      }
    }

    return left
  }

  #multiplicative() {
    let left = this.#unary()
    let token

    // Fallbacks to the unary in the worst case
    while ((token = this.#peekAndTake('*', '/', '%'))) {
      left = {
        type: AST.BinaryExpression,
        left,
        operator: token.text,
        right: this.#unary(),
      }
    }

    return left
  }

  #unary() {
    const token = this.#peekAndTake('+', '!', '-')
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
    if (this.#peekAndTake('(')) {
      // Start new precedence chain for parentheses
      primary = this.#filter()
      this.#expect(')')
    } else if (this.#peekAndTake('[')) {
      primary = this.#array()
    } else if (this.#peekAndTake('{')) {
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
    while ((next = this.#peekAndTake('.', '[', '('))) {
      if (next.text === '[') {
        // Computed expression (x[24], x['someField'], x[someField])
        primary = {
          type: AST.MemberExpression,
          object: primary,
          property: this.#primary(),
          computed: true,
        }
        this.#expect(']')
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
        this.#expect(')')
      }
    }

    return primary
  }

  #constant = () => ({ type: AST.Literal, value: this.#expect().value })

  #identifier = () => ({ type: AST.Identifier, name: this.#expect().text })

  #primitiveValue = () => AST.#primitiveValues[this.#expect().text]

  #array() {
    const elements = []
    if (!this.#peek(']')) {
      do {
        if (this.#peek(']')) {
          break // Trailing coma case
        }
        elements.push(this.#assignment())
      } while (this.#peekAndTake(','))
    }
    this.#expect(']')
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
        this.#expect(':')
        property.value = this.#assignment()
        properties.push(property)
      } while (this.#peekAndTake(','))
    }
    this.#expect('}')
    return { type: AST.ObjectExpression, properties }
  }

  #parseArguments() {
    const args = []
    if (!this.#peek(')')) {
      do {
        args.push(this.#assignment())
      } while (this.#peekAndTake(','))
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

  // Named `expect()` in original AngularJS implementation
  #peekAndTake(...elements) {
    if (this.#peek(...elements)) {
      return this.tokens.shift()
    }
  }

  // Named `consume()` in original AngularJS implementation
  #expect(e) {
    const token = this.#peekAndTake(e)
    if (!token) {
      throw 'Unexpected! Expecting: ' + e
    }
    return token
  }

  static externalAssignment = (ast) => ({
    type: AST.AssignmentExpression,
    left: ast.body[0],
    right: {
      type: AST.NGValueParameter,
    },
  })

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
  static LogicalExpression = 'LogicalExpression'
  static ConditionalExpression = 'ConditionalExpression'
  static NGValueParameter = 'NGValueParameter'

  static #primitiveValues = {
    null: { type: AST.Literal, value: null },
    true: { type: AST.Literal, value: true },
    false: { type: AST.Literal, value: false },
    this: { type: AST.ThisExpression },
    $locals: { type: AST.LocalsExpression },
  }
}
