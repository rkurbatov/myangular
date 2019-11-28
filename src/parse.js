import { isString, isNull } from "lodash";

const ESCAPES = {
  n: "\n",
  f: "\f",
  r: "\r",
  t: "\t",
  v: "\v",
  "'": "'",
  '"': '"'
};

// Splits input string on tokens
class Lexer {
  lex(text) {
    this.text = text; // program text to parse
    this.index = 0; // current character index
    this.ch = undefined; // current character
    this.tokens = []; // parsed tokens

    while (this.index < this.text.length) {
      this.ch = this.text.charAt(this.index);
      if (
        this.isNumber(this.ch) ||
        (this.ch === "." && this.isNumber(this.peek()))
      ) {
        this.readNumber();
      } else if (this.ch === "'" || this.ch === '"') {
        this.readString(this.ch);
      } else if (this.ch === "[" || this.ch === "]" || this.ch === ",") {
        this.tokens.push({
          text: this.ch
        });
        this.index++;
      } else if (this.isIdent(this.ch)) {
        this.readIdent();
      } else if (this.isWhiteSpace(this.ch)) {
        this.index++;
      } else {
        throw "Unexpected next character: " + this.ch;
      }
    }

    return this.tokens;
  }

  // Peeks next symbol (if any)
  peek() {
    return this.index < this.text.length - 1
      ? this.text.charAt(this.index + 1)
      : false;
  }

  isNumber(ch) {
    return "0" <= ch && ch <= "9";
  }

  isExpOperator(ch) {
    return ch === "-" || ch === "+" || this.isNumber(ch);
  }

  isIdent(ch) {
    return (
      (ch >= "a" && ch <= "z") ||
      (ch >= "A" && ch <= "Z") ||
      ch === "_" ||
      ch === "$"
    );
  }

  isWhiteSpace(ch) {
    return [" ", "\r", "\t", "\n", "\v", "\u00A0"].includes(ch);
  }

  readNumber() {
    let number = "";
    while (this.index < this.text.length) {
      const ch = this.text.charAt(this.index).toLowerCase();
      if (ch === "." || this.isNumber(ch)) {
        number += ch;
      } else {
        const nextCh = this.peek();
        const prevCh = number.charAt(number.length - 1);
        if (ch === "e" && this.isExpOperator(nextCh)) {
          number += ch;
        } else if (
          this.isExpOperator(ch) &&
          prevCh === "e" &&
          nextCh &&
          this.isNumber(nextCh)
        ) {
          number += ch;
        } else if (
          this.isExpOperator(ch) &&
          prevCh === "e" &&
          (!nextCh || !this.isNumber(ch))
        ) {
          throw "Invlaid exponent!";
        } else {
          break;
        }
      }
      this.index++;
    }
    this.tokens.push({
      text: number,
      value: Number(number)
    });
  }

  // Takes quote symbol (either ' or ") as an input param
  readString(quote) {
    this.index++;
    let string = "";
    let escape = false;
    while (this.index < this.text.length) {
      var ch = this.text.charAt(this.index);
      // Parse escaped strings - either Unicode or standard ASCII escape-sequences
      if (escape) {
        if (ch === "u") {
          const hex = this.text.substring(this.index + 1, this.index + 5);
          if (!hex.match(/[\da-f]{4}/i)) {
            throw "Invalid unicode escape";
          }
          this.index += 4;
          string += String.fromCharCode(parseInt(hex, 16));
        } else {
          const replacement = ESCAPES[ch];
          if (replacement) {
            string += replacement;
          } else {
            string += ch;
          }
        }
        escape = false;
      } else if (ch === quote) {
        this.index++;
        this.tokens.push({
          text: string,
          value: string
        });
        return;
      } else if (ch === "\\") {
        escape = true;
      } else {
        string += ch;
      }
      this.index++;
    }
    throw "Unmatched quote";
  }

  readIdent() {
    let text = "";
    while (this.index < this.text.length) {
      const ch = this.text.charAt(this.index);
      if (this.isIdent(ch) || this.isNumber(ch)) {
        text += ch;
      } else {
        break;
      }
      this.index++;
    }
    const token = { text: text };
    this.tokens.push(token);
  }
}

// Builds Abstract Syntax Tree out of tokens
class AST {
  constructor(lexer) {
    this.lexer = lexer;
  }

  ast(text) {
    this.tokens = this.lexer.lex(text);
    return this.program();
  }

  program() {
    return { type: AST.Program, body: this.primary() };
  }

  primary() {
    if (this.expect("[")) {
      return this.arrayDeclaration();
    } else if (AST.constants.hasOwnProperty(this.tokens[0].text)) {
      return AST.constants[this.consume().text];
    } else {
      return this.constant();
    }
  }

  constant() {
    return { type: AST.Literal, value: this.consume().value };
  }

  arrayDeclaration() {
    const elements = [];
    if (!this.peek("]")) {
      do {
        if (this.peek(']')) {
          break; // Trailing coma case
        }
        elements.push(this.primary());
      } while (this.expect(","));
    }
    this.consume("]");
    return { type: AST.ArrayExpression, elements };
  }

  peek(e) {
    if (this.tokens.length > 0) {
      const text = this.tokens[0].text;
      if (text === e || !e) {
        return this.tokens[0];
      }
    }
  }

  expect(e) {
    const token = this.peek(e);
    if (token) {
      return this.tokens.shift();
    }
  }

  consume(e) {
    const token = this.expect(e);
    if (!token) {
      throw "Unexpected! Expecting: " + e;
    }
    return token;
  }

  static Program = "Program";
  static Literal = "Literal";
  static ArrayExpression = "ArrayExpression";
  static constants = {
    null: { type: AST.Literal, value: null },
    true: { type: AST.Literal, value: true },
    false: { type: AST.Literal, value: false }
  };
}

// Compiles AST into Expression Function
class ASTCompiler {
  constructor(astBuilder) {
    this.astBuilder = astBuilder;
  }

  compile(text) {
    const ast = this.astBuilder.ast(text);
    this.state = { body: [] };
    this.recurse(ast);
    return new Function(this.state.body.join(""));
  }

  escape(value) {
    if (isString(value)) {
      return (
        "'" +
        value.replace(
          ASTCompiler.stringEscapeRegex,
          ASTCompiler.stringEscapeFn
        ) +
        "'"
      );
    } else if (isNull(value)) {
      return "null";
    } else {
      return value;
    }
  }

  recurse(ast) {
    switch (ast.type) {
      case AST.Program:
        this.state.body.push("return ", this.recurse(ast.body), ";");
        break;
      case AST.Literal:
        return this.escape(ast.value);
      case AST.ArrayExpression:
        const elements = ast.elements.map(element => this.recurse(element));
        return "[" + elements.join(",") + "]";
    }
  }

  static stringEscapeRegex = /[^ a-zA-Z0-9]/g;
  static stringEscapeFn = c =>
    "\\u" + ("0000" + c.charCodeAt(0).toString(16)).slice(-4);
}

class Parser {
  constructor(lexer) {
    this.lexer = lexer;
    this.ast = new AST(this.lexer);
    this.astCompiler = new ASTCompiler(this.ast);
  }

  parse(text) {
    return this.astCompiler.compile(text);
  }
}

export const parse = expr => {
  const lexer = new Lexer();
  const parser = new Parser(lexer);
  return parser.parse(expr);
};
