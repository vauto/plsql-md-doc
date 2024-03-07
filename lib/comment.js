/**
 * @typedef {import("./syntax").Token} Token
 * @typedef {import("./syntax").SyntaxNode} SyntaxNode
 */

const { TagSyntaxNode } = require("./javadoc/syntax")
const { IdentifierSyntaxNode } = require("./syntax")

class CodeContext {
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
  summary = ''
  /** The rest of the comment */
  body = ''

  constructor(full) {
    this.full = full
    if (full) {
      const newline = full.indexOf('\n')
      if (newline < 0) {
        this.summary = full
      } else {
        this.summary = full.slice(0, newline)
        this.body = full.slice(newline + 1)
      }
    }
  }

  toString() {
    return this.full
  }
}

class Comment {
  /** @type {Token} The token from the original source (e.g., PL/SQL) */
  token
  /** @type {SyntaxNode[]} The doc comment nodes */
  nodes
  /** @type {SyntaxNode[]} The original source nodes to which this comment applies */
  code

  /** @type {IdentifierSyntaxNode} */ name

  /** @type {CodeContext?} */ ctx

  /**
   * @type {Description} The parsed description
   */
  description = null
  visibility = 'public'

  /** true when "@api private" is used */
  get isPrivate() {
    return this.visibility === 'private'
  }

  get start() { return this.token.start }
  get end() { return this.token.end }

  /** @returns {TagSyntaxNode[]} The array of tag objects */
  get tags() {
    return this.nodes.filter(n => n instanceof TagSyntaxNode)
  }

  isConstructor = false

  /**
   *
   * @param {SyntaxNode} code
   * @param {Token} token The token from the original source (PL/SQL)
   * @param {SyntaxNode[]} nodes The doc syntax nodes.
   */
  constructor({ code, token, nodes }) {
    this.code = [code]
    this.token = token
    this.nodes = nodes.flat()
    this.name = code.name

    this.ctx = new CodeContext({
      name: code.name?.toString('T'),
      type: (code.type ?? code.objectType)?.toString().toLowerCase(),
      specification: code.specification?.toString('T')
    })

    const text = []
    for (const node of this.tags) {
      if (node.visibility) {
        this.visibility = node.visibility
      }

      if (node.description) {
        text.push(node.description)
      }
    }

    this.description = new Description(text.join(' '))


    // // parse tags
    // if (tags.length) {
    //   comment.tags = tags.slice(1).map(this.parseTag);
    //   comment.isPrivate = comment.tags.some(function (tag) {
    //     return 'private' == tag.visibility;
    //   });
    //   comment.isConstructor = comment.tags.some(function (tag) {
    //     return 'constructor' == tag.type || 'augments' == tag.type;
    //   });
    //   comment.isClass = comment.tags.some(function (tag) {
    //     return 'class' == tag.type;
    //   });
    //   comment.isEvent = comment.tags.some(function (tag) {
    //     return 'event' == tag.type;
    //   });

    //   if (!description.full || !description.full.trim()) {
    //     comment.tags.some(function (tag) {
    //       if ('description' == tag.type) {
    //         description.full = tag.full;
    //         description.summary = tag.summary;
    //         description.body = tag.body;
    //         return true;
    //       }
    //     });
    //   }
    // }
    // // markdown
    // if (!raw) {
    //   description.full = markdown.render(description.full).trim();
    //   description.summary = markdown.render(description.summary).trim();
    //   description.body = markdown.render(description.body).trim();
    //   comment.tags.forEach(function (tag) {
    //     if (tag.description) tag.description = markdown.render(tag.description).trim();
    //     else tag.html = markdown.render(tag.string).trim();
    //   });
    // }

    // return comment;
  }

  toString() {
    return this.nodes.join(' ')
  }
}

exports.Comment = Comment
