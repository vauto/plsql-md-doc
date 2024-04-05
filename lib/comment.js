// @ts-check
const { EOL } = require('os')
const console = require("./debug").child(__filename)
const { mustBeInstanceOf, mustBeArray } = require('./guards')
const {
  BraceContentExpressionSyntaxNode,
  BraceExpressionSyntaxNode,
  BraceNamePathExpressionSyntaxNode,
  BracketExpressionSyntaxNode,
  ContentTagSyntaxNode,
  InlineTagSyntaxNode,
  LinkTagSyntaxNode,
  NamePathExpressionSyntaxNode,
  ParamTagSyntaxNode,
  TagSyntaxNode,
  UrlLiteralSyntaxNode,
  VisibilityTagSyntaxNode,
  ThrowsExceptionTagSyntaxNode,
  ReturnTagSyntaxNode
} = require("./javadoc/syntax")
const { Identifier } = require('./name')
const { TextSpan } = require("./position")
const {
  Annotation,
  ContentSyntaxNode,
  IdentifierSyntaxNode,
  LiteralSyntaxNode,
  SyntaxNode
} = require("./syntax")
const { PlsqlMemberName, PlsqlUniqueId } = require('./plsql/name')

/**
 * @typedef {import('./name').ItemName} ItemName
 * @typedef {import('./syntax').NamedSyntaxNode} NamedSyntaxNode
 * @typedef {import('./javadoc/syntax').NamePathOrUrlLiteralSyntaxNode} NamePathOrUrlLiteralSyntaxNode
 *
 * @typedef {SyntaxNode|SyntaxNode[]} SyntaxNodeOrNodes
 * @typedef {string|URL|LinkTag} Content
 */

/**
 * @typedef {object} CodeContextLike
 * @property {string?} kind
 * @property {string?} id
 * @property {Identifier?}  name
 * @property {CodeContext?}  parent
 * @property {string?} header
 * @property {string?} [type=undefined]
 */

/**
 * @extends {CodeContextLike}
 */
class CodeContext {
  /** @type {string} */ kind
  /** @type {CodeContext?} */ parent
  /** @type {CodeContext[]} */ annotations = []

  // Undifferentiated properties.  LATER: subclasses?
  /** @type {string?} */ id
  /** @type {Identifier?} */ name
  /** @type {string?} */ header
  /** @type {string?} */ type
  /** @type {string?} */ typeKind
  /** @type {string?} */ signature
  /** @type {string?} */ mode
  /** @type {string?} */ specification
  /** @type {string[]?} */ unitModifiers
  /** @type {string?} */ defaultExpression
  /** @type {string?} */ defaultValue
  /** @type {string?} */ message
  /** @type {CodeContext[]?} Method parameters */ params
  /** @type {CodeContext?} Function return value */ return
  /** @type {CodeContext[]?} Record fields */ fields

  /**
   * @param {object} params
   * @param {string?} params.kind
   * @param {CodeContext?}  params.parent
   * @param {string?} [params.id]
   * @param {Identifier?} [params.name]
   * @param {string?} [params.header]
   * @param {string?} [params.mode]
   * @param {string?} [params.type]
   * @param {string?} [params.typeKind]
   * @param {string?} [params.signature]
   * @param {string?} [params.baseType]
   * @param {string?} [params.defaultExpression]
   * @param {string?} [params.defaultValue]
   * @param {string?} [params.message]
   * @param {boolean?} [params.optional]
   * @param {string?} [params.specification]
   * @param {string[]?} [params.unitModifiers]
   * @param {CodeContext[]?}  [params.params]
   * @param {CodeContext?}  [params.return]
   * @param {CodeContext[]?}  [params.fields]
   */
  constructor(params) {
    Object.assign(this, params)
    if (this.name && !this.id) {
      this.id = this.name.value
    }
  }

  /**
   * Resolve a node that is almost certainly a link of some kind.
   * @param {NamePathOrUrlLiteralSyntaxNode?} node
   * @returns {URL | ItemName | string?}
   */
  resolveLink(node) {
    if (!node) {
      return null
    }

    if (node instanceof UrlLiteralSyntaxNode) {
      return new URL(node.value)
    }


    mustBeInstanceOf(node, NamePathExpressionSyntaxNode, 'node')

    return PlsqlUniqueId.from(node)
  }

  /**
   * @param {InlineTagSyntaxNode} node
   * @returns {Content}
   */
  resolveInlineTag(node) {
    switch (true) {
      case node.tag instanceof LinkTagSyntaxNode:
        return new LinkTag(node.tag, this)
      default:
        return node.toStructuredString('T')
    }
  }

