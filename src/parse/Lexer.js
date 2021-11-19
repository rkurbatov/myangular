const ESCAPES = {
  n: '\n',
  f: '\f',
  r: '\r',
  t: '\t',
  v: '\v',
  "'": "'",
  '"': '"',
}

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
    this.ch = undefined // current character
    this.tokens = [] // parsed tokens

    while (this.index < this.text.length) {
      this.ch = this.text.charAt(this.index)
      if (
        this.isNumber(this.ch) ||
        (this.is('.') && this.isNumber(this.peek()))
      ) {
        this.readNumber()
      } else if (this.is('\'"')) {
        this.readString(this.ch)
      } else if (this.is('[],{}:')) {
        this.tokens.push({
          text: this.ch,
        })
        this.index++
      } else if (this.isIdent(this.ch)) {
        this.readIdentifier()
      } else if (this.isWhiteSpace(this.ch)) {
        this.index++
      } else {
        throw 'Unexpected next character: ' + this.ch
      }
    }

    return this.tokens
  }

  // Peeks next symbol (if any)
  peek() {
    return this.index < this.text.length - 1
      ? this.text.charAt(this.index + 1)
      : false
  }

  is(chs) {
    return chs.includes(this.ch)
  }

  isNumber(ch) {
    return '0' <= ch && ch <= '9'
  }

  isExpOperator(ch) {
    return ch === '-' || ch === '+' || this.isNumber(ch)
  }

  isIdent(ch) {
    return (
      (ch >= 'a' && ch <= 'z') ||
      (ch >= 'A' && ch <= 'Z') ||
      ch === '_' ||
      ch === '$'
    )
  }

  isWhiteSpace(ch) {
    return [' ', '\r', '\t', '\n', '\v', '\u00A0'].includes(ch)
  }

  readNumber() {
    let number = ''
    while (this.index < this.text.length) {
      const ch = this.text.charAt(this.index).toLowerCase()
      if (ch === '.' || this.isNumber(ch)) {
        number += ch
      } else {
        const nextCh = this.peek()
        const prevCh = number.charAt(number.length - 1)
        if (ch === 'e' && this.isExpOperator(nextCh)) {
          number += ch
        } else if (
          this.isExpOperator(ch) &&
          prevCh === 'e' &&
          nextCh &&
          this.isNumber(nextCh)
        ) {
          number += ch
        } else if (
          this.isExpOperator(ch) &&
          prevCh === 'e' &&
          (!nextCh || !this.isNumber(ch))
        ) {
          throw 'Invlaid exponent!'
        } else {
          break
        }
      }
      this.index++
    }
    this.tokens.push({
      text: number,
      value: Number(number),
    })
  }

  // Takes quote symbol (either ' or ") as an input param
  readString(quote) {
    this.index++
    let string = ''
    let escape = false
    while (this.index < this.text.length) {
      const ch = this.text.charAt(this.index)
      // Parse escaped strings - either Unicode or standard ASCII escape-sequences
      if (escape) {
        if (ch === 'u') {
          const hex = this.text.substring(this.index + 1, this.index + 5)
          if (!hex.match(/[\da-f]{4}/i)) {
            throw 'Invalid unicode escape'
          }
          this.index += 4
          string += String.fromCharCode(parseInt(hex, 16))
        } else {
          const replacement = ESCAPES[ch]
          if (replacement) {
            string += replacement
          } else {
            string += ch
          }
        }
        escape = false
      } else if (ch === quote) {
        this.index++
        this.tokens.push({
          text: string,
          value: string,
        })
        return
      } else if (ch === '\\') {
        escape = true
      } else {
        string += ch
      }
      this.index++
    }
    throw 'Unmatched quote'
  }

  readIdentifier() {
    let text = ''
    while (this.index < this.text.length) {
      const ch = this.text.charAt(this.index)
      if (this.isIdent(ch) || this.isNumber(ch)) {
        text += ch
      } else {
        break
      }
      this.index++
    }
    this.tokens.push({
      text,
      identifier: true,
    })
  }
}
