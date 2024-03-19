/**
 * @typedef {import("./syntax").Token} Token
 */

const { EOL } = require('os')
const { console } = require('./debug')
const { TagSyntaxNode } = require("./javadoc/syntax")
const { TextSpan } = require("./position")
const { SyntaxNode, IdentifierSyntaxNode, Annotation } = require("./syntax")
const { PlsqlItemName, PlsqlMemberName } = require("./plsql/name")

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

class Tag {
  /** @type {string} */ kind
  /** @type {string} */ content
  /** @type {PlsqlMemberName?} */ name
  /** @type {string?} */ type
  /** @type {string?} */ value
  /** @type {TextSpan?} */ textSpan

  /**
   * @param {TagSyntaxNode} syntax
   */
  constructor(syntax) {
    this.syntax = syntax
    this.kind = syntax.kind
    this.content = syntax.content?.map(t => t.toStructuredString()).join('') // LATER: resolve links
    this.name = PlsqlMemberName.from(syntax.name)
    this.type = syntax.type?.toString()
    this.value = syntax.value?.toString()
    this.textSpan = syntax.textSpan
  }

  /**  @type {string?} */
  get id() {
    return this.name?.value
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
    this.token = token
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