  /**
   * Resolves an array of content.
   * @param  {...SyntaxNode} content
   * @returns {Generator<Content>}
   * @yields {Content}
   */
  *#doResolveContent(...content) {
    for (const item of content) {
      console.assert(!!item, 'oopsie')
      switch (true) {
        case item instanceof UrlLiteralSyntaxNode:
          yield new URL(item.value)
          break
        case item instanceof InlineTagSyntaxNode:
          yield this.resolveInlineTag(item)
          break
        case item instanceof BraceNamePathExpressionSyntaxNode:
          // FIXME resolve url
          yield item.toStructuredString('T')
          break
        case item instanceof BraceContentExpressionSyntaxNode: // unintentional text in braces, render as-is
          yield item.toStructuredString('T')
          break
        case item instanceof BraceExpressionSyntaxNode:
          yield item.toStructuredString('T')
          break
        case item instanceof BracketExpressionSyntaxNode:
          yield item.toStructuredString('T')
          break
        case item instanceof ContentSyntaxNode:
          yield item.toStructuredString('T')
          break
        default:
          console.warnOnce(item.kind, `resolve non-content item`, item)
          yield item.toStructuredString('T')
          break
      }
    }
  }

  /**
   * @param {...SyntaxNode} content
   * @returns {Content[]}
   */
  resolveContent(...content) {
    switch (content.length) {
      case 0:
        return []
      case 1:
        switch (true) {
          case content[0] instanceof LiteralSyntaxNode && content[0].kind === 'string':
            // SPECIAL CASE: a single string literal.  Javadoc lets you strip quotes from text.
            return [content[0].value.trim()]
        }
    }

    // All else: just resolve content.
    return [...this.#doResolveContent(...content)]
  }
}
exports.CodeContext = CodeContext

class Description {

  /** Represents an empty description. */
  static empty = new Description('')

  /** The full text */
  full = ''

  /** The first line of the comment */
  summary = ''

  /** The rest of the comment */
  body = ''

