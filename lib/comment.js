/**
 * @typedef {import("./syntax").Token} Token
 * @typedef {import("./syntax").SyntaxNode} SyntaxNode
 */

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
  /** array of tag objects */
  tags = []
  /** @type {SyntaxNode[]} The referenced code nodes */
  code = []
  /** @type {SyntaxNode[]} The comment nodes */
  nodes

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
  }
}

exports.Comment = Comment
