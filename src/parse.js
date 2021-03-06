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

// Splits input string on tokens, returns array of such tokens
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
        (this.is(".") && this.isNumber(this.peek()))
      ) {
        this.readNumber();
      } else if (this.is("'\"")) {
        this.readString(this.ch);
      } else if (this.is("[],{}:")) {
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

  is(chs) {
    return chs.includes(this.ch);
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
    const token = { text, identifier: true };
    this.tokens.push(token);
  }
}

// Builds Abstract Syntax Tree out of array of tokens provided by lexer
class AST {
  constructor(lexer) {
    this.lexer = lexer;
  }

  ast(text) {
    this.tokens = this.lexer.lex(text);
    return this.program();
  }

  primary() {
    if (this.expect("[")) {
      return this.arrayDeclaration();
    } else if (this.expect("{")) {
      return this.object();
    } else if (AST.constants.hasOwnProperty(this.tokens[0].text)) {
      return AST.constants[this.consume().text];
    } else {
      return this.constant();
    }
  }

  program() {
    return { type: AST.Program, body: this.primary() };
  }

  constant() {
    return { type: AST.Literal, value: this.consume().value };
  }

  identifier() {
    return { type: AST.Identifier, name: this.consume().text };
  }

  arrayDeclaration() {
    const elements = [];
    if (!this.peek("]")) {
      do {
        if (this.peek("]")) {
          break; // Trailing coma case
        }
        elements.push(this.primary());
      } while (this.expect(","));
    }
    this.consume("]");
    return { type: AST.ArrayExpression, elements };
  }

  object() {
    const properties = [];
    if (!this.peek("}")) {
      do {
        const property = { type: AST.Property };
        property.key = this.peek().identifier
          ? this.identifier()
          : this.constant();
        this.consume(":");
        property.value = this.primary();
        properties.push(property);
      } while (this.expect(","));
    }
    this.consume("}");
    return { type: AST.ObjectExpression, properties };
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
  static ObjectExpression = "ObjectExpression";
  static Property = "Property";
  static Identifier = "Identifier";
  static constants = {
    null: { type: AST.Literal, value: null },
    true: { type: AST.Literal, value: true },
    false: { type: AST.Literal, value: false }
  };
}

// Compiles AST into Expression Function that evaluates expression represented in tree
class ASTCompiler {
  constructor(astBuilder) {
    this.astBuilder = astBuilder;
    this.state = { body: [] };
  }

  compile(text) {
    const ast = this.astBuilder.ast(text);
    this.recurse(ast);
    return new Function(this.state.body.join(""));
  }

  recurse(ast) {
    switch (ast.type) {
      case AST.Program:
        this.state.body.push("return ", this.recurse(ast.body), ";");
        break;
      case AST.Literal:
        return ASTCompiler.escape(ast.value);
      case AST.ArrayExpression:
        const elements = ast.elements.map(element => this.recurse(element));
        return "[" + elements.join(",") + "]";
      case AST.ObjectExpression:
        const properties = ast.properties.map(property => {
          const key =
            property.key.type === AST.Identifier
              ? property.key.name
              : ASTCompiler.escape(property.key.value);
          const value = this.recurse(property.value);
          return key + ":" + value;
        });
        return "{" + properties.join(",") + "}";
    }
  }

  static escape(value) {
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

  static stringEscapeRegex = /[^ a-zA-Z0-9]/g;
  static stringEscapeFn = c =>
    "\\u" + ("0000" + c.charCodeAt(0).toString(16)).slice(-4);
}

// Combines lexer, AST builder and compiler into single abstraction
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
