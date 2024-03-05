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
    // Buffer trivial tokens and send one out in each iterator.
    const buffer = []
    for (const token of iterator) {
      buffer.push(token)
      if (!token.isTrivia) {
        yield new SyntaxNode(...buffer)
        buffer = []
      }
    }

    if (buffer.length) {
      yield new SyntaxNode(...buffer)
    }
  }
}
exports.SyntaxNodeFactory = SyntaxNodeFactory

/** @implements {Token} */
class TokenGroup {

  constructor(tokens) {
    if (!tokens) throw "tokens cannot be null"
    if (!tokens.length) throw "tokens cannot be empty"
    this.tokens = tokens
    Object.assign(this, tokens.at(-1))
  }

  /** @property {Token[]} The full set of tokens, trivial and nontrivial. */
  tokens
}

/**
 * @interface TokenGroup
 * @extends Token
 */

/**
 * Token iterator taking trivia into account
 * @implements {Iterator<TokenGroup>}
 * @implements {IteratorResult}
 */
class TokenIterator {

  #data
  #index
  /** @type {TokenGroup?} */ #value

  constructor(data, start = 0) {
    this.#data = data
    this.#index = start
  }

  [Symbol.iterator]() { return this }

  get done() {
    return this.#index >= this.#data.length
  }

  /**
   * @type {TokenGroup?} The current token group.
   * Token data is of the only possibly nontrivial token.
   */
  get value() {
    return this.#value
  }

  /**
   * @returns {TokenIterator} this
   */
  next() {
    if (this.done) {
      this.#value = undefined
      return this
    }

    const start = this.#index,
      length = this.#data.length

    // Scan until we find a nontrivial node or the end of the buffer.
    for (; this.#index < length; this.#index++) {
      if (!this.#data[this.#index].isTrivia) {
        break
      }
    }

    const tokens = this.#index >= length
      // All the remaining is trivia.
      ? this.#data.slice(start)
      : this.#data.slice(start, ++this.#index)

    this.#value = new TokenGroup(tokens)
    return this
  }

  /**
   *
   * @returns {TokenLike[] | TokenLike?}
   */
  *peek(count = 1) {
    const iter = new TokenIterator(this.#data, this.#index)

    for (const i = 0; i < count && !iter.done; i++) {
      yield iter.next().value
    }
  }


  /**
   * Pass a bunch of tokenlike
   * @param {...{TokenLike|string}} tokens Token-like objects to match.
   * String values are expected to match `Token.value`.
   * @returns {boolean} true if matches, false otherwise
   */
  expect(...tokens) {
    const peek = new TokenIterator(this.#data, this.#index)
    for (const token of tokens) {
      peek.next()

      if (peek.done) {
        return false
      }

      switch (typeof token) {
        case 'string':
          if (token !== peek.value.value) {
            return false
          }
          break
        case 'object':
          for (const k in token) {
            if (token[k] !== peek.value[k]) {
              return false
            }
          }
          break
        default:
          throw new Error(`Unexpected token type: ${typeof token}: ${token}`)
      }

      // Everything matched
      return true
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
    this.push(...nodesOrTokens)
    this.tokens.forEach(t => console.assert('isTrivia' in t, 'oops', t))
    this.tokens.forEach(t => console.assert(t && !(t instanceof SyntaxNode) && !(t instanceof TokenGroup)))
  }

  push(...nodesOrTokens) {
    for (const nodeOrToken of nodesOrTokens.flat()) {
      if (nodeOrToken instanceof SyntaxNode) {
        this.tokens.push(...nodeOrToken.tokens)
        this.children.push(nodeOrToken)
      } else if (nodeOrToken instanceof TokenGroup) {
        // Add not as the faux token, but as the underlying list of tokens.
        this.tokens.push(...nodeOrToken.tokens)
      } else if (nodeOrToken instanceof Array) {
        //console.assert(!(nodeOrToken instanceof Array), 'array', nodeOrToken)
        throw "no"
      } else if (nodeOrToken) {
        this.tokens.push(nodeOrToken)
      }
    }
  }

  get firstToken() {
    for (const token of this.tokens) {
      if (!token.isTrivia) {
        return token
      }
    }
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
    return this.tokens[0]?.line
  }
  get col() {
    return this.tokens[0]?.col
  }

  get start() {
    const token = this.tokens[0]
    return token ? new Position(token.line, token.col) : null
  }
  get end() {
    const token = this.tokens.at(-1)
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
