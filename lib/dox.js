/*!
 * Module dependencies.
 */
const { EOL } = require('os')
const debug = console;//require('./debug');
const { SyntaxNode, StatementSyntaxNode } = require('./syntax')
const { CodeContext, Comment } = require('./comment')

const { JavadocTokenizer } = require('./javadoc/lexer');
const { PlsqlTokenizer } = require('./plsql/lexer')
const { PlsqlNodeReader,
  ExceptionDeclarationStatementSyntaxNode,
  TypeDeclarationStatementSyntaxNode,
  ParameterDeclarationExpressionSyntaxNode,
  PlsqlUnitName,
  PlsqlItemName,
  CreatePlsqlUnitStatementSyntaxNode,
  ObjectAttributeDeclarationExpressionSyntaxNode,
  MethodDeclarationStatementSyntaxNode,
  ReturnDeclarationExpressionSyntaxNode
} = require('./plsql/syntax');
const { JavadocNodeReader } = require('./javadoc/syntax');

/**
 * @typedef {import("./lexer").Token} Token
 */

/** */
class DocumentGenerator {
  plsqlLexer = new PlsqlTokenizer()

  /**
   * @param {object} options
   */
  constructor(options = {}) {
    this.options = options ?? {}
  }

  /**
   * Parse tokens into syntactic nodes.
   * @param {string} text
   * @returns {Generator<SyntaxNode>}
   */
  *parseSyntax(text, { filename } = {}) {
    yield* new PlsqlNodeReader(this.plsqlLexer.parse(text, { filename }))
  };

  /**
   * Parse comments in the given string of `js`.
   *
   * @generator
   * @param {SyntaxNode} syntax
   * @param {ReadContext} parentContext
   * @returns {Generator<Comment>}
   * @yields {Comment}
   * @see readComment
   * @api public
   */
  *readComments(syntax, parentContext) {
    console.assert(syntax instanceof SyntaxNode)
    console.assert(parentContext)

    yield this.readComment(syntax, parentContext)

    // Read descendant comments
    switch (syntax.kind) {
      case 'CreatePackageStatement':
      case 'CreateBaseObjectTypeStatement':
        {
          const unitContext = { ids: new IdGenerator() }
          for (const child of syntax.members) {
            yield* this.readComments(child, unitContext)
          }
          break
        }
      case 'CreateNestedTableTypeStatement':
      case 'EmptyStatement':
      case 'Statement':
      case 'Identifier':
      case 'reserved':
      case 'keyword':
      case 'operator':
      case 'trivia':
        // don't care about these
        break
      default:
        if (syntax.kind.endsWith("DeclarationStatement")) { break }
        if (syntax.kind.endsWith("DeclarationExpression")) { break }
        console.warn('unhandled descendant analysis', syntax.kind, syntax.toString())
        break
    }

    // console.groupEnd()

  }

  /**
   * Parse comments in the given string of `js`.
   *
   * @generator
   * @param {String} text
   * @param {String?} file The file path (optional)
   * @returns {Generator<Comment>}
   * @yields {Comment}
   * @see this.parseComment
   * @api public
   */
  *parseComments(text, { filename }) {
    const parentContext = new ReadContext()

    for (const syntax of this.parseSyntax(text, { filename })) {
      yield* this.readComments(syntax, parentContext)
    }
  };

  javadocLexer = new JavadocTokenizer();

  /**
   * Extract doc comments and parse them as Javadoc/JSDoc/PLDoc.
   * @param {SyntaxNode} syntax PL/SQL syntax
   */
  *parseDocCommentSyntax(syntax) {
    for (const token of syntax.getDocumentComments()) {
      for (const docSyntax of new JavadocNodeReader(this.javadocLexer.parse(token.text, { ...token.start }))) {
        yield docSyntax
      }
    }
  }


  /**
   * Parse the given comment `str`.
   *
   * @param {Token} token A PL/SQL comment token.
   * @param {SyntaxNode} code The associated code
   * @return {Comment}
   * @api public
   */

  readComment(code, parentContext) {
    // Extract doc comments
    return new Comment({
      code,
      nodes: [...this.parseDocCommentSyntax(code)],
      context: this.parseCodeContext(code, parentContext)
    })
  }

  /**
   *
   * Parse the context from the given `str` of js.
   *
   * This method attempts to discover the context
   * for the comment based on it's code. Currently
   * supports:
   *
   *   - classes
   *   - class constructors
   *   - class methods
   *   - function statements
   *   - function expressions
   *   - prototype methods
   *   - prototype properties
   *   - methods
   *   - properties
   *   - declarations
   * @param {Token} token
   * @param {Object=} parentContext An indication if we are already in something. Like a namespace or an inline declaration.
   * @return {CodeContext?}
   * @api public
   */
  parseCodeContext = function (node, parentContext) {
    // loop through all context matchers, returning the first successful match
    for (const matcher of this.contextPatternMatchers) {
      const ctx = matcher(node, parentContext)
      if (ctx) {
        return new CodeContext({ ...ctx, parent: parentContext })
      }
    }
  };

