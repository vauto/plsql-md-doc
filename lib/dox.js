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
  ReturnDeclarationExpressionSyntaxNode,
  MethodDeclarationStatementSyntaxNodeBase,
  PragmaDeclarationStatementSyntaxNode,
  VariableDeclarationStatementSyntaxNode
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

    const comment = this.readComment(syntax, parentContext)
    if (!comment.context) {
      if (syntax instanceof PragmaDeclarationStatementSyntaxNode) {
        return
      }

      switch (syntax.kind) {
        case 'SqlPlusStatement':
        case 'SqlStatement':
        case 'Terminator': // hasta la vista, baby
        case 'trivia':
          // confirmed ok not to yield
          return
        default:
          console.assert(false, 'not yielding', syntax, comment)
          return
      }
    }

    yield comment
    // Read descendant comments
    switch (syntax.kind) {
      case 'CreatePackageStatement':
      case 'CreateBaseObjectTypeStatement':
        {
          const unitContext = {
            node: syntax,
            ids: new IdGenerator()
          }
          yield comment
          for (const child of syntax.members) {
            yield* this.readComments(child, unitContext)
          }
          break
        }
      case 'CreateNestedTableTypeStatement':
      case 'EmptyStatement':
      case 'Statement':
      case 'Identifier':
      case 'PragmaStatement':
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
   * @param {CodeContext} parentContext An indication if we are already in something. Like a namespace or an inline declaration.
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
   * @returns {CodeContext}
   */
  mapParameterToCodeContext = (node) => {

    const result = {
      id: node.name.toString('V'),
      name: node.name.toString('T'),
      mode: node.mode?.toString('T'),
      type: node.type.toString('T'),
      defaultExpression: node.defaultExpression?.toString('T'),
      defaultValue: node.defaultValue?.toString('T'),
      optional: !!node.defaultValue,
      annotations: node.annotations
    }

    result.specification = [
      result.name,
      result.mode, result.type,
      result.defaultExpression, result.defaultValue
    ].filter(x => x).join(' ')

    return result

  }

  /**
   * @param {ReturnDeclarationExpressionSyntaxNode?} node
   * @returns {CodeContext?}
   */
  mapReturnToCodeContext = (node) => {
    if (node) {
      return {
        type: node.type.toString('T'),
        modifiers: node.modifiers.map(mod => mod.toString('T').toLowerCase()),
        annotations: node.annotations
      }
    }
  }

  mapAnnotationToCodeContext = (annotation) => {
    return Object.fromEntries(Object.entries(annotation).map(([key, value]) => [key, value instanceof SyntaxNode ? value.value : value]))
  }

  /**
   * @type {[(node: SyntaxNode, parentContext?: CodeContext) => CodeContext?]}
   */
  contextPatternMatchers = [
    /**
     * PL/SQL units (TYPE, PACKAGE)
     * @param {SyntaxNode} node
     * @returns {CodeContext?}
     */
    (node) => {
      if (node instanceof CreatePlsqlUnitStatementSyntaxNode) {
        return {
          kind: node.unitType.toString().toLowerCase(),
          name: new PlsqlUnitName(node.name),
          annotations: node.annotations
        }
      }
    },

    /**
     * Method (procedure, function, object type method, cursor)
     * @param {SyntaxNode} node
     * @param {CodeContext?} parentContext
     * @returns {CodeContext?}
     */
    (node, parentContext) => {
      if (node instanceof MethodDeclarationStatementSyntaxNodeBase) {
        return {
          kind: node.memberKind.toLowerCase(),
          header: node.toString('T'),
          id: parentContext.ids.newUniqueId(node.name.toString('V')),
          name: new PlsqlItemName(node.name),
          params: node.parameters?.parameters.map(this.mapParameterToCodeContext) ?? [],
          signature: `(${node.parameters?.parameters.map(p => p.type.toString('T')).join(', ')})`,
          return: this.mapReturnToCodeContext(node.returnClause),
          annotations: node.annotations
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
          specification: node.type.toString('T'),
          annotations: node.annotations

        }
      }
    },

    /**
     * Constants/Variables
     * @param {SyntaxNode} node
     * @returns {CodeContext?}
     */
    (node) => {
      if (node instanceof VariableDeclarationStatementSyntaxNode) {
        return {
          kind: node.isConstant ? 'constant' : 'variable',
          name: node.name.toString('T'),
          type: node.type.toString('T'),
          defaultValue: node.defaultValue?.toString('T'),
          annotations: node.annotations
        }
      }
    },

    /**
     * Exceptions
     * @param {SyntaxNode} node
     * @param {CodeContext?} parentContext
     * @returns {CodeContext?}
     */
    (node) => {
      if (node instanceof ExceptionDeclarationStatementSyntaxNode) {
        return {
          kind: 'exception',
          name: node.name.toString('T'),
          annotations: node.annotations
        }
      }
    },

    /**
     * Subtypes, records, and collections.
     * @param {SyntaxNode} node
     * @returns {CodeContext?}
     */
    (node) => {
      if (node instanceof TypeDeclarationStatementSyntaxNode) {
        return {
          kind: node.kind.replace(/DeclarationStatement$/, '').toLowerCase(),
          name: node.name.toString('T'),
          specification: node.specification?.toString('T'),
          annotations: node.annotations.map(this.mapAnnotationToCodeContext)
        }
      }
    },

    // /**
    //  * @param {SyntaxNode} node
    //  * @param {CodeContext?} parentContext
    //  * @returns {CodeContext?}
    //  */
    // (node, parentContext) => {
    //   if (node instanceof PragmaDeclarationStatementSyntaxNode) {
    //     console.assert(false, 'not here.')
    //     return {
    //       kind: 'pragma',
    //       name: node.name.toString('T'),
    //       parameters: node.parameters.map(p => p.toString('T')),
    //       searchHint: node.searchHint
    //     }
    //   }
    // }

    // NOTE: no default handler.
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
