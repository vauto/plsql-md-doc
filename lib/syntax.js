/**
 * @typedef {import("moo").Token} Token
 * @typedef {SyntaxNode | Token} SyntaxNodeOrToken
 *
 * @typedef {Token} TokenLike
 * @typedef {TokenLike | string | TokenPattern[]} TokenPattern For matching tokens.  Arrays indicate `OR` matches.
 */

const { Position } = require("./position")


/**
 * @implements {Token}
 * @extends Token
 */
class TokenGroup {

  constructor(tokens) {
    if (!tokens) throw "tokens cannot be null"
    if (!tokens.length) throw "tokens cannot be empty"
    this.tokens = tokens
    Object.assign(this, tokens.at(-1))
  }

  /** @property {Token[]} The full set of tokens, trivial and nontrivial. */
  tokens

  [Symbol.iterator]() { return new SimpleTokenIterator(this.tokens) }
}

class SimpleTokenIterator {
  /**
   * @param {Token[]} tokens
   */
  constructor(tokens, start = 0) {
    this.tokens = tokens
    this.i = start
  }

  [Symbol.iterator]() { return this }

  get done() { return this.i >= this.tokens.length }

  next() {
    return this.done ? { done: true } : { value: this.tokens[this.i++] }
  }
}

/**
 * @interface TokenGroup
 */