  /**
   *
   * @param {ParameterDeclarationExpressionSyntaxNode} node
   * @returns
   */
  mapParameterToCodeContext = (node) => {

    const mode = node.mode.join(' ', 'T')

    const result = {
      id: node.name.toString('V'),
      name: node.name.toString('T'),
      mode: mode || 'in',
      type: node.type.toString('T'),
      defaultValue: node.defaultValue?.toString('T'),
      optional: !!node.defaultValue
    }

    let specification = [result.name]
    if (mode) {
      specification.push(mode)
    }
    specification.push(result.type)
    if (result.defaultValue) {
      specification.push(node.defaultExpr.toString('T'), result.defaultValue)
    }

    result.specification = specification.join(' ')

    return result

  }

  /**
   * @param {ReturnDeclarationExpressionSyntaxNode} node
   * @returns
   */
  mapReturnToCodeContext = (node) => {
    if (node) {
      return {
        type: node.type.toString('T'),
        modifiers: node.modifiers.map(mod => mod.toString('T').toLowerCase())
      }
    }
  }

  /**
   */
  contextPatternMatchers = [
    //Package or types
    /**
     * @param {SyntaxNode} str
     * @returns {CodeContext?}
     */
    (node) => {
      if (node instanceof CreatePlsqlUnitStatementSyntaxNode) {
        return {
          kind: node.unitType.toString().toLowerCase(),
          name: new PlsqlUnitName(node.name),
          type: node.unitType?.toString().toLowerCase(),
        }
      }
    },

    /**
     * Type member method
     * @param {ProcedureDeclarationStatementSyntaxNode} str
     * @param {CodeContext?} parentContext
     * @returns {CodeContext?}
     */
    (node, parentContext) => {
      if (node instanceof MethodDeclarationStatementSyntaxNode) {
        const kind = node.kind.replace(/DeclarationStatement$/, '').toLowerCase()
        return {
          kind,
          header: node.toString('T'),
          id: parentContext.ids.newUniqueId(node.name.toString('V')),
          name: new PlsqlItemName(node.name),
          type: kind,
          params: node.parameters?.parameters.map(this.mapParameterToCodeContext) ?? [],
          return: this.mapReturnToCodeContext(node.returnClause)
        }
      }
    },

    /**
     * Procedure/Function/Cursor
     * @param {ProcedureDeclarationStatementSyntaxNode} str
     * @param {CodeContext?} parentContext
     * @returns {CodeContext?}
     */
    (node, parentContext) => {
      switch (node.kind) {
        case 'ProcedureDeclarationStatement':
        case 'FunctionDeclarationStatement':
          const kind = node.kind.replace(/DeclarationStatement$/, '').toLowerCase()
          return {
            kind,
            header: node.toString('T'),
            id: parentContext.ids.newUniqueId(node.name.toString('V')),
            name: new PlsqlItemName(node.name),
            type: kind,
            params: node.parameters?.parameters.map(this.mapParameterToCodeContext) ?? [],
            return: this.mapReturnToCodeContext(node.returnClause)
          }
      }
    },

    /**
     * Constants/Variables
     * @param {SyntaxNode} node
     * @returns {CodeContext?}
     */
    (node) => {
      if (node instanceof ObjectAttributeDeclarationExpressionSyntaxNode) {
        return {
          kind: 'attribute',
          name: node.name.toString('T'),
          type: node.type.toString('T'),
          specification: node.type.toString('T')
        }
      }
    },

    /**
     * Constants/Variables
     * @param {SyntaxNode} node
     * @returns {CodeContext?}
     */
    (node) => {
      if (node.kind === 'VariableDeclarationStatement') {
        return {
          kind: node.isConstant ? 'constant' : 'variable',
          name: node.name.toString('T'),
          type: node.type.toString('T'),
          defaultValue: node.defaultValue?.toString('T')
        }
      }
    },

    /**
     * Exceptions
     * @param {ExceptionDeclarationStatementSyntaxNode} node
     * @param {CodeContext?} parentContext
     * @returns {CodeContext?}
     */
    (node) => {
      if (node instanceof ExceptionDeclarationStatementSyntaxNode) {
        return {
          kind: 'exception',
          name: node.name.toString('T')
        }
      }
    },

    /**
     * Subtypes, records, and collections.
     * @param {StatementSyntaxNode} node
     * @returns {CodeContext?}
     */
    (node) => {
      if (node instanceof TypeDeclarationStatementSyntaxNode) {
        return {
          kind: node.kind.replace(/DeclarationStatement$/, '').toLowerCase(),
          name: node.name.toString('T'),
          specification: node.specification?.toString('T')
        }
      }
    },

    // Default.
    (node, parentContext) => {
      // TODO start leaving these out one by one
      switch (node.kind) {
        case 'Identifier':
        case 'reserved':
        case 'keyword':
        case 'operator':
        case 'trivia':
        case 'EmptyStatement':
        case 'Statement': // opaque
          return
      }
      console.warn('using default handler for', { kind: node.kind, value: node.toString('V') })

      return {
        kind: node.kind,
        name: node.name?.toString('T'),
        type: (node.type ?? node.unitType)?.toString().toLowerCase(),
        specification: node.specification?.toString('T'),
        defaultValue: node.defaultValue?.toString('T')
      }
    }
  ];


}
exports.DocumentGenerator = DocumentGenerator

class IdGenerator {
  data = {}

  /**
   * @param {string} name
   */
  newUniqueId(name) {
    const state = this.data[name] ??= { count: 0 }
    return `${name}-${++state.count}`
  }
}

class ReadContext {
  ids = new IdGenerator()
}
