// @ts-check
/*!
 * Module dependencies.
 */
const { EOL } = require('os')
const console = require('./debug').child(__filename)
const { SyntaxNode, Annotation, IdentifierSyntaxNode, StatementSyntaxNode } = require('./syntax')
const { CodeContext, Comment } = require('./comment')
const { mustBeInstanceOf, ArgumentValueError } = require('./guards');

const { JavadocTokenizer } = require('./javadoc/lexer');
const { JavadocNodeReader } = require('./javadoc/syntax');
const { PlsqlTokenizer } = require('./plsql/lexer')
const { PlsqlUnitName } = require('./plsql/name');
const {
  CreateObjectTypeStatementSyntaxNode,
  CreatePackageStatementSyntaxNode,
  CreatePlsqlUnitStatementSyntaxNode,
  DeclarationParameterExpressionSyntaxNode,
  DeclarationStatementSyntaxNode,
  ExceptionDeclarationStatementSyntaxNode,
  MethodDeclarationStatementSyntaxNodeBase,
  ObjectAttributeDeclarationExpressionSyntaxNode,
  PlsqlNodeReader,
  PragmaDeclarationStatementSyntaxNode,
  RecordTypeDeclarationStatementSyntaxNode,
  ReturnDeclarationExpressionSyntaxNode,
  SubtypeDeclarationStatementSyntaxNode,
  TypeDeclarationStatementSyntaxNode,
  VariableDeclarationStatementSyntaxNode
} = require('./plsql/syntax');
const { Identifier } = require('./name');
const { Token, stringifyTokenArray } = require('./token');

