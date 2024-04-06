// @ts-check
const fs = require('fs-extra')
const { EOL } = require('os')
const console = require("./debug").child(__filename)
const { mustBeInstanceOf, mustBeArray, InvalidNumberOfArgumentsError } = require('./guards')
const {
  BraceContentExpressionSyntaxNode,
  BraceExpressionSyntaxNode,
  BraceNamePathExpressionSyntaxNode,
  BracketExpressionSyntaxNode,
  ContentTagSyntaxNode,
  IncludeTagSyntaxNode,
  InlineTagSyntaxNode,
  LinkTagSyntaxNode,
  NamePathExpressionSyntaxNode,
  ParamTagSyntaxNode,
  ReturnTagSyntaxNode,
  TagSyntaxNode,
  ThrowsExceptionTagSyntaxNode,
  UrlLiteralSyntaxNode,
  VisibilityTagSyntaxNode
} = require("./javadoc/syntax")
const { Identifier } = require('./name')
const { TextSpan } = require("./position")
const {
  AnnotationNode,
  ContentSyntaxNode,
  IdentifierSyntaxNode,
  SyntaxNode
} = require("./syntax")
const { PlsqlMemberName, PlsqlUniqueId } = require('./plsql/name')
const { pathToFileURL, fileURLToPath } = require('url')

/**
 * @typedef {import('./name').ItemName} ItemName
 * @typedef {import('./syntax').NamedSyntaxNode} NamedSyntaxNode
 * @typedef {import('./javadoc/syntax').NamePathOrUrlLiteralSyntaxNode} NamePathOrUrlLiteralSyntaxNode
 *
 * @typedef {SyntaxNode|SyntaxNode[]} SyntaxNodeOrNodes
 *
 * @typedef { string | URL | Tag | ItemName } ContentItem
 * @typedef { ContentItem | ContentItem[] } Content
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

class Annotation {
  /** @type {CodeContext?} */ context
  /** @type {string} */ name
  /** @type {string?} */ message

  /**
   * @overload
   * @param {AnnotationNode} node
   * @param {CodeContext} parent
   * @overload
   * @param {Tag} tag
   * @param {CodeContext} parent
   * @param {string} contentText
   */
  constructor() {
    switch (arguments.length) {
      default:
        throw new InvalidNumberOfArgumentsError(arguments)
      case 2:
        {
          const [node, context] = arguments
          this.context = context
          this.name = node.kind // yes, we want the node's kind for the name
          this.message = node.message ? context.resolveContent(node.message).join('') : null

          // Append strings for all other properties.
          for (const [key, value] of Object.entries(node)) {
            // Skip properties already set.
            if (key in this) continue
            this[key] = value instanceof SyntaxNode ? value.toString('V') : value
          }
        }
        break
      case 3:
        {
          const [tag, context, contentText] = arguments
          this.context = context
          this.name = tag.kind // yes, we want the tag's kind for the name
          this.message = contentText
        }
        break
    }

  }
}
exports.Annotation = Annotation

/**s
 * @extends {CodeContextLike}
 */
class CodeContext {
  /** @type {string} */ kind
  /** @type {CodeContext?} */ parent
  /** @type {Annotation[]} */ annotations = []

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
  /** @type {string?} */ baseType
  /** @type {boolean?} */ optional

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
   * Resolve a name path.
   * @param {NamePathExpressionSyntaxNode?} node
   * @returns {ItemName?}
   */
  resolveNamePath(node) {
    mustBeInstanceOf(node, NamePathExpressionSyntaxNode, 'node')

    return PlsqlUniqueId.from(node)
  }

  /**
   * @param {UrlLiteralSyntaxNode} node
   * @returns {URL}
   */
  resolveUrl(node) {
    mustBeInstanceOf(node, UrlLiteralSyntaxNode, 'node')

    // Resolve the URL, resolving relative paths to the original filename.
    const base = pathToFileURL(node.start.filename)
    return new URL(node.value, base)
  }

