/**
 * @typedef {'mcomment' | 'scomment' | 'string' | 'identifier' | 'code'} SyntaxType
 * @typedef {import("moo").Token} Token
 * @typedef {SyntaxNode | Token} SyntaxNodeOrToken
 */

const { Position } = require("./position")

class SyntaxNodeFactory {
  /**
   * @param  {...{Token | Token[]}} tokens
   * @returns {SyntaxNode}
   */
  create(...tokens) {
    return new SyntaxNode(...tokens.flat())
  }

  /**
   *
   * @param {Generator<Token>} iterator
   * @returns {Generator<SyntaxNode>}
   */
  *toSyntax(iterator) {
    return new SyntaxNode(iterator)
  }
}
exports.SyntaxNodeFactory = SyntaxNodeFactory

/**
 * Token iterator taking trivia into account
 */
class TokenIterator {

  constructor(tokens, start = 0) {
    this.tokens = tokens
    this.i = start
  }

  [Symbol.iterator]() { return this }

  next() {
    const start = this.i,
      len = this.tokens.length
    if (start >= len) {
      return { done: true, value: undefined }
    }

    for (; this.i < len; this.i++) {
      if (!this.tokens[this.i].isTrivia) {
        break
      }
    }

    const self = this
    if (this.i >= len) {
      return {
        done: false,
        peek: () => { done: true },
        value: undefined,
        tokens: this.tokens.slice(start)
      }
    }

    const tokens = this.tokens.slice(start, ++this.i)
    return {
      done: false,
      peek: () => new TokenIterator(this.tokens, this.i).next().value,
      tokens,
      value: tokens.at(-1)
    }
  }
}
exports.TokenIterator = TokenIterator

/**
 * Base syntax node class.
 */
class SyntaxNode {
  /** @type {{SyntaxNodeOrToken|SyntaxNodeOrToken[]}[]} All tokens. */ tokens = []
  /** @type {SyntaxNode[]} Child nodes. */ children = []
  /** @type {SyntaxNode?} Parent */ parent = null;

  constructor(...nodesOrTokens) {
    this.push(nodesOrTokens)
    this.tokens.forEach(t => console.assert('isTrivia' in t, 'oops', t))
  }

  push(...nodesOrTokens) {
    for (const nodeOrToken of nodesOrTokens.flat(2)) {
      if (nodeOrToken instanceof SyntaxNode) {
        this.tokens.push(...nodeOrToken.tokens)
        this.children.push(nodeOrToken)
      } else if (nodeOrToken) {
        console.assert(!(nodeOrToken instanceof Array), 'array')
        this.tokens.push(nodeOrToken)
      }
    }
  }

  get token() {
    return this.tokens[0]
  }

  get lastToken() {
    return this.tokens.at(-1)
  }


  *getTokens() {
    yield* this.tokens.filter(t => !t.isTrivia)
  }

  toString() {
    if (this.children.length) {
      return this.children.join(' ')
    }
    return [...this.getTokens()].map(t => t.text).join(' ')
  }

  toFullString() {
    return this.tokens.map(t => t.text).join(' ')
  }

  get line() {
    return this.token?.line ?? -1
  }
  get col() {
    return this.token?.col ?? -1
  }

  get start() {
    return this.token ? new Position(this.token.line, this.token.col) : null
  }
  get end() {
    const token = this.lastToken
    if (!token) {
      return null
    }

    if (!token.text) {
      console.warn('what', token)
    }

    const line = token.line + token.lineBreaks
    const col = (token.lineBreaks ? 1 : token.col) + token.text.length

    return new Position(line, col)
  }

  /**
   * @generator
   * @yields {Token} A trivial (whitespace, comment) token.
   * @returns {Generator<Token>}
   */
  *getAllTrivia() {
    yield* this.tokens.filter(t => t.isTrivia)
  }

  /**
   * @generator
   * @yields {Token} A trivial (whitespace, comment) token.
   * @returns {Generator<Token>}
   */
  *getLeadingTrivia() {
    for (const token of this.tokens) {
      if (!token.isTrivia) {
        break
      }
      yield token
    }
  }

  /**
   * @generator
   * @yields {Token} A trivial (whitespace, comment) token.
   * @returns {Generator<Token>}
   */
  *getTrailingTrivia() {
    const trivia = []
    for (const token of this.tokens.reverse()) {
      if (token.isTrivia) {
        break
      }
      trivia.unshift(token)
    }

    yield* trivia.reverse()
  }
}
exports.SyntaxNode = SyntaxNode

class SyntaxTree {
  /** @type {SyntaxNode[]} */
  items = []

  /**
   * @return {SyntaxNode?}
   */
  get current() {
    return this.items.at(-1)
  }

  /**
   * @param {SyntaxNodeOrToken} nodeOrToken
   */
  push(nodeOrToken) {
    this.current?.push(nodeOrToken)
    if (nodeOrToken instanceof SyntaxNode) {
      this.items.push(nodeOrToken)
    }
  }

  /**
   * @return {SyntaxNode?}
   */
  pop() {
    const item = this.items.pop()
    if (!item) throw "invalid state: no items"
    return item
  }
}
exports.SyntaxTree = SyntaxTree
