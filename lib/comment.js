/**
 * @typedef {import("./syntax").Token} Token
 * @typedef {import("./syntax").SyntaxNode} SyntaxNode
 */

const { EOL } = require('os')
const { TagSyntaxNode } = require("./javadoc/syntax")
const { TextSpan } = require("./position")
const { IdentifierSyntaxNode } = require("./syntax")

class CodeContext {
  /** @type {string} */ kind
  /** @type {string} */ type
  /** @type {string} */ name
  /** @type {CodeContext[]} */ children = []
  /** @type {CodeContext?} */ parent
  /** @type {string?} */ header
  /** @type {CodeContext[]?} */ constants
  /** @type {CodeContext[]?} */ exceptions
  /** @type {CodeContext[]?} */ variables

  /**
   * @param {...CodeContext} params
   */
  constructor(params) {
    Object.assign(this, params)
  }
}

exports.CodeContext = CodeContext

class Description {

  /** The full text */
  full = ''

  /** The first line of the comment */
  get summary() {
    const index = this.full.indexOf(EOL)
    return index < 0 ? this.full : this.full.slice(0, index).trimEnd()
  }

  /** The rest of the comment */
  get body() {
    const index = this.full.indexOf(EOL)
    return index < 0 ? '' : this.full.slice(index + EOL.length).trimStart()
  }

  /**
   * @param {string|Array} text
   */
  constructor(text) {
    if (typeof text !== 'string') throw new Error('Parameter "text" must be a string')
    this.full = text.trim()
  }

  static concat(...values) {
    if (values.length === 0) {
      return ''
    }

    return new Description(values.join(EOL))
  }

  /**
   * @param {...string|Description} values
   */
  concat(...values) {
    if (values.length === 0) {
      return this
    }

    if (!this.full) {
      // We're empty, just return a new description
      return new Description(values.join(EOL))
    }

    return new Description(this.full + EOL + values.join(EOL))
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
  /** @type {string} */ content
  /** @type {string?} */ name
  /** @type {string?} */ type
  /** @type {string?} */ value
  /** @type {TextSpan?} */ textSpan

  /**
   * @param {TagSyntaxNode} syntax
   */
  constructor(syntax) {
    this.syntax = syntax
    this.kind = syntax.kind
    this.content = syntax.content.map(t => t.toStructuredString()).join('') // LATER: resolve links
    this.name = syntax.name?.toString()
    this.type = syntax.type?.toString()
    this.value = syntax.value?.toString()
    this.textSpan = syntax.textSpan
  }
}

class Comment {
  /** @type {Token} The token from the original source (e.g., PL/SQL) */
  token
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
   *
   * @param {SyntaxNode} code
   * @param {Token} token The token from the original source (PL/SQL)
   * @param {SyntaxNode[]} nodes The doc syntax nodes.
   */
  constructor({ code, token, nodes, context }) {
    this.code = code
    this.nodes = nodes.flat()
    this.name = code.name
    this.context = context

    const text = []
    // XXX move this all elsewhere, Comment should be a bit less opinionated about how to use its tags.
    this.tags = this.tagNodes.map(syntax => new Tag(syntax))
  }

  toString() {
    return this.nodes.join(' ')
  }
}

exports.Comment = Comment
