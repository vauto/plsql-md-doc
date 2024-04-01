// @ts-check
const { EOL } = require('os')
const console = require("./debug").child(__filename)
const { TagSyntaxNode, LinkTagSyntaxNode, ParamTagSyntaxNode, VisibilityTagSyntaxNode, ContentTagSyntaxNode, UrlSyntaxNode, NamePathExpressionSyntaxNode } = require("./javadoc/syntax")
const { TextSpan } = require("./position")
const { SyntaxNode, IdentifierSyntaxNode, Annotation } = require("./syntax")
const { Token } = require('./token')
const { mustBeInstanceOf, mustBeArray } = require('./guards')
const { PlsqlUnitName } = require('./plsql/name')
const { DeclarationStatementSyntaxNode } = require('./plsql/syntax')
/**
 * @typedef {import('./name').ItemName} ItemName
 * @typedef {SyntaxNode|SyntaxNode[]} SyntaxNodeOrNodes
 * @typedef {string|URL} Content
 * @typedef {import('./javadoc/syntax').NamePathOrUrlSyntaxNode} NamePathOrUrlSyntaxNode
 */

/** */
class CodeContext {
  /** @type {string} */ kind
  /** @type {string} */ type
  /** @type {string} */ name
  /** @type {CodeContext?} */ parent
  /** @type {string?} */ header
  /** @type {Annotation[]} */ annotations
  /**
   * @param {...CodeContext} params
   */
  constructor(params) {
    Object.assign(this, params)
    this.annotations ??= []
  }

  /**
   * Resolve a node that is almost certainly a link of some kind.
   * @param {NamePathOrUrlSyntaxNode?} node
   * @returns {Content?}
   */
  resolveLink(node) {
    if (!node) {
      return null
    }

    if (node instanceof UrlSyntaxNode) {
      return new URL(node.value)
    }

    mustBeInstanceOf(node, NamePathExpressionSyntaxNode, 'node')
    return node.toStructuredString('T')
  }

  /**
   * Resolve a node that is probably text.
   * @param {SyntaxNode?} node
   * @returns {Content?}
   */
  resolveItem(node) {
    if (node instanceof UrlSyntaxNode) {
      return new URL(node.value)
    }

    mustBeInstanceOf(node, SyntaxNode, 'node')
    return node.toStructuredString('T')
  }

  /**
   * Resolves an array of content.
   * @param  {...SyntaxNodeOrNodes?} content
   * @returns {Generator<Content?>}
   * @yields {Content?}
   */
  *resolveItems(...content) {
    for (const item of content) {
      if (!item) {
        yield undefined
      }

      if (item instanceof SyntaxNode) {
        yield this.resolveItem(item)
      } else {
        mustBeArray(item, 'item')
        yield* this.resolveItems(...item)
      }
    }
  }

  /**
   * @param {SyntaxNodeOrNodes} content
   * @returns {string?}
   */
  resolveContent(content) {
    if (content) {
      return [...this.resolveItems(content)].join('').trim()
    }

    return null
  }
}

exports.CodeContext = CodeContext

class Description {

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

  static from(input) {
    if (input instanceof Description) {
      return input
    } else if (input) {
      return new Description(input)
    } else {
      return undefined
    }
  }

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

const TagFactory = {
}

class Tag {
  /** @type {string} */ kind
  /** @type {TextSpan?} */ textSpan

  /**
   * @param {TagSyntaxNode} syntax
   * @param {CodeContext} context
   * @returns {Tag}
   */
  static from(syntax, context) {
    mustBeInstanceOf(syntax, TagSyntaxNode, 'syntax')
    const type = TagFactory[syntax.constructor]
    if (type) {
      return new type(syntax, context)
    }

    return new DynamicTag(syntax, context)
  }

  /**
   * @param {TagSyntaxNode} syntax
   * @param {CodeContext} context
   */
  constructor(syntax, context) {
    mustBeInstanceOf(syntax, TagSyntaxNode, 'syntax')
    this.kind = syntax.kind
    this.textSpan = syntax.textSpan
  }

