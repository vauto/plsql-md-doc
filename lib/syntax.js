/**
 * @typedef {'mcomment' | 'scomment' | 'string' | 'identifier' | 'code'} SyntaxType
 * @typedef {import("moo").Token} Token
 * @typedef {SyntaxNode | Token} SyntaxNodeOrToken
 */

class SyntaxNodeFactory {
  /**
   * @param  {...{Token | Token[]}} tokens
   * @returns {SyntaxNode}
   */
  create(...tokens) {
    return new SyntaxNode(...tokens.flat())
  }

}
exports.SyntaxNodeFactory = SyntaxNodeFactory

/**
 * @param {Token} token
 * @returns {boolean}
 */
const isTrivia = (token) => token.type === 'whitespace' || token.type.startsWith('comment.')
/**
 * @param {Token} token
 * @returns {boolean}
 */
const isNotTrivia = (token) => !isTrivia(token)

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
        value: { /* pseudo-token */ type: 'EOT' },
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
  /** @type {Token[]} All tokens. */ tokens

  constructor(...tokens) {
    this.tokens = [...tokens].flat()
    this.tokens.forEach(t => t.isTrivia = isTrivia(t))

    if (this.tokens.some(x => (x instanceof Array))) {
      throw new Error("boom.")
    }
  }

  get token() {
    return this.tokens[0]
  }

  /** @type {SyntaxNode[]} Child nodes. */ children = []
  /** @type {SyntaxNode?} Parent */ parent = null;

  *getTokens() {
    yield* this.tokens.filter(isNotTrivia)
  }

  toString() {
    if (this.children.length) {
      return this.children.join(' ')
    }
    return [...this.getTokens()].join(' ')
  }

  toFullString() {
    return this.tokens.join(' ')
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
