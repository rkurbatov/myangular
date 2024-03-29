// Splits input string on tokens, returns array of such tokens
// For example
// string 'a + b' is converted into
// [
//   { text: 'a', identifier: true },
//   { text: '+' },
//   { text: 'b', identifier: true },
// ]
//
// Every token is an object of type { text: string, value: any, identifier: boolean }
export class Lexer {
  lex(text) {
    this.text = text // program text to parse
    this.index = 0 // current character index
    this.tokens = [] // parsed tokens

    while (this.index < this.text.length) {
      const ch = this.text.charAt(this.index)
      if (
        Lexer.#isNumber(ch) ||
        (Lexer.#isOneOf('.', ch) && Lexer.#isNumber(this.#peekNextChar()))
      ) {
        this.#readNumber()
      } else if (Lexer.#isOneOf('\'"', ch)) {
        this.#readString(ch)
      } else if (Lexer.#isOneOf('[],{}:.()?;', ch)) {
        this.#readSymbol(ch)
      } else if (Lexer.#isIdentifier(ch)) {
        this.#readIdentifier()
      } else if (Lexer.#isWhiteSpace(ch)) {
        this.#moveToNextChar()
      } else {
        const ch2 = ch + this.#peekNextChar()
        const ch3 = ch2 + this.#peekNextChar(2)
        // 1, 2 or 3-symbol operators
        const op = Lexer.#OPERATORS[ch]
        const op2 = Lexer.#OPERATORS[ch2]
        const op3 = Lexer.#OPERATORS[ch3]

        if (op || op2 || op3) {
          const token = op3 ? ch3 : op2 ? ch2 : ch
          this.tokens.push({ text: token })
          this.#moveToNextChar(token.length)
        } else {
          throw 'Unexpected next character: ' + ch
        }
      }
    }

    return this.tokens
  }

  #peekNextChar(n = 1) {
    return this.index + n < this.text.length
      ? this.text.charAt(this.index + n)
      : false
  }

  #moveToNextChar(n) {
    if (!n) this.index++
    else this.index += n
  }

  #readNumber() {
    let number = ''
    while (this.index < this.text.length) {
      const ch = this.text.charAt(this.index).toLowerCase()
      if (ch === '.' || Lexer.#isNumber(ch)) {
        number += ch
      } else {
        const nextCh = this.#peekNextChar()
        const prevCh = number.charAt(number.length - 1)
        if (ch === 'e' && Lexer.#isExpOperator(nextCh)) {
          number += ch
        } else if (
          Lexer.#isExpOperator(ch) &&
          prevCh === 'e' &&
          nextCh &&
          Lexer.#isNumber(nextCh)
        ) {
          number += ch
        } else if (
          Lexer.#isExpOperator(ch) &&
          prevCh === 'e' &&
          (!nextCh || !Lexer.#isNumber(ch))
        ) {
          throw 'Invalid exponent!'
        } else {
          break
        }
      }
      this.#moveToNextChar()
    }
    this.tokens.push({
      text: number,
      value: Number(number),
    })
  }

  // Takes quote symbol (either ' or ") as an input param
  #readString(quote) {
    this.#moveToNextChar() // skip the quote symbol
    let string = ''
    let rawString = quote // The string surrounded by quotes
    let escape = false
    while (this.index < this.text.length) {
      const ch = this.text.charAt(this.index)
      rawString += ch
      // Parse escaped strings - either Unicode or standard ASCII escape-sequences
      if (escape) {
        if (ch === 'u') {
          const hex = this.text.substring(this.index + 1, this.index + 5)
          if (!hex.match(/[\da-f]{4}/i)) {
            throw 'Invalid unicode escape'
          }
          this.#moveToNextChar(4)
          string += String.fromCharCode(parseInt(hex, 16))
        } else {
          const replacement = Lexer.#ESCAPES[ch]
          if (replacement) {
            string += replacement
          } else {
            string += ch
          }
        }
        escape = false
      } else if (ch === quote) {
        this.tokens.push({
          text: rawString,
          value: string,
        })
        this.#moveToNextChar()
        return
      } else if (ch === '\\') {
        escape = true
      } else {
        string += ch
      }
      this.#moveToNextChar()
    }
    throw 'Unmatched quote'
  }

  #readSymbol(ch) {
    this.tokens.push({
      text: ch,
    })
    this.#moveToNextChar()
  }

  #readIdentifier() {
    let text = ''
    while (this.index < this.text.length) {
      const ch = this.text.charAt(this.index)
      if (Lexer.#isIdentifier(ch) || Lexer.#isNumber(ch)) {
        text += ch
      } else {
        break
      }
      this.#moveToNextChar()
    }
    this.tokens.push({
      text,
      identifier: true,
    })
  }

  // Lexer helpers

  static #isOneOf(chs, ch) {
    return chs.includes(ch)
  }

  static #isNumber(ch) {
    return '0' <= ch && ch <= '9'
  }

  static #isExpOperator(ch) {
    return ch === '-' || ch === '+' || Lexer.#isNumber(ch)
  }

  static #isIdentifier(ch) {
    return (
      (ch >= 'a' && ch <= 'z') ||
      (ch >= 'A' && ch <= 'Z') ||
      ch === '_' ||
      ch === '$'
    )
  }

  static #isWhiteSpace(ch) {
    return [' ', '\r', '\t', '\n', '\v', '\u00A0'].includes(ch)
  }

  static #ESCAPES = {
    n: '\n',
    f: '\f',
    r: '\r',
    t: '\t',
    v: '\v',
    "'": "'",
    '"': '"',
  }

  static #OPERATORS = {
    '+': true, // Unary and binary plus
    '!': true, // Unary negation
    '-': true, // Unary and binary minus
    '*': true,
    '/': true,
    '%': true,
    '=': true, // Assignment
    '==': true,
    '!=': true,
    '===': true,
    '!==': true,
    '<': true,
    '>': true,
    '<=': true,
    '>=': true,
    '&&': true,
    '||': true,
    '|': true,
  }
}