/**
 * @typedef {import('./token').TokenFormat} TokenFormat
 * @typedef {import('./comment').NamedSyntaxNode} NamedSyntaxNode
 */

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
   * @param {object} params
   * @param {string?} params.filename
   * @returns {Generator<SyntaxNode>}
   */
  *parseSyntax(text, { filename = null }) {
    // @ts-expect-error I can't figure out why it insists on wanting line/col.
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
   * @api public
   */
  *readComments(syntax, parentContext) {
    mustBeInstanceOf(syntax, SyntaxNode)
    mustBeInstanceOf(parentContext, ReadContext, 'parentContext')

    if (!('name' in syntax && syntax.name)) {
      switch (syntax.kind) {
        case 'SqlPlusStatement':
        case 'SqlStatement':
        case 'Terminator': // hasta la vista, baby
        case 'trivia':
          // confirmed ok not to yield
          return
        default:
          console.assertOnce(syntax.kind, false, 'not yielding', syntax)
          return
      }
    }

    mustBeInstanceOf(syntax.name, IdentifierSyntaxNode, 'syntax.name')

    // @ts-expect-error
    const comment = this.readComment(syntax, parentContext)
    if (!comment.context) {
      if (syntax instanceof PragmaDeclarationStatementSyntaxNode) {
        return
      }
    }

    yield comment

    // Read descendant comments
    switch (true) {
      case syntax instanceof CreatePackageStatementSyntaxNode:
      case syntax instanceof CreateObjectTypeStatementSyntaxNode:
        {
          console.assert(syntax instanceof CreatePlsqlUnitStatementSyntaxNode)
          const unitContext = new ReadContext({ node: syntax, parentContext, comment })
          for (const child of syntax.members) {
            yield* this.readComments(child, unitContext)
          }
          break
        }
      case syntax instanceof RecordTypeDeclarationStatementSyntaxNode:
        {
          // really we should be doing this for procedures/functions too.
          const recordContext = new ReadContext({ node: syntax, parentContext, comment })
          for (const field of syntax.fields) {
            // @ts-expect-error
            yield this.readComment(field, recordContext)
          }
        }
        break
      case syntax instanceof CreatePlsqlUnitStatementSyntaxNode:
        // These are the ones we really care about.
        console.warn(`${syntax.textSpan} unhandled descendant analysis`, syntax.kind, syntax.toString())
        break
      case syntax instanceof DeclarationStatementSyntaxNode:
        // don't care about these
        break
      default:
        // Anything else here?
        console.warn(`${syntax.textSpan} unhandled descendant analysis`, syntax.kind, syntax.toString())
        break
    }

  }

  /**
   * Parse comments in the given string of `js`.
   *
   * @generator
   * @param {String} text
   * @param {object} options
   * @param {string?} options.filename The file path (optional)
   * @returns {Generator<Comment>}
   * @yields {Comment}
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
   * @returns {Generator<SyntaxNode>}
   * @yields {SyntaxNode}
   */
  *parseDocCommentSyntax(syntax) {
    for (const langToken of syntax.getDocumentComments()) {
      for (const docSyntax of new JavadocNodeReader(this.javadocLexer.parse(langToken.text, langToken.start))) {
        yield docSyntax
      }
    }
  }

  /**
   * Parse the given comment `str`.
   *
   * @param {NamedSyntaxNode} code The associated code
   * @param {ReadContext} parentContext The parent context
   * @return {Comment}
   * @api public
   */

  readComment(code, parentContext) {
    // Extract doc comments
    return new Comment(code,
      this.parseCodeContext(code, parentContext),
      [...this.parseDocCommentSyntax(code)]
    )
  }

  /**
   * Parse the context from the given `str` of js.
   *
   * This method attempts to discover the context
   * for the comment based on its code.
   *
   * @param {SyntaxNode} node
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

    console.log('no matches', node.constructor.name, node)
  };

  /**
   * @param {IdentifierSyntaxNode} name
   * @returns {Identifier} the name
   */
  #mapIdentifier(name) {
    mustBeInstanceOf(name, IdentifierSyntaxNode)
    if (name.parts.length === 1) {
      return new Identifier(name.parts[0])
    }
    throw new ArgumentValueError('name', name, `Compound identifier ${name} cannot be converted to an Identifier.`)
  }

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
      name: this.#mapIdentifier(node.name),
      mode: node.mode?.toString('T'),
      type: node.type.toString('T'),
      defaultExpression: node.defaultToken?.toString('T'),
      defaultValue: node.defaultValue?.toString('T'),
      optional: !!node.defaultValue,
      annotations: node.annotations.map(this.mapAnnotationToCodeContext)
    }

    result.specification = [
      result.mode, result.type,
      result.defaultExpression, result.defaultValue
    ].filter(x => x).join(' ')

    // @ts-expect-error
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
      name: this.#mapIdentifier(node.name),
      mode: node.mode?.toString('T'),
      type: node.type.toString('T'),
      defaultExpression: node.defaultToken?.toString('T'),
      defaultValue: node.defaultValue?.toString('T'),
      optional: !!node.defaultValue,
      annotations: node.annotations.map(this.mapAnnotationToCodeContext)
    }

    result.specification = [
      result.mode, result.type,
      result.defaultExpression, result.defaultValue
    ].filter(x => x).join(' ')

    // @ts-expect-error
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
        // @ts-expect-error
        annotations: node.annotations.map(this.mapAnnotationToCodeContext)
      }
    }
  }

  /**
   *
   * @param {Annotation} annotation
   * @returns {CodeContext}
   */
  mapAnnotationToCodeContext = (annotation) => {
    const result = {
      name: annotation.name,
      // @ts-expect-error
      target: annotation.target.name,
      ...Object.fromEntries(Object.entries(annotation).map(([key, value]) => [key, value instanceof SyntaxNode ? value.toString('V') : value]))
    }

    // @ts-expect-error
    return result
  }

  indentSize = 4
  formatIndent = '    '

  // ---------

  // LATER: formatters should be a separate class

  /**
   *
   * @param {DeclarationStatementSyntaxNode} node
   * @param {TokenFormat} format
   * @returns {string}
   */
  #formatCode(node, format = 'T') {
    switch (true) {
      case node instanceof RecordTypeDeclarationStatementSyntaxNode:
        return this.#formatRecordTypeDeclaration(node, format)
      case node instanceof MethodDeclarationStatementSyntaxNodeBase:
        return this.#formatMethodDeclaration(node, format)

    }
  }

  /**
   * @param {RecordTypeDeclarationStatementSyntaxNode} node
   * @param {TokenFormat} format
   * @returns {string}
   */
  #formatRecordTypeDeclaration(node, format = 'T') {
    const tokens = node.tokens
    const throughOpenParen = tokens.slice(0, tokens.indexOf(node.openParenToken))
    const closeToEnd = tokens.slice(tokens.indexOf(node.closeParenToken))

    const namePadding = this.indentSize * Math.ceil((1 + node.fields.reduce((max, field) => Math.max(max, field.name.length), 0)) / this.indentSize)

    return [
      `${stringifyTokenArray(throughOpenParen, format)} ${node.openParenToken}`,
      node.fields
        .map(f => f.toString(format).replace(/ /, ' '.padStart(namePadding - f.name.length)))
        .map(f => `${this.formatIndent}${f}`)
        .join(`,${EOL}`),
      stringifyTokenArray(closeToEnd, format)
    ].join(EOL)
  }

  /**
   * @param {MethodDeclarationStatementSyntaxNodeBase} node
   * @param {TokenFormat} format
   * @returns {string}
   */
  #formatMethodDeclaration(node, format = 'T') {
    if (node.openParenToken) {
      const tokens = node.tokens
      const throughOpenParen = tokens.slice(0, tokens.indexOf(node.openParenToken))
      const closeToEnd = tokens.slice(tokens.indexOf(node.closeParenToken))

      const namePadding = this.indentSize * Math.ceil((1 + node.parameters.reduce((max, param) => Math.max(max, param.name.length), 0)) / this.indentSize)

      return [
        `${stringifyTokenArray(throughOpenParen, format)}${node.openParenToken}`,
        node.parameters
          .map(p => p.toString(format).replace(/ /, ' '.padStart(namePadding - p.name.length)))
          .map(p => `${this.formatIndent}${p}`)
          .join(`,${EOL}`),
        stringifyTokenArray(closeToEnd, format)
      ].join(EOL)
    }

    // No parens: just return the default for now
    return node.toString(format)
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
    // @ts-expect-error
    (node, parentContext) => {
      if (node instanceof CreatePlsqlUnitStatementSyntaxNode) {
        return {
          parent: parentContext.codeContext,
          kind: node.unitType.toString('V').toLowerCase(),
          name: PlsqlUnitName.from(node.name),
          header: node.header.toString('T'),
          // @ts-expect-error
          annotations: node.annotations.map(this.mapAnnotationToCodeContext)
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
          header: this.#formatMethodDeclaration(node, 'T'),
          id: parentContext.ids.newUniqueId(node.name.toString('V')),
          name: this.#mapIdentifier(node.name),
          signature: `(${node.parameters.map(p => p.type.toString('T')).join(', ')})`,
          annotations: node.annotations.map(this.mapAnnotationToCodeContext)
        }

        // @ts-expect-error
        result.params = node.parameters.map(paramNode => this.mapParameterToCodeContext(paramNode, result)) ?? []
        // @ts-expect-error
        result.return = this.mapReturnToCodeContext(node.returnClause, result)
        result.unitModifiers = node.unitModifiers.map(mod => mod.toString('T').toLowerCase())

        // @ts-expect-error
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
          name: this.#mapIdentifier(node.name),
          type: node.type.toString('T'),
          specification: node.type.toString('T'),
          // @ts-expect-error
          annotations: node.annotations.map(this.mapAnnotationToCodeContext)
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
          name: this.#mapIdentifier(node.name),
          type: node.type.toString('T'),
          defaultValue: node.defaultValue?.toString('T'),
          // @ts-expect-error
          annotations: node.annotations.map(this.mapAnnotationToCodeContext)
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
          name: this.#mapIdentifier(node.name),
          // @ts-expect-error
          annotations: node.annotations.map(this.mapAnnotationToCodeContext)
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
          name: this.#mapIdentifier(node.name),
          header: node.toString('T'),
          baseType: node.baseType.toString('T'),
          // @ts-expect-error
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
          name: this.#mapIdentifier(node.name),
          header: this.#formatRecordTypeDeclaration(node, 'T'),
          signature: `(${node.fields.map(p => p.type.toString('T')).join(', ')})`,
          // @ts-expect-error
          annotations: node.annotations.map(this.mapAnnotationToCodeContext)
        })

        // @ts-expect-error
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
          name: this.#mapIdentifier(node.name),
          header: node.toString('T'),
          baseType: node.baseType.toString('T'),
          // @ts-expect-error
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
            // @ts-expect-error
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
