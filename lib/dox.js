// @ts-check
/*!
 * Module dependencies.
 */
const { EOL } = require('os')
const console = require('./debug').child(__filename)
const { SyntaxNode, AnnotationNode, IdentifierSyntaxNode, mustBeNamedSyntaxNode } = require('./syntax')
const { Annotation, CodeContext, Comment } = require('./comment')
const { mustBeInstanceOf, ArgumentValueError, mustBeInstanceOfAny } = require('./guards');

const { JavadocTokenizer } = require('./javadoc/lexer');
const { JavadocNodeReader } = require('./javadoc/syntax');
const { PlsqlTokenizer } = require('./plsql/lexer')
const { PlsqlUnitName, PlsqlUniqueId } = require('./plsql/name');
const {
  AssociativeArrayTypeExpressionSyntaxNode,
  CollectionTypeDeclarationStatementSyntaxNode,
  CreateNestedTableTypeStatementSyntaxNode,
  CreateObjectTypeStatementSyntaxNode,
  CreatePackageStatementSyntaxNode,
  CreatePlsqlUnitStatementSyntaxNode,
  DeclarationExpressionSyntaxNode,
  DeclarationParameterExpressionSyntaxNode,
  DeclarationStatementSyntaxNode,
  ExceptionDeclarationStatementSyntaxNode,
  MethodDeclarationStatementSyntaxNodeBase,
  NestedTableTypeExpressionSyntaxNode,
  ObjectAttributeDeclarationExpressionSyntaxNode,
  PlsqlNodeReader,
  PragmaDeclarationStatementSyntaxNode,
  RecordFieldDeclarationExpressionSyntaxNode,
  RecordTypeDeclarationStatementSyntaxNode,
  RecordTypeExpressionSyntaxNode,
  RefCursorTypeDeclarationStatementSyntaxNode,
  RefCursorTypeExpressionSyntaxNode,
  ReturnDeclarationExpressionSyntaxNode,
  SubtypeDeclarationStatementSyntaxNode,
  TypeDeclarationStatementSyntaxNode,
  TypeExpressionSyntaxNode,
  VariableDeclarationStatementSyntaxNode
} = require('./plsql/syntax');
const { Identifier } = require('./name');
const { stringifyTokenArray } = require('./token');

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

    mustBeNamedSyntaxNode(syntax, 'syntax')

    const comment = this.readComment(syntax, parentContext)
    if (!comment.context) {
      if (syntax instanceof PragmaDeclarationStatementSyntaxNode) {
        return
      }
    }

    yield comment

    // Read descendant comments
    switch (true) {
      // PL/SQL unit types with members
      case syntax instanceof CreatePackageStatementSyntaxNode:
      case syntax instanceof CreateObjectTypeStatementSyntaxNode:
        {
          console.assert(syntax instanceof CreatePlsqlUnitStatementSyntaxNode)
          const unitContext = new ReadContext({ node: syntax, parentContext, comment })
          for (const child of syntax.members) {
            yield* this.readComments(child, unitContext)
          }
        }
        break

      // PL/SQL unit types that don't have members
      case syntax instanceof CreateNestedTableTypeStatementSyntaxNode:
        break

      // Other, unhandled PL/SQL unit types: These are the ones we really care about.
      case syntax instanceof CreatePlsqlUnitStatementSyntaxNode:
        console.warn(`${syntax.textSpan} unhandled descendant analysis (PL/SQL unit)`, syntax.kind, syntax.toString())
        break

      // Member statements that themselves have members
      case syntax instanceof RecordTypeDeclarationStatementSyntaxNode:
        {
          // really we should be doing this for procedures/functions too.
          const recordContext = new ReadContext({ node: syntax, parentContext, comment })
          for (const field of syntax.fields) {
            yield this.readComment(field, recordContext)
          }
        }
        break

      // Member statements that do not have members
      case syntax instanceof ExceptionDeclarationStatementSyntaxNode:
      case syntax instanceof MethodDeclarationStatementSyntaxNodeBase:
      case syntax instanceof ObjectAttributeDeclarationExpressionSyntaxNode:
      case syntax instanceof SubtypeDeclarationStatementSyntaxNode:
      case syntax instanceof VariableDeclarationStatementSyntaxNode:
      case syntax instanceof CollectionTypeDeclarationStatementSyntaxNode:
      case syntax instanceof RefCursorTypeDeclarationStatementSyntaxNode:
        break
      default:
        // Everything else
        console.assertOnce(syntax.kind, false, `${syntax.textSpan} unhandled descendant analysis`, syntax.kind, syntax.toString())
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
      // for (const t of this.javadocLexer.parse(langToken.text, langToken.start)) {
      //   console.info(`[${t.start}] ${t.type} - ${JSON.stringify(t.value)}`)
      // }

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
      } else if (ctx === null) {
        // An explicit null means there is intentionally no CodeContext for this node type.
        return null
      }
    }

    console.warn('no matches', node.constructor.name, node)
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
    const result = new CodeContext({
      parent,
      kind: 'parameter',
      id: node.name.toString('V'),
      name: this.#mapIdentifier(node.name),
      mode: node.mode?.toString('T'),
      type: node.type.toString('T'),
      defaultExpression: node.defaultToken?.toString('T'),
      defaultValue: node.defaultValue?.toString('T'),
      optional: !!node.defaultValue,
    })
    result.annotations = this.mapAnnotationsToCodeContext(node.annotations, result)

    result.specification = [
      result.mode, result.type,
      result.defaultExpression, result.defaultValue
    ].filter(x => x).join(' ')

    return result
  }

  /**
   *
   * @param {RecordFieldDeclarationExpressionSyntaxNode} node
   * @param {CodeContext} parent
   * @returns {CodeContext}
   */
  mapFieldToCodeContext = (node, parent) => {
    console.assert(parent instanceof CodeContext)
    const result = new CodeContext({
      parent,
      kind: 'field',
      id: node.name.toString('V'),
      name: this.#mapIdentifier(node.name),
      type: node.type.toString('T'),
      defaultExpression: node.defaultToken?.toString('T'),
      defaultValue: node.defaultValue?.toString('T'),
      optional: !!node.defaultValue
    })
    result.annotations = this.mapAnnotationsToCodeContext(node.annotations, result)

    result.specification = [
      result.type,
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
      const result = new CodeContext({
        parent,
        kind: 'return',
        type: node.type.toString('T'),
      })
      result.annotations = this.mapAnnotationsToCodeContext(node.annotations, result)
      return result
    }
  }

  /**
   * @param {AnnotationNode} node
   * @param {CodeContext} parent
   * @returns {Annotation}
   */
  mapAnnotationToCodeContext = (node, parent) => {
    return new Annotation(node, parent)
  }

  /**
   * @param {AnnotationNode[]} annotations
   * @param {CodeContext} parent
   * @returns {Annotation[]}
   */
  mapAnnotationsToCodeContext = (annotations, parent) => {
    return annotations.map(a => this.mapAnnotationToCodeContext(a, parent))
  }

  indentSize = 4
  formatIndent = '    '


  /**
   * Gets the typeKind description.
   * Note that we call most things "XXX type" except "subtype".
   *
   * @param {TypeExpressionSyntaxNode} type
   * @returns {string}
   */
  #getTypeKindDescription = (type) => {
    switch (true) {
      case type instanceof RefCursorTypeExpressionSyntaxNode:
        return 'cursor type'
      case type instanceof NestedTableTypeExpressionSyntaxNode:
      case type instanceof AssociativeArrayTypeExpressionSyntaxNode:
        return 'table type'
      case type instanceof RecordTypeExpressionSyntaxNode:
        return 'record type'
      default:
        console.warnOnce(type.constructor.name, `Missing type kind description: ${type}`)
        return 'type'
    }
  }

  // ---------

  // LATER: formatters should be a separate class

  /**
   * Format type declarations (`TYPE <name> IS <base-type>`).
   *
   * @param {TypeDeclarationStatementSyntaxNode} node
   * @param {TokenFormat} format
   * @returns {string}
   */
  #formatTypeDeclarationStatement(node, format) {
    return `${node.typeKeyword.toString(format)} ${node.name.toString(format)} ${node.isKeyword.toString(format)} ${this.#formatTypeExpression(node.baseType, format)};`
  }

  /**
   * Format type declarations (`TYPE <name> IS <base-type>`).
   *
   * @param {TypeExpressionSyntaxNode} node
   * @param {TokenFormat} format
   * @returns {string}
   */
  #formatTypeExpression(node, format) {
    switch (true) {
      case node instanceof RecordTypeExpressionSyntaxNode:
        // RECORD: handle formatting specially.
        return this.#formatRecordTypeExpression(node, format)
      default:
        // All other types: use default
        return node.toString(format)
    }
  }

  /**
   * @param {RecordTypeExpressionSyntaxNode} node
   * @param {TokenFormat} format
   * @returns {string}
   */
  #formatRecordTypeExpression(node, format) {
    const tokens = node.tokens

    const closeToEnd = tokens.slice(tokens.indexOf(node.closeParenToken))

    const namePadding = this.indentSize * Math.ceil((1 + node.fields.reduce((max, field) => Math.max(max, field.name.length), 0)) / this.indentSize)

    return [
      `${node.recordKeyword.toString(format)} ${node.openParenToken.toString(format)}`,
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
        const result = new CodeContext({
          parent: parentContext.codeContext,
          kind: node.unitType.toString('V').toLowerCase(),
          name: PlsqlUnitName.from(node.name),
          header: node.header.toString('T'),
        })
        result.annotations = this.mapAnnotationsToCodeContext(node.annotations, result)
        return result
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
        const result = new CodeContext({
          parent: parentContext.codeContext,
          kind: node.memberKind.toLowerCase(),
          header: this.#formatMethodDeclaration(node, 'T'),
          // Unique ID in case of overloads
          id: PlsqlUniqueId.from(node).value,
          name: this.#mapIdentifier(node.name),
          // Display signature for overloads
          signature: `(${node.parameters.map(p => p.type.toString('T')).join(', ')})`
        })

        result.annotations = this.mapAnnotationsToCodeContext(node.annotations, result)
        result.params = node.parameters.map(paramNode => this.mapParameterToCodeContext(paramNode, result)) ?? []
        // @ts-expect-error
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
        const result = new CodeContext({
          parent: parentContext.codeContext,
          kind: 'attribute',
          name: this.#mapIdentifier(node.name),
          type: node.type.toString('T'),
          specification: node.type.toString('T'),
        })

        result.annotations = this.mapAnnotationsToCodeContext(node.annotations, result)
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
      if (node instanceof VariableDeclarationStatementSyntaxNode) {
        const result = new CodeContext({
          parent: parentContext.codeContext,
          kind: node.isConstant ? 'constant' : 'variable',
          name: this.#mapIdentifier(node.name),
          type: node.type.toString('T'),
          defaultValue: node.defaultValue?.toString('T'),
        })

        result.annotations = this.mapAnnotationsToCodeContext(node.annotations, result)
        return result
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
        const result = new CodeContext({
          parent: parentContext.codeContext,
          kind: 'exception',
          name: this.#mapIdentifier(node.name)
        })

        result.annotations = this.mapAnnotationsToCodeContext(node.annotations, result)
        return result
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
        const result = new CodeContext({
          parent: parentContext.codeContext,
          kind: 'type',
          typeKind: 'subtype',
          name: this.#mapIdentifier(node.name),
          header: node.toString('T'),
          baseType: node.baseType.toString('T')
        })

        result.annotations = this.mapAnnotationsToCodeContext(node.annotations, result)
        return result
      }
    },

    /**
     * `TYPE` declarations (Record)
     * @param {SyntaxNode} node
     * @param {ReadContext} parentContext
     * @returns {CodeContext?}
     */
    (node, parentContext) => {
      if (node instanceof RecordTypeDeclarationStatementSyntaxNode) {
        const result = new CodeContext({
          parent: parentContext.codeContext,
          kind: 'type',
          typeKind: this.#getTypeKindDescription(node.baseType),
          name: this.#mapIdentifier(node.name),
          header: this.#formatTypeDeclarationStatement(node, 'T'),
          signature: `(${node.fields.map(p => p.type.toString('T')).join(', ')})`,
        })

        result.annotations = this.mapAnnotationsToCodeContext(node.annotations, result)
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
        const result = new CodeContext({
          parent: parentContext.codeContext,
          kind: 'type',
          typeKind: this.#getTypeKindDescription(node.baseType),
          name: this.#mapIdentifier(node.name),
          header: this.#formatTypeDeclarationStatement(node, 'T'),
          baseType: node.baseType.toString('T'),
        })

        result.annotations = this.mapAnnotationsToCodeContext(node.annotations, result)
        return result
      }
    },

    /**
     * Parameter declarations
     * @param {SyntaxNode} node
     * @param {ReadContext} parentContext
     * @returns {CodeContext?}
     */
    (node, parentContext) => {
      if (node instanceof DeclarationParameterExpressionSyntaxNode) {
        const parent = parentContext.codeContext
        const id = node.name.toString('V')

        // LATER: we should look for comments/annotations on top of method parameters
        return parent.params.find(p => p.id === id)
      }
    },

    /**
     * Field declarations
     * @param {SyntaxNode} node
     * @param {ReadContext} parentContext
     * @returns {CodeContext?}
     */
    (node, parentContext) => {
      if (node instanceof RecordFieldDeclarationExpressionSyntaxNode) {
        const parent = parentContext.codeContext
        const id = node.name.toString('V')
        return parent.fields.find(f => f.id === id)
      }
    },

    /**
     * Pragma declarations: these are processed as annotations, so flag them as OK to skip by returning `null`.
     * @param {SyntaxNode} node
     * @returns {null|undefined}
     */
    (node) => {
      switch (true) {
        case node instanceof PragmaDeclarationStatementSyntaxNode:
          return null
      }
    }

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
