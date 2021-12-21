import { noop } from 'lodash'

import { Lexer } from './Lexer'
import { AST } from './AST'
import { ASTCompiler } from './ASTCompiler'

// Combines lexer, AST builder and compiler into single abstraction
export const parse = (expr) => {
  switch (typeof expr) {
    case 'string':
      const lexer = new Lexer()
      const ast = new AST(lexer)
      const astCompiler = new ASTCompiler(ast)

      return astCompiler.compile(expr)

    case 'function':
      // Don't parse if used for $watch arguments
      return expr

    default:
      return noop
  }
}