  /**
   * @param {any} value
   * @returns {string}
   */
  static #stringify(value) {
    switch (value) {
      case undefined:
      case null:
      case '':
        return ''
      default:
        return typeof value === 'string' ? value.trim() : `${value}`
    }
  }

  /**
   * @param {string} value1
   * @param {string} value2
   * @returns {string}
   */
  static #joinStrings(value1, value2) {
    return value1 + EOL + value2
  }

  /**
   * @param {string} text
   */
  constructor(text) {
    this.full = Description.#stringify(text)

    const index = this.full.indexOf(EOL)
    if (index >= 0) {
      this.summary = this.full.slice(0, index).trimEnd()
      this.body = this.full.slice(index + EOL.length).trimStart()
    } else {
      this.summary = this.full
    }
  }

  /**
   * @param {string | Description?} input
   * @returns {Description?}
   */
  static from(input) {
    if (input instanceof Description) {
      return input
    } else if (input) {
      return new Description(input)
    } else {
      return undefined
    }
  }

  /**
   *
   * @param {string | Description?} value1
   * @param {string | Description?} value2
   * @returns
   */
  static concat(value1, value2) {
    value1 = Description.#stringify(value1)
    value2 = Description.#stringify(value2)

    return value1 ? new Description(value1).concat(value2) : Description.from(value2)
  }

  /**
   * @param {string|Description} value
   */
  concat(value) {
    if (!this.full) {
      return Description.from(value)
    }

    if (value instanceof Description) {
      return value.full ? new Description(Description.#joinStrings(this.full, value.full)) : this
    }

    // Stringify everything else
    value = Description.#stringify(value)
    return value ? new Description(Description.#joinStrings(this.full, value)) : this
  }

  toString() {
    return this.full
  }

  valueOf() {
    return this.full
  }
}
exports.Description = Description

class Tag {
  /** @type {string} */ kind
  /** @type {TextSpan?} */ textSpan
  /** @type {Annotation[]} */ annotations

  /** @type {Content[]?} Content.  It is meant to be easy to stringify. */ content

  /**
   * @param {TagSyntaxNode} syntax
   * @param {CodeContext?} context
   * @returns {Tag}
   */
  static from(syntax, context) {
    mustBeInstanceOf(syntax, TagSyntaxNode, 'syntax')
    mustBeInstanceOf(context, CodeContext, 'context')

    switch (true) {
      case syntax instanceof LinkTagSyntaxNode:
        return new LinkTag(syntax, context)
      case syntax instanceof ParamTagSyntaxNode:
        return new ParamTag(syntax, context)
      case syntax instanceof ThrowsExceptionTagSyntaxNode:
        return new ThrowsExceptionTag(syntax, context)
      case syntax instanceof VisibilityTagSyntaxNode:
        return new VisibilityTag(syntax, context)
      case syntax instanceof ContentTagSyntaxNode:
      case syntax instanceof ReturnTagSyntaxNode:
        return new Tag(syntax, context)
      default:
        // Unassigned tags.
        return new Tag(syntax, context)
    }
  }

  /**
   * @param {TagSyntaxNode} syntax
   * @param {CodeContext} context
   */
  constructor(syntax, context) {
    mustBeInstanceOf(syntax, TagSyntaxNode, 'syntax')
    mustBeInstanceOf(context, CodeContext, 'context')
    this.kind = syntax.kind
    this.textSpan = syntax.textSpan
    this.annotations = syntax.annotations
    this.content = context.resolveContent(...syntax.content)
    console.assert(this.content.length === syntax.content.length)
  }
}
exports.Tag = Tag

class ThrowsExceptionTag extends Tag {
  /** @type {ItemName} */ name

  /**
   * @param {ThrowsExceptionTagSyntaxNode} syntax
   * @param {CodeContext} context
   */
  constructor(syntax, context) {
    super(syntax, context)

    this.name = syntax.name
  }

  /** @type {string} The canonical identifier for this tag. */
  get id() {
    return this.name.value
  }
}
exports.ThrowsExceptionTag = ThrowsExceptionTag

class LinkTag extends Tag {
  /** @type {string|ItemName|URL} */ href

  /**
   * @param {LinkTagSyntaxNode} syntax
   * @param {CodeContext?} context
   */
  constructor(syntax, context) {
    mustBeInstanceOf(syntax, LinkTagSyntaxNode, 'syntax')
    super(syntax, context)

    // Resolve link
    this.href = context.resolveLink(syntax.href)

    if (!this.content.length && syntax.href) {
      this.content = context.resolveContent(syntax.href)
    }
  }
}
exports.LinkTag = LinkTag

class ParamTag extends Tag {
  /** @type {ItemName} */ name

  /**
   * @param {ParamTagSyntaxNode} syntax
   * @param {CodeContext} context
   */
  constructor(syntax, context) {
    super(syntax, context)
    this.name = syntax.name
  }

  /** @type {string} The canonical identifier for this tag. */
  get id() {
    return this.name.value
  }
}
exports.ParamTag = ParamTag

class VisibilityTag extends Tag {
  /** @type {string} */ value

  /**
   * @param {VisibilityTagSyntaxNode} syntax
   * @param {CodeContext} context
   */
  constructor(syntax, context) {
    mustBeInstanceOf(syntax, VisibilityTagSyntaxNode, 'syntax')
    super(syntax, context)
    this.value = syntax.visibility
  }
}
exports.VisibilityTag = VisibilityTag


class Comment {
  /** @type {SyntaxNode[]} The doc comment nodes */
  nodes
  /** @type {SyntaxNode} The original source node to which this comment applies */
  code

  /** @type {IdentifierSyntaxNode} */ name
  /** @type {CodeContext?} The code context (optional) */ context

  /** @type {TextSpan} */
  get textSpan() { return this.code.textSpan }

  /** @returns {Tag[]} The array of tag objects */
  tags

  /** @returns {TagSyntaxNode[]} The array of tag nodes. */
  get tagNodes() {
    return this.nodes.filter(/** @returns {n is TagSyntaxNode} */ n => n instanceof TagSyntaxNode)
  }

  /**
   * @param {NamedSyntaxNode} code
   * @param {CodeContext?} context The code context (optional)
   * @param {SyntaxNode[]} nodes The doc syntax nodes.
   */
  constructor(code, context, nodes) {
    mustBeInstanceOf(code, SyntaxNode, 'code')
    mustBeInstanceOf(code.name, IdentifierSyntaxNode, 'code.name')
    if (context) mustBeInstanceOf(context, CodeContext, 'context')
    mustBeArray(nodes, 'nodes')
    this.code = code
    this.nodes = nodes.flat()
    this.name = code.name
    this.context = context

    // XXX move this all elsewhere, Comment should be a bit less opinionated about how to use its tags.
    this.tags = this.tagNodes.map(syntax => Tag.from(syntax, context))
  }

  toString() {
    return this.nodes.join(' ')
  }
}

exports.Comment = Comment
