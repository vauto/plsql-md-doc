/**
 * @typedef {import("./syntax").Token} Token
 * @typedef {import("./syntax").SyntaxNode} SyntaxNode
 */

const { TagSyntaxNode } = require("./javadoc/syntax")

class CodeContext {
  /** @type {string} */ type
  /** @type {string} */ name
  /** @type {CodeContext[]} */ children = []
  /** @type {CodeContext?} */ parent
  /** @type {string?} */ header
  /** @type {CodeContext[]?} */ constants
  /** @type {CodeContext[]?} */ exceptions
  /** @type {CodeContext[]?} */ subtypes
  /** @type {CodeContext[]?} */ variables

  /**
   * @param {...CodeContext} params
   */
  constructor(params) {
    Object.assign(this, params)
  }
}

exports.CodeContext = CodeContext

class Comment {
  /** @type {SyntaxNode[]} The referenced code nodes */
  code = []
  /** @type {SyntaxNode[]} The comment nodes */
  nodes
  /** array of tag objects */
  get tags() {
    return this.nodes.filter(n => n instanceof TagSyntaxNode)
  }

  /** @type {CodeContext?} */ ctx

  /**
   * The parsed description
   * @property {string} full The full text
   * @property {string} summary The first line of the comment
   * @property {string} body The rest of the comment
   */
  description = { full: '', summary: '', body: '' }
  /** true when "@api private" is used */
  isPrivate = false
  isConstructor = false
  line = 0

  constructor(...nodes) {
    this.nodes = nodes.flat()

    const text = []
    for (const node of this.nodes) {
      if (node.visibility) {
        this.isPrivate = node.visibility === 'private'
      }

      if (node.description) {
        text.push(node.description)
      }
    }

    const full = text.join(' ')
    this.description.full = full
    if (full) {
      const newline = full.indexOf('\n')
      if (newline < 0) {
        this.description.summary = full
      } else {
        this.description.summary = full.slice(0, newline)
        this.description.body = full.slice(newline + 1)
      }
    }
  }

  toString() {
    return this.nodes.join(' ')
  }
}

exports.Comment = Comment
