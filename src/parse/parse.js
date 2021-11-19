import { Lexer } from './Lexer'
import { AST } from './AST'
import { ASTCompiler } from './ASTCompiler'

// Combines lexer, AST builder and compiler into single abstraction
export const parse = (expr) => {
  const lexer = new Lexer()
  const ast = new AST(lexer)
  const astCompiler = new ASTCompiler(ast)

  return astCompiler.compile(expr)
}