const flattenTokens = (token) => {
  if (typeof token !== 'object') throw new Error(`token cannot be of type '${typeof token}'.`)
  if (token === null) throw new Error(`token cannot be null.`)
  if (token instanceof TokenGroup) {
    // Add not as the faux token, but as the underlying list of tokens.
    return token.tokens
  }

  if (Symbol.iterator in token) {
    return [...token].flatMap(flattenTokens)
  }

  if (!isToken(token)) throw new Error(`Parameter 'token' must be a valid token. (value: ${token})`)
  return token
}

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

  #clone() {
    // Clone ourself, for peeking.
    return new this.constructor(this.#data, this.#index)
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
   * Iterate to the next nontrivial token.
   * The nontrivial tokens will be lumped together in a TokenLike class ({@see TokenGroup}).
   * @returns {TokenIterator} this
   */
  nextNonTrivial() {
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
   * Iterate one token (trivial or otherwise).
   * @returns {TokenIterator} this
   */
  next() {
    if (this.done) {
      this.#value = undefined
      return this
    }

    this.#value = this.#data[this.#index++]
    return this
  }

  /**
   * Iterate one token (trivial or otherwise) but only if the pattern matches.
   * @returns {IterableResult} with
   * @property {boolean} match  true if matched, false otherwise
   * NOTE: does NOT return `this`
   */
  nextIf(pattern) {
    if (this.done) {
      this.#value = undefined
      return { done: true, match: false }
    }

    const value = this.#data[this.#index]
    if (this.#matches(pattern, value)) {
      this.#index++
      return { done: false, value, match: true }
    }

    return { done: false, match: false }
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
   * Test whether the next token (or tokens) match given patterns.
   * @param {...TokenPattern} patterns Token-like objects to match.
   * String values are expected to match `Token.value`.
   * @returns {boolean} true if matches, false otherwise
   * @see #next
   */
  nextIs(...patterns) {
    const peek = this.#clone()
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

  /**
   * Test whether the next nontrivial token (or tokens) match given patterns.
   * @param {...TokenPattern} patterns Token-like objects to match.
   * String values are expected to match `Token.value`.
   * @returns {boolean} true if matches, false otherwise
   * @see #nextNonTrivial
   */
  nextNonTrivialIs(...patterns) {
    const peek = this.#clone()
    for (const pattern of patterns) {
      peek.nextNonTrivial()

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


/**
 * @type {[format: string]: {Func<Token, string>} }
 */
const tokenFormatters = {
  '': /** @type {Token} */ token => token.toString(),
  'T': token => token.text,
  'V': token => token.value
}

const needsWhitespace = (token) => {
  switch (token.type) {
    case 'identifier':
    case 'reserved':
    case 'keyword':
    case 'number':
      return true
    default:
      return false
  }
}

function stringifyTokenArray(tokens, format) {
  const formatter = tokenFormatters[format?.toUpperCase() ?? '']

  let prev = {}
  let result = ''
  for (const token of tokens) {
    const needsSpace = needsWhitespace(token)
    if (needsSpace && prev.needsSpace) {
      result += ' '
    }
    result += formatter(token)

    prev = { token, needsSpace }
  }

  return result.trimEnd()
}

const isTokenLike = (value) => value && typeof value === 'object' && 'type' in value && !(Symbol.iterator in value)
const isToken = (value) => isTokenLike(value) && !(value instanceof TokenGroup)

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
   * @returns {SyntaxNode?} undefined/null => null, all else is a SyntaxNode
   */
  static asSyntaxNode(value) {
    switch (value) {
      case null:
      case undefined:
        return null;
      default:
        return SyntaxNode.from(value)
    }
  }

  /**
   *
   * @param {SyntaxNodeOrToken} value
   * @returns {SyntaxNode}
   */
  static from(value) {
    if (typeof value !== 'object') throw new Error(`nodeOrToken cannot be of type '${typeof value}'.`)
    if (value === null) throw new Error(`nodeOrToken cannot be null.`)
    if (value instanceof SyntaxNode) {
      return value
    }

    if (Symbol.iterator in value) {
      // Array of tokens/nodes
      return new SyntaxNode([...value].flatMap(flattenTokens))
    }

    if (!isToken(value)) {
      throw new Error(`nodeOrToken must either be a SyntaxNode or a Token; this is neither. (value: ${value})`)
    }

    return new SyntaxNode(value)
  }

  push(...tokens) {
    console.assert(!this.parent, "parent should not be attached")
    let i = 0
    for (const token of tokens.flatMap(flattenTokens)) {
      console.assert(isToken(token), `Not a token: ${token}`)
      // if (typeof token !== 'object') throw new Error(`tokens[${i}] cannot be of type '${typeof token}'.`)
      // if (token === null) throw new Error(`tokens[${i}] cannot be null.`)
      // if (token instanceof TokenGroup) {
      //   // Add not as the faux token, but as the underlying list of tokens.
      //   this.allTokens.push(...token.tokens)
      //   continue
      // }
      // if (Symbol.iterator in token) throw new Error(`Parameter 'token' cannot be an iterator. (value: ${token})`)
      // if (!isToken(token)) throw new Error(`Parameter 'token' must be a valid token. (value: ${token})`)

      // It's a token
      this.allTokens.push(token)
    }

    this.allTokens.forEach(t => console.assert(isToken(t), `SOmehow not a token: ${t}`))
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
      if (!token.isTrivia) {
        break
      }
      trivia.unshift(token)
    }

    yield* trivia.reverse()
  }

  /** @returns {string} The logical value of the token */
  get value() {
    return this.toString('V')
  }

  *getDocumentComments() {
    // generators and filter/map don't work together?!?!
    for (const token of this.getLeadingTrivia()) {
      if (token.type === 'comment.doc') {
        yield token
      }
    }
  }
}
exports.SyntaxNode = SyntaxNode

/**
 * @typedef {SyntaxNodeOrToken | {[key: string]: SyntaxNodeOrTokenOrParams } } SyntaxNodeOrTokenOrParams
 */

class ContainerSyntaxNode extends SyntaxNode {
  /** @type {SyntaxNode[]} Child nodes. */ children = []

  /**
   * @param {{ [x:string]: SyntaxNodeOrToken? }} params
   */
  constructor(params = {}) {
    super()
    this.add(params)
  }

  /**
   * @param  {...SyntaxNodeOrToken} nodesOrTokens
   */
  push(...nodesOrTokens) {
    this.#assertSumOfParts()

    for (const nodeOrToken of nodesOrTokens.flat()) {
      const node = SyntaxNode.from(nodeOrToken)

      this.children.push(node)
      node.parent = this
      super.push(...node.allTokens)
      this.#assertSumOfParts()
    }

    this.#assertSumOfParts()
  }

  add(params = {}) {
    for (const [key, value] of Object.entries(params)) {
      try {
        if (value === undefined || value === null) {
          this[key] = null
        } else if (value instanceof Array && (value.length === 0 || value[0] instanceof SyntaxNode)) {
          // SyntaxNode[]
          this[key] = value
          this.push(...this[key])
        } else {
          this[key] = SyntaxNode.asSyntaxNode(value)
          this.push(this[key])
        }
      } catch (e) {
        throw e.constructor(`For key '${key}', value ${value}`, e)
      }
    }
  }

  #assertSumOfParts() {
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


class ExpressionSyntaxNode extends ContainerSyntaxNode {
}
exports.ExpressionSyntaxNode = ExpressionSyntaxNode


class StatementSyntaxNode extends ContainerSyntaxNode {
}
exports.StatementSyntaxNode = StatementSyntaxNode



class IdentifierSyntaxNode extends SyntaxNode {
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
        return this.iterator.nextNonTrivial().value
      default:
        if (this.iterator.nextNonTrivialIs(pattern)) {
          return this.readNextToken()
        }
    }
  }

  endOfStreamError() {
    return new Error("Expected token but found EOF")
  }

  /**
   * Reads a single next token, throwing an exception if not found,
   * and matching an optional pattern.
   * @param {TokenPattern} pattern=undefined An optional pattern.
   * @returns {Token}
   */
  readNextToken(pattern = undefined) {
    // Regardless of pattern match, we want to read the next token.
    const token = this.tryReadNextToken()
    if (!token) {
      console.assert(this.done)
      throw this.endOfStreamError()
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

    if (this.iterator.nextNonTrivialIs(...patterns)) {
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
    if (this.iterator.nextNonTrivialIs(...patterns)) {
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