  /**
   * Resolve a node that is almost certainly a link of some kind.
   * @param {NamePathOrUrlLiteralSyntaxNode?} node
   * @returns {URL | ItemName | string?}
   */
  resolveNamePathOrUrl(node) {
    switch (true) {
      case node instanceof UrlLiteralSyntaxNode:
        return this.resolveUrl(node)
      case node instanceof NamePathExpressionSyntaxNode:
        return this.resolveNamePath(node)
      default:
        return null
    }
  }

  /**
   *
   * @param {InlineTagSyntaxNode} item
   * @returns {Generator<ContentItem>}
   * @yields {ContentItem}
   */
  *#resolveInlineTagContent(item) {
    const tag = Tag.from(item.tag, this)
    switch (true) {
      case tag instanceof IncludeTag:
        // Include tags are more sensitive to needing the wrapping tag's padding.
        // Extract surrounding whitespace and return that as well.
        if (item.hasLeadingTrivia) {
          yield item.leadingTrivia.filter(t => t.isTrivia === 'structured').join('')
        }

        yield tag

        if (item.hasTrailingTrivia) {
          yield item.trailingTrivia.filter(t => t.isTrivia === 'structured').join('')
        }

        break

      case tag instanceof LinkTag:
        // Link tags... don't need whitespace from the outer tag? maybe? IDK.
        console.info('link tag', { href: tag.href?.toString(), content: tag.content?.map(c => c.toString()).join('') })
        yield tag
        break

      default:
        console.warn('resolve unknown inline tag', tag.kind)
        yield tag
        break
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
          yield this.resolveUrl(item)
          break
        case item instanceof InlineTagSyntaxNode:
          // Return the inline tag as an array, it MAY have leading/trailing whitespace.
          yield [...this.#resolveInlineTagContent(item)]
          break
        case item instanceof BraceNamePathExpressionSyntaxNode:
          // FIXME resolve url
          yield item.toStructuredString('T')
          break
        case item instanceof NamePathExpressionSyntaxNode:
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
      case syntax instanceof IncludeTagSyntaxNode:
        return new IncludeTag(syntax, context)
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
        console.warnOnce(syntax.constructor.name, `unassigned tag class ${syntax.constructor.name} ${syntax.kind}`)
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
    this.annotations = syntax.annotations.map(a => new Annotation(a, context))
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
    this.href = context.resolveNamePathOrUrl(syntax.href)

    if (!this.content.length && syntax.href) {
      const content = context.resolveContent(syntax.href).join('').trim()
      if (content) {
        this.content = [content]
      }
    }

    console.info(this.constructor.name, { href: this.href?.toString(), content: this.content?.join("") })
  }
}
exports.LinkTag = LinkTag

class IncludeTag extends Tag {
  /** @type {string|ItemName|URL} */ href

  /**
   * @param {IncludeTagSyntaxNode} syntax
   * @param {CodeContext?} context
   */
  constructor(syntax, context) {
    super(syntax, context)

    // Resolve link
    this.href = context.resolveNamePathOrUrl(syntax.href)

    // Resolve content (LATER: async)
    if (this.href instanceof URL) {
      switch (this.href.protocol) {
        case 'file:':
          const path = fileURLToPath(this.href)
          try {
            this.content = [fs.readFileSync(path, 'utf8')]
          } catch (e) {
            console.warn('Cannot read file', syntax.href.toString('V'), e.message)
            console.log('Details', e)
            this.content = context.resolveContent(syntax)
          }
          break
        default:
          console.warn(`IncludeTag: '${this.href.protocol}' URLs are currently unsupported`)
          break
      }
    } else if (this.href) {
      console.warn(`IncludeTag: links of type ${this.href.constructor.name} are currently unsupported`)
    } else {
      console.warn(`IncludeTag: link is null`)
    }
  }
}
exports.IncludeTag = IncludeTag

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