  /**  @type {string?} */
  get id() {
    console.assert(false, 'whoops tag', this.constructor)
    return null
  }
}
exports.Tag = Tag

class ContentTag extends Tag {
  /**
   * @param {ContentTagSyntaxNode} syntax
   * @param {CodeContext} context
   */
  constructor(syntax, context) {
    super(syntax, context)

    this.content = context.resolveContent(syntax.content)
    this.name = 'name' in syntax ? syntax.name : undefined
    console.assert(!syntax.type && !syntax.expression && !syntax.defaultValue, 'oops')
    this.value = syntax.value?.toString()
    this.annotations = syntax.annotations
  }
}
TagFactory[ContentTagSyntaxNode] = ContentTag



class DynamicTag extends Tag {
  /** @type {string} */ content
  /** @type {ItemName?} */ name
  /** @type {string?} */ type
  /** @type {string?} */ value
  /** @type {string?} */ defaultValue
  /** @type {Annotation[]} */ annotations

  /**
   * @param {TagSyntaxNode} syntax
   * @param {CodeContext} context
   */
  constructor(syntax, context) {
    super(syntax, context)
    console.infoOnce(syntax.constructor.name, `${syntax.constructor.name} uses DynamicTag`)

    this.content = context.resolveContent(syntax.content)
    this.name = 'name' in syntax ? syntax.name : undefined
    this.type = syntax.type?.toString()
    this.value = syntax.value?.toString()
    this.expression = syntax.expression?.toString()
    this.defaultValue = syntax.defaultValue?.toString()
    this.annotations = syntax.annotations
  }

  /** @override @type {string?} */
  get id() {
    return this.name?.value
  }
}

class LinkTag extends Tag {
  /** @type {string|URL} */ href
  /** @type {string} */ content

  /**
   * @param {LinkTagSyntaxNode} syntax
   * @param {CodeContext} context
   */
  constructor(syntax, context) {
    //mustBeInstanceOf(syntax, LinkTagSyntaxNode, 'syntax')
    super(syntax, context)

    // Resolve
    this.href = context.resolveLink(syntax.href)
    this.content = context.resolveContent(syntax.content)

    console.warn('LINK tag', this.href, this.content)
  }
}
exports.LinkTag = LinkTag
TagFactory[LinkTagSyntaxNode] = LinkTag

class ParamTag extends Tag {
  /** @type {string?} @deprecated */ type
  /** @type {ItemName} */ name
  /** @type {string?} @deprecated */ defaultValue
  /** @type {string} */ content

  /**
   * @param {ParamTagSyntaxNode} syntax
   * @param {CodeContext} context
   */
  constructor(syntax, context) {
    super(syntax, context)
    this.name = syntax.name
    this.content = context.resolveContent(syntax.content)
  }

  /** @type {string} The canonical identifier for this tag. */
  get id() {
    // BUGBUG: some of the param name reading doesn't work yet.
    return this.name?.value
  }
}
TagFactory[ParamTagSyntaxNode] = ParamTag

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
TagFactory[VisibilityTagSyntaxNode] = VisibilityTag


class Comment {
  /** @type {SyntaxNode[]} The doc comment nodes */
  nodes
  /** @type {SyntaxNode} The original source node to which this comment applies */
  code

  /** @type {IdentifierSyntaxNode} */ name
  /** @type {CodeContext?} */ context

  /** @type {TextSpan} */
  get textSpan() { return this.code.textSpan }

  /** @returns {Tag[]} The array of tag objects */
  tags

  /** @returns {TagSyntaxNode[]} The array of tag nodes. */
  get tagNodes() {
    return this.nodes.filter(n => n instanceof TagSyntaxNode)
  }

  /**
   * @param {DeclarationStatementSyntaxNode} code
   * @param {SyntaxNode[]} nodes The doc syntax nodes.
   * @param {CodeContext} context The code context.
   */
  constructor(code, context, nodes) {
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
