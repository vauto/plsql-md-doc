/**
 * @typedef {'mcomment' | 'scomment' | 'string' | 'identifier' | 'code'} SyntaxType
 * @typedef {import("moo").Token} Token
 * @typedef {SyntaxNode | Token} SyntaxNodeOrToken
 *
 * @typedef {Token} TokenLike
 * @typedef {TokenLike | string | TokenPattern[]} TokenPattern For matching tokens.  Arrays indicate `OR` matches.
 */

const { Position } = require("./position")


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

  /**
   *
   * @param {Iterable<Token>} data
   * @param {integer} start
   */
  constructor(data, start = 0) {
    if (typeof data !== 'object') throw new Error(`data cannot be of type '${typeof data}'.`)
    if (data === null) throw new Error(`data cannot be null.`)
    this.#data = data instanceof Array ? data : [...data]
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
   * @returns {Generator<TokenLike>}
   */
  *peek(count = 1) {
    const iter = new TokenIterator(this.#data, this.#index)

    for (const i = 0; i < count && !iter.done; i++) {
      yield iter.next().value
    }
  }

  #matches(pattern, token) {
    switch (typeof pattern) {
      case 'string':
        if (pattern !== token.value) {
          return false
        }
        break
      case 'object':
        if (pattern instanceof Array) {
          return pattern.some(p => this.#matches(p, token))
        }

        for (const k in pattern) {
          if (pattern[k] !== token[k]) {
            return false
          }
        }
        break
      default:
        throw new Error(`Unexpected pattern type: ${typeof pattern}: ${pattern}`)
    }

    // Everything matched.
    return true
  }

  /**
   * Read until we hit the given pattern.
   * @param {TokenPattern} pattern
   * @returns
   *
   * @example
   * this.readUntil({ type: 'reserved', value: 'IS' }); // reads until the reserved word "IS"
   */
  *readUntil(pattern) {
    while (!this.done && !this.#matches(pattern, this.value)) {
      yield this.value
      this.next()
    }

    // Return this value too.
    if (!this.done) {
      yield this.value
    }
  }


  /**
   * Test at the current token.
   * @param  {TokenPattern} pattern The test for the current token.
   * String values are expected to match `Token.value`.
   * @param {...TokenPattern} patterns Token-like objects to match on subsequent nodes.
   * String values are expected to match `Token.value`.
   * @returns
   */
  is(pattern, ...patterns) {
    if (!this.#matches(pattern, this.value)) {
      return false
    }

    // If there are more tokens, peek them.
    return this.expect(...patterns)
  }

  /**
   * Peek and test
   * @param {...TokenPattern} patterns Token-like objects to match.
   * String values are expected to match `Token.value`.
   * @returns {boolean} true if matches, false otherwise
   */
  expect(...patterns) {
    const peek = new TokenIterator(this.#data, this.#index)
    for (const pattern of patterns) {
      peek.next()

      if (peek.done) {
        return false
      }

      if (!this.#matches(pattern, peek.value)) {
        return false
      }
    }

    // Everything matched
    return true
  }
}
exports.TokenIterator = TokenIterator


function stringifyTokenArray(tokens, format, separator = ' ') {
  switch (format?.toUpperCase()) {
    case 'T':
      return tokens.map(t => t.text).join(separator)
    case 'V':
      return tokens.map(t => t.value).join(separator)
    default:
      return tokens.join(separator)
  }
}

/**
 * Base syntax node class.
 */
class SyntaxNode {
  /** @type {Token[]} All tokens. */ allTokens = []
  /** @type {SyntaxNode?} */ parent

  constructor(...tokens) {
    this.kind = this.constructor.name.replace(/SyntaxNode$/, '') || 'default'
    if (tokens.length) {
      this.push(...tokens)
    }
  }

  /**
   *
   * @param {SyntaxNodeOrToken?} value
   * @returns {SyntaxNode?} NOTE: null => null, all else is a SyntaxNode
   */
  static from(value) {
    if (typeof value !== 'object') throw new Error(`nodeOrToken cannot be of type '${typeof value}'.`)
    if (value === null) return null
    if (value instanceof SyntaxNode) {
      return value
    }

    if (!('type' in value)) {
      throw new Error(`nodeOrToken must either be a SyntaxNode or a Token; this is neither. (value: ${value})`)
    }

    return new SyntaxNode(value)
  }

  #flatten(token) {
    if (typeof token !== 'object') throw new Error(`token cannot be of type '${typeof token}'.`)
    if (token === null) throw new Error(`token cannot be null.`)
    if (token instanceof TokenGroup) {
      // Add not as the faux token, but as the underlying list of tokens.
      return token.tokens
    }
    if (Symbol.iterator in token) {
      return [...token]
    }
    if (!('type' in token)) throw new Error(`Parameter 'token' must contain a field named 'type'. (value: ${token})`)

    return token
  }

  push(...tokens) {
    let i = 0
    for (const token of tokens.flatMap(this.#flatten)) {
      if (typeof token !== 'object') throw new Error(`tokens[${i}] cannot be of type '${typeof token}'.`)
      if (token === null) throw new Error(`tokens[${i}] cannot be null.`)
      if (token instanceof TokenGroup) {
        // Add not as the faux token, but as the underlying list of tokens.
        this.allTokens.push(...token.tokens)
        continue
      }
      if (Symbol.iterator in token) throw new Error(`Parameter 'token' cannot be an iterator. (value: ${token})`)
      if (!('type' in token)) throw new Error(`Parameter 'token' must contain a field named 'type'. (value: ${token})`)

      // It's a token
      this.allTokens.push(token)
    }

    this.allTokens.forEach(t => console.assert(t && typeof t === 'object' && !(t instanceof SyntaxNode) && !(t instanceof TokenGroup)))
  }

  /**
   * Gets the first nontrivial token.
   */
  get firstToken() {
    for (const token of this.allTokens) {
      if (!token.isTrivia) {
        return token
      }
    }
  }

  /**
   * Nontrivial tokens.
   */
  get tokens() {
    return this.allTokens.filter(t => !t.isTrivia)
  }

  toString(format = null) {
    return stringifyTokenArray(this.tokens, format)
  }

  /**
   * String of all tokens.
   */
  toFullString(format = null) {
    return stringifyTokenArray(this.allTokens, format)
  }

  get line() {
    return this.allTokens[0]?.line
  }
  get col() {
    return this.allTokens[0]?.col
  }
  get start() {
    return this.allTokens[0]?.start
  }
  get end() {
    return this.allTokens.at(-1)?.end
  }

  /**
   * @generator
   * @yields {Token} A trivial (whitespace, comment) token.
   * @returns {Generator<Token>}
   */
  *getAllTrivia() {
    yield* this.allTokens.filter(t => t.isTrivia)
  }

  /**
   * @generator
   * @yields {Token} A trivial (whitespace, comment) token.
   * @returns {Generator<Token>}
   */
  *getLeadingTrivia() {
    for (const token of this.allTokens) {
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
    for (const token of this.allTokens.reverse()) {
      if (token.isTrivia) {
        break
      }
      trivia.unshift(token)
    }

    yield* trivia.reverse()
  }

  /** @returns {string} The logical value of the token */
  get value() {
    return stringifyTokenArray(this.tokens, 'V', ' ')
  }
}
exports.SyntaxNode = SyntaxNode

class ContainerSyntaxNode extends SyntaxNode {
  /** @type {SyntaxNode[]} Child nodes. */ children = []

  constructor(...nodesOrTokens) {
    super()
    if (nodesOrTokens.length) {
      this.push(...nodesOrTokens)
    }
  }

  /**
   * @param  {...SyntaxNodeOrToken} nodesOrTokens
   */
  push(...nodesOrTokens) {
    for (const nodeOrToken of nodesOrTokens.flat()) {
      const node = SyntaxNode.from(nodeOrToken)

      this.children.push(node)
      node.parent = this
      super.push(...node.allTokens)
      // if (nodeOrToken instanceof SyntaxNode) {
      //   this.children.push(nodeOrToken)
      //   nodeOrToken.parent = this
      //   super.push(...nodeOrToken.allTokens)
      // } else {
      //   // Add this as a new syntax node
      //   this.children.push(new SyntaxNode(nodeOrToken))
      //   super.push(nodeOrToken)
      // }
    }

    console.assert(this.allTokens.length === this.children.reduce((sum, node) => sum + node.allTokens.length, 0), 'parent == sum of parts of children')
  }

  toString(format = null) {
    return this.children.map(c => c.toString(format)).join(' ')
  }

  /**
   * String of all tokens.
   */
  toFullString(format = null) {
    return this.children.map(c => c.toFullString(format)).join(' ')
  }
}

exports.ContainerSyntaxNode = ContainerSyntaxNode

class StatementSyntaxNode extends ContainerSyntaxNode {
  /**
   * @param {{ [x:string]: SyntaxNodeOrToken? }} params
   */
  constructor(params = {}) {
    super()
    for (const [key, value] of Object.entries(params)) {
      const nodeOrNull =  this[key] = SyntaxNode.from(value)
      if (nodeOrNull) {
        this.push(nodeOrNull)
      }
    }
  }
}
exports.StatementSyntaxNode = StatementSyntaxNode



class IdentifierSyntaxNode extends SyntaxNode {
  /**
   * @override
   * @param {string?} format
   * @returns
   */
  toString(format = null) {
    return stringifyTokenArray(this.tokens, format, '')
  }
}
exports.IdentifierSyntaxNode = IdentifierSyntaxNode


/**
 * @implements {Iterator<SyntaxNode}
 */
class SyntaxNodeReader {
  /**
   * @param {Iterator<Token>} iterator
   */
  constructor(iterator) {
    this.iterator = iterator instanceof TokenIterator ? iterator :
      iterator instanceof Array ? new TokenIterator(iterator) :
        new TokenIterator([...iterator])
  }

  [Symbol.iterator]() { return this }

  /** @returns {boolean} */
  get done() {
    return this.iterator.done
  }

  next() {
    if (this.done) {
      // We already finished.
      return { done: true }
    }

    const value = this.read()
    console.assert(value !== undefined || this.done, 'if we receive undefined we should be done now.')
    return { done: value === undefined, value }
  }

  /** @returns {Token?} The current token. */
  get value() {
    throw new Error('NO')
  }

  /** @returns {Token?} The current token. */
  get token() {
    throw new Error('NO')
  }

  /**
   * Returns whether the given pattern and token match.
   * @param {TokenPattern} pattern
   * @param {Token} token
   * @returns {boolean} true if match, false if not
   */
  matches(pattern, token) {
    if (!token) {
      // can't match null/undefined
      return false
    }

    switch (typeof pattern) {
      case 'string':
        if (pattern !== token.value) {
          return false
        }
        break
      case 'object':
        if (pattern instanceof Array) {
          // array: indicates "OR" pattern
          return pattern.some(p => this.matches(p, token))
        }

        for (const k in pattern) {
          if (pattern[k] !== token[k]) {
            return false
          }
        }
        break
      default:
        throw new Error(`Unexpected pattern type: ${typeof pattern}: ${pattern}`)
    }

    // Everything matched.
    return true
  }

  /**
   * Verifies the given pattern and token match.
   * @param {TokenPattern} pattern The pattern
   * @param {Token} token  The token
   */
  verify(pattern, token) {
    if (!this.matches(pattern, token)) {
      throw new Error(`Expected: ${JSON.stringify(pattern)} but got ${token}`)
    }
  }

  /**
   * Reads a single next token if one is present, with an optional pattern match.
   * @param {TokenPattern} pattern=undefined An optional pattern.
   * @returns {Token?}
   */
  tryReadNextToken(pattern = undefined) {
    switch (arguments.length) {
      case 0:
        // Any token, pattern doesn't matter
        return this.iterator.next().value
      default:
        if (this.iterator.expect(pattern)) {
          return this.readNextToken()
        }
    }
  }

  /**
   * Reads a single next token, throwing an exception if not found,
   * and matching an optional pattern.
   * @param {TokenPattern} pattern=undefined An optional pattern.
   * @returns {Token}
   */
  readNextToken(pattern = undefined) {
    // Regardless of pattern match, we want to read the next token.
    const { done, value: token } = this.iterator.next()
    if (done) {
      throw new Error("Expected token but found EOF")
    }

    if (pattern) {
      this.verify(pattern, token)
    }

    return token
  }

  /**
   * Read multiple tokens (including current) if they match the patterns.
   * @param {Token} token The current token
   * @param {TokenPattern} pattern The pattern for {@link token}
   * @param  {...TokenPattern} patterns The patterns to peek, if any
   * @returns {Token[]?}
   */
  tryReadTokensIf(token, pattern, ...patterns) {
    // Handle current.
    if (!this.matches(pattern, token)) {
      return false
    }

    if (this.iterator.expect(...patterns)) {
      return [token, ...patterns.map(p => this.readNextToken())]
    }

    return null
  }

  /**
   * Read multiple tokens if they match the patterns.
   * @param  {...TokenPattern} patterns
   * @returns {Token[]?}
   */
  tryReadNextTokens(...patterns) {
    if (this.iterator.expect(...patterns)) {
      return patterns.map(p => this.readNextToken())
    }

    return null
  }

  /**
   * Read all tokens that match pattern.
   * @param  {TokenPattern} patterns
   * @returns {Token?}
   */
  *readNextTokensWhile(pattern) {
    let token
    while (token = this.tryReadNextToken(pattern)) {
      yield token
    }
  }

  /**
   * Reads more tokens until `pattern`, inclusive, throwing an exception on EOF.
   * @param {TokenPattern} pattern
   * @returns {Generator<Token>}
   */
  *readNextTokensUntil(pattern) {
    let token
    while (token = this.tryReadNextToken()) {
      yield token
      if (this.matches(pattern, token)) {
        break
      }
    }
  }

  read() { throw new Error('abstract method not implemented') }

}
exports.SyntaxNodeReader = SyntaxNodeReader
