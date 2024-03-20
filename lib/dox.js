/*!
 * Module dependencies.
 */
const console = require('./debug').child(__filename)
const { SyntaxNode } = require('./syntax')
const { CodeContext, Comment } = require('./comment')

const { JavadocTokenizer } = require('./javadoc/lexer');
const { PlsqlTokenizer } = require('./plsql/lexer')
const { PlsqlUnitName, PlsqlIdentifier } = require('./plsql/name');
const {
  PlsqlNodeReader,
  CreatePlsqlUnitStatementSyntaxNode,
  DeclarationParameterExpressionSyntaxNode,
  ExceptionDeclarationStatementSyntaxNode,
  MethodDeclarationStatementSyntaxNodeBase,
  ObjectAttributeDeclarationExpressionSyntaxNode,
  PragmaDeclarationStatementSyntaxNode,
  RecordTypeDeclarationStatementSyntaxNode,
  ReturnDeclarationExpressionSyntaxNode,
  SubtypeDeclarationStatementSyntaxNode,
  TypeDeclarationStatementSyntaxNode,
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
          console.assertOnce(syntax.kind, false, 'not yielding', syntax, comment)
          return
      }
    }

    yield comment
    // Read descendant comments
    switch (syntax.kind) {
      case 'CreatePackageStatement':
      case 'CreateBaseObjectTypeStatement':
      case 'CreateInheritedObjectTypeStatement':
        {
          const unitContext = new ReadContext({ node: syntax, parentContext, comment })
          for (const child of syntax.members) {
            yield* this.readComments(child, unitContext)
          }
          break
        }
      case 'RecordTypeDeclarationStatement':
        {
          // really we should be doing this for procedures/functions too.
          const recordContext = new ReadContext({ node: syntax, parentContext, comment })
          for (const field of syntax.fields) {
            yield this.readComment(field, recordContext)
          }
        }
        break
      case 'CreateNestedTableTypeStatement':
      // case 'TypeDeclarationStatement':
      // case 'CreateNestedTableTypeStatement':
      // case 'EmptyStatement':
      // case 'Statement':
      // case 'Identifier':
      // case 'PragmaStatement':
      // case 'reserved':
      // case 'keyword':
      // case 'operator':
      // case 'trivia':
      // don't care about these
      case 'ConstructorDeclarationStatement':
      case 'ExceptionDeclarationStatement':
      case 'FunctionDeclarationStatement':
      case 'ObjectAttributeDeclarationExpression':
      case 'ObjectMethodDeclarationStatement':
      case 'ProcedureDeclarationStatement':
      case 'SubtypeDeclarationStatement':
      case 'TypeDeclarationStatement':
      case 'VariableDeclarationStatement':
        break
      default:
        // if (syntax.kind.endsWith("DeclarationStatement")) { break }
        // if (syntax.kind.endsWith("DeclarationExpression")) { break }
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
      for (const docSyntax of new JavadocNodeReader(this.javadocLexer.parse(token.text, token.start))) {
        yield docSyntax
      }
    }
  }


  /**
   * Parse the given comment `str`.
   *
   * @param {SyntaxNode} code The associated code
   * @param {ReadContext} parentContext The parent context
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
   * @param {ReadContext} parentContext An indication if we are already in something. Like a namespace or an inline declaration.
   * @return {CodeContext?}
   * @api public
   */
  parseCodeContext = function (node, parentContext) {
    // loop through all context matchers, returning the first successful match
    for (const matcher of this.contextPatternMatchers) {
      const ctx = matcher(node, parentContext)
      if (ctx) {
        console.assert(ctx.parent || !parentContext.codeContext, 'whoops')
        return ctx instanceof CodeContext ? ctx : new CodeContext(ctx)
      }
    }
  };

  /**
   *
   * @param {DeclarationParameterExpressionSyntaxNode} node
   * @param {CodeContext} parent
   * @returns {CodeContext}
   */
  mapParameterToCodeContext = (node, parent) => {

    const result = {
      parent,
      kind: 'parameter',
      id: node.name.toString('V'),
      name: PlsqlIdentifier.from(node.name),
      mode: node.mode?.toString('T'),
      type: node.type.toString('T'),
      defaultExpression: node.defaultExpression?.toString('T'),
      defaultValue: node.defaultValue?.toString('T'),
      optional: !!node.defaultValue,
      annotations: node.annotations.map(this.mapAnnotationToCodeContext)
    }

    result.specification = [
      result.mode, result.type,
      result.defaultExpression, result.defaultValue
    ].filter(x => x).join(' ')

    return result
  }

  /**
   *
   * @param {DeclarationParameterExpressionSyntaxNode} node
   * @param {CodeContext} parent
   * @returns {CodeContext}
   */
  mapFieldToCodeContext = (node, parent) => {
    console.assert(parent instanceof CodeContext)
    const result = {
      parent,
      kind: 'field',
      id: node.name.toString('V'),
      name: PlsqlIdentifier.from(node.name),
      mode: node.mode?.toString('T'),
      type: node.type.toString('T'),
      defaultExpression: node.defaultExpression?.toString('T'),
      defaultValue: node.defaultValue?.toString('T'),
      optional: !!node.defaultValue,
      annotations: node.annotations.map(this.mapAnnotationToCodeContext)
    }

    result.specification = [
      result.mode, result.type,
      result.defaultExpression, result.defaultValue
    ].filter(x => x).join(' ')

    return result
  }

  /**
   * @param {ReturnDeclarationExpressionSyntaxNode?} node
   * @param {CodeContext} parent
   * @returns {CodeContext?}
   */
  mapReturnToCodeContext = (node, parent) => {
    if (node) {
      return {
        parent,
        kind: 'return',
        type: node.type.toString('T'),
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
     * @param {ReadContext} parentContext
     * @returns {CodeContext?}
     */
    (node, parentContext) => {
      if (node instanceof CreatePlsqlUnitStatementSyntaxNode) {
        return {
          parent: parentContext.codeContext,
          kind: node.unitType.toString().toLowerCase(),
          name: PlsqlUnitName.from(node.name),
          annotations: node.annotations
        }
      }
    },

    /**
     * Method (procedure, function, object type method, cursor)
     * @param {SyntaxNode} node
     * @param {ReadContext} parentContext
     * @returns {CodeContext?}
     */
    (node, parentContext) => {
      if (node instanceof MethodDeclarationStatementSyntaxNodeBase) {
        const result = {
          parent: parentContext.codeContext,
          kind: node.memberKind.toLowerCase(),
          header: node.toString('T'),
          id: parentContext.ids.newUniqueId(node.name.toString('V')),
          name: PlsqlIdentifier.from(node.name),
          signature: `(${node.parameters?.parameters.map(p => p.type.toString('T')).join(', ')})`,
          annotations: node.annotations
        }

        result.params = node.parameters?.parameters.map(paramNode => this.mapParameterToCodeContext(paramNode, result)) ?? []
        result.return = this.mapReturnToCodeContext(node.returnClause, result)
        result.unitModifiers = node.unitModifiers.map(mod => mod.toString('T').toLowerCase())

        return result
      }
    },

    /**
     * Constants/Variables
     * @param {SyntaxNode} node
     * @param {ReadContext} parentContext
     * @returns {CodeContext?}
     */
    (node, parentContext) => {
      if (node instanceof ObjectAttributeDeclarationExpressionSyntaxNode) {
        return {
          parent: parentContext.codeContext,
          kind: 'attribute',
          name: PlsqlIdentifier.from(node.name),
          type: node.type.toString('T'),
          specification: node.type.toString('T'),
          annotations: node.annotations
        }
      }
    },

    /**
     * Constants/Variables
     * @param {SyntaxNode} node
     * @param {ReadContext} parentContext
     * @returns {CodeContext?}
     */
    (node, parentContext) => {
      if (node instanceof VariableDeclarationStatementSyntaxNode) {
        return {
          parent: parentContext.codeContext,
          kind: node.isConstant ? 'constant' : 'variable',
          name: PlsqlIdentifier.from(node.name),
          type: node.type.toString('T'),
          defaultValue: node.defaultValue?.toString('T'),
          annotations: node.annotations
        }
      }
    },

    /**
     * Exceptions
     * @param {SyntaxNode} node
     * @param {ReadContext} parentContext
     * @returns {CodeContext?}
     */
    (node, parentContext) => {
      if (node instanceof ExceptionDeclarationStatementSyntaxNode) {
        return {
          parent: parentContext.codeContext,
          kind: 'exception',
          name: PlsqlIdentifier.from(node.name),
          annotations: node.annotations
        }
      }
    },

    /**
     * Subtypes
     * @param {SyntaxNode} node
     * @param {ReadContext} parentContext
     * @returns {CodeContext?}
     */
    (node, parentContext) => {
      if (node instanceof SubtypeDeclarationStatementSyntaxNode) {
        return {
          parent: parentContext.codeContext,
          kind: 'subtype',
          name: PlsqlIdentifier.from(node.name),
          specification: node.specification?.toString('T'),
          annotations: node.annotations.map(this.mapAnnotationToCodeContext)
        }
      }
    },

    /**
     * `TYPE ... IS RECORD ...` declarations
     * @param {SyntaxNode} node
     * @param {ReadContext} parentContext
     * @returns {CodeContext?}
     */
    (node, parentContext) => {
      if (node instanceof RecordTypeDeclarationStatementSyntaxNode) {
        const result = new CodeContext({
          parent: parentContext.codeContext,
          kind: 'record',
          name: PlsqlIdentifier.from(node.name),
          specification: node.toString('T'),
          signature: `(${node.fields.map(p => p.type.toString('T')).join(', ')})`,
          annotations: node.annotations.map(this.mapAnnotationToCodeContext)
        })

        result.fields = node.fields.map(fieldNode => this.mapFieldToCodeContext(fieldNode, result))
        return result
      }
    },

    /**
     * `TYPE` declarations (other)
     * @param {SyntaxNode} node
     * @param {ReadContext} parentContext
     * @returns {CodeContext?}
     */
    (node, parentContext) => {
      if (node instanceof TypeDeclarationStatementSyntaxNode) {
        return {
          parent: parentContext.codeContext,
          kind: 'type',
          name: PlsqlIdentifier.from(node.name),
          specification: node.specification?.toString('T'),
          annotations: node.annotations.map(this.mapAnnotationToCodeContext)
        }
      }
    },

    /**
     * Parameter/field declarations
     * @param {SyntaxNode} node
     * @param {ReadContext} parentContext
     * @returns {CodeContext?}
     */
    (node, parentContext) => {
      if (node instanceof DeclarationParameterExpressionSyntaxNode) {
        const parent = parentContext.codeContext
        const id = node.name.toString('V')

        switch (parent.kind) {
          case 'record':
            return parent.fields.find(f => f.id === id)
          default:
            // LATER: we should look for comments/annotations on top of method parameters
            break
        }
      }
    },

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
  /** @type {ReadContext?} The parent read context */ parent
  ids = new IdGenerator()

  /** @type {SyntaxNode?} */ node
  /** @type {Comment?} */ comment

  /** @type {CodeContext?} */
  get codeContext() {
    return this.comment?.context
  }

  constructor(params = {}) {
    Object.assign(this, params)
  }
}
