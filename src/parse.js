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

  readNumber() {
    let number = "";
    while (this.index < this.text.length) {
      const ch = this.text.charAt(this.index);
      if (ch === "." || this.isNumber(ch)) {
        number += ch;
      } else {
        break;
      }
      this.index++;
    }
    this.tokens.push({
      text: number,
      value: Number(number)
    });
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
    return { type: AST.Program, body: this.constant() };
  }

  constant() {
    return { type: AST.Literal, value: this.tokens[0].value };
  }

  static Program = "Program";
  static Literal = "Literal";
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

  recurse(ast) {
    switch (ast.type) {
      case AST.Program:
        this.state.body.push("return ", this.recurse(ast.body), ";");
        break;
      case AST.Literal:
        return ast.value;
    }
  }
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
