/**
 * @typedef {import("moo").Token} Token
 * @typedef {SyntaxNode | Token} SyntaxNodeOrToken
 *
 * @typedef {Token | TokenGroup | { type: string, value: string }} TokenLike
 * @typedef {TokenLike | string | TokenPattern[]} TokenPattern For matching tokens.  Arrays indicate `OR` matches.
 * @typedef {SyntaxNode | TokenLike | SyntaxNodeOrTokenLike[] } SyntaxNodeOrTokenLike
 * @typedef { [key: string]: SyntaxNodeOrTokenLike? } SyntaxNodeOrTokenDictionary
 * @typedef {SyntaxNodeOrTokenDictionary | SyntaxNodeOrTokenLike} SyntaxNodeOrTokenOrParams
 */

const { Position, TextSpan } = require("./position")

class ArgumentError extends Error {
  constructor(paramName, message, innerError) {
    super(`${message}.  For parameter: ${paramName}`, innerError)
    this.paramName = paramName
  }
}

class ArgumentNullError extends ArgumentError {
  constructor(paramName, innerError) {
    super(paramName, 'Value cannot be null.', innerError)
  }
}
class ArgumentEmptyError extends ArgumentError {
  constructor(paramName, innerError) {
    super(paramName, 'Value cannot be empty.', innerError)
  }
}

class InvalidArgumentTypeOfError extends ArgumentError {
  constructor(paramName, value, innerError) {
    super(paramName, `Value cannot be of type ${typeof value}.`, innerError)
    this.value = value
  }
}


class NodeSyntaxError extends Error {

  /**
   *
   * @param {{TokenLike | SyntaxNode}? } token The offending token
   * @param {string} message
   * @param {Error?} innerError
   */
  constructor(token, message, innerError = undefined) {
    super((token?.start ? `${token?.start} ${message}` : message), innerError)
    this.token = token
  }

  get position() {
    return token?.start
  }
}

/**
 * @implements {Token}
 * @extends Token
 */
class TokenGroup {

  constructor(tokens) {
    if (!tokens) throw new ArgumentNullError("tokens")
    if (!tokens.length) throw new ArgumentEmptyError("tokens")
    this.tokens = tokens
    Object.assign(this, tokens.at(-1))
  }

  /** @type {Token[]} The full set of tokens, trivial and nontrivial. */ tokens

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
  if (typeof token !== 'object') throw new InvalidArgumentTypeOfError('token', token)
  if (token === null) throw new ArgumentNullError('token')
  if (token instanceof TokenGroup) {
    // Add not as the faux token, but as the underlying list of tokens.
    return token.tokens
  }

  if (Symbol.iterator in token) {
    return [...token].flatMap(flattenTokens)
  }

  if (!isToken(token)) throw new ArgumentError('token', `Value must be a valid token. (value: ${token})`)
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
    if (typeof data !== 'object') throw new InvalidArgumentTypeOfError('data', data)
    if (data === null) throw new ArgumentNullError('data')
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
    return { done: false, value: this.#value } // this
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
    return { done: false, value: this.#value } // this
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
        throw new NodeSyntaxError(token, `Unexpected pattern type: ${typeof pattern}: ${pattern}`)
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

const needsLeadingWhitespace = (token) => {
  switch (token?.type) {
    case null:
    case undefined:
      return false
    case 'identifier':
    case 'reserved':
    case 'keyword':
    case 'number':
      return true
    case 'content':
      // probably going to have to fine-tune this.
      return true
    default:
      return false
  }
}

const needsTrailingWhitespace = (token) => {
  switch (token?.value) {
    case null:
    case undefined:
      return false
    case ',':
    case ')':
      return true
    default:
      return needsLeadingWhitespace(token)
  }
}

function stringifyTokenArray(tokens, format) {
  const formatter = tokenFormatters[format?.toUpperCase() ?? '']

  let prevToken
  let result = ''

  for (const token of tokens) {
    if (needsLeadingWhitespace(token) && needsTrailingWhitespace(prevToken)) {
      result += ' '
    }

    result += formatter(token)
    prevToken = token
  }

  return result.trimEnd()
}

const isTokenLike = (value) => value && typeof value === 'object' && 'type' in value && 'value' in value
const isToken = (value) => isTokenLike(value) && !(value instanceof TokenGroup) && !(Symbol.iterator in value)

exports.isTokenLike = isTokenLike
exports.isToken = isToken

/**
 * Base syntax node class.
 * @typedef {null | 'FILE' | 'T' | 'V'} SyntaxNodeFormat
 */
class SyntaxNode {
  /** @type {string} */ kind
  /** @type {Token[]} All tokens. */ allTokens = []
  /** @type {SyntaxNode?} */ parent

  /**
   * @param  {...TokenLike} tokens
   */
  constructor(...tokens) {
    if (tokens.length) {
      this.push(...tokens)
    }
    this.kind = this.constructor.name.replace(/SyntaxNode$/, '') || this.firstNontrivialToken?.type || 'trivia'
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
    if (typeof value !== 'object') throw new InvalidArgumentTypeOfError('value', value)
    if (value === null) throw new ArgumentNullError('value')
    if (value instanceof SyntaxNode) {
      return value
    }

    if (Symbol.iterator in value) {
      // Array of tokens/nodes
      return new SyntaxNode([...value].flatMap(flattenTokens))
    }

    if (!isToken(value)) {
      throw new ArgumentError('value', `Value must either be a SyntaxNode or a Token; this is neither. (value: ${value})`)
    }

    return new SyntaxNode(value)
  }

  /**
   *
   * @param  {...TokenLike} tokens
   */
  push(...tokens) {
    console.assert(!this.parent, "parent should not be attached")
    const start = this.allTokens.length

    for (const token of tokens.flatMap(flattenTokens)) {
      console.assert(isToken(token), `Not a token: ${token}`)
      // It's a token
      this.allTokens.push(token)
    }

    this.allTokens.forEach(t => console.assert(isToken(t), `Somehow not a token: ${t}`))
  }

  /**
   * Gets the first nontrivial token.
   */
  get firstNontrivialToken() {
    for (const token of this.allTokens) {
      if (!token.isTrivia) {
        return token
      }
    }
  }

  /** @returns {Token?} */
  get lastToken() {
    return this.allTokens.at(-1)
  }

  /**
   * Gets the last nontrivial token.
   */
  get lastNontrivialToken() {
    for (const token of this.allTokens.reverse()) {
      if (!token.isTrivia) {
        return token
      }
    }
  }

  /**
   * Nontrivial or structured tokens.
   */
  get structuredTokens() {
    return this.allTokens.filter(t => t.isTrivia !== true)
  }

  /**
   * Nontrivial tokens.
   */
  get tokens() {
    return this.allTokens.filter(t => !t.isTrivia)
  }

  /**
   * @override
   * @param {SyntaxNodeFormat} format
   */
  toString(format = null) {
    return stringifyTokenArray(this.tokens, format)
  }

  /**
   * String of all structured tokens.
   * @param {SyntaxNodeFormat} format
   */
  toStructuredString(format = null) {
    return stringifyTokenArray(this.structuredTokens, format)
  }

  /**
   * String of all tokens.
   * @param {SyntaxNodeFormat} format
   */
  toFullString(format = null) {
    return stringifyTokenArray(this.allTokens, format)
  }

  /** @type {integer?} */
  get line() {
    return this.allTokens[0]?.line
  }
  /** @type {integer?} */
  get col() {
    return this.allTokens[0]?.col
  }
  /** @type {Position?} */
  get start() {
    return this.allTokens[0]?.start
  }
  /** @type {Position?} */
  get end() {
    return this.allTokens.at(-1)?.end
  }

  /** @type {TextSpan?} */
  get textSpan() {
    return TextSpan.from(this.start, this.end)
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

class ContainerSyntaxNode extends SyntaxNode {
  /** @type {SyntaxNode[]} Child nodes. */ children = []

  /**
   * @param {...SyntaxNodeOrTokenOrParams} params
   */
  constructor(...params) {
    super()
    this.push(...params)
  }

  /**
   * @param {SyntaxNode} node
   */
  #addChildNode(node) {
    this.#assertSumOfParts()

    console.assert(!node.parent)
    node.parent = this
    this.children.push(node)
    super.push(...node.allTokens)

    this.#assertSumOfParts()
  }

  /**
   * @param {SyntaxNodeOrTokenDictionary} param
   */
  #addNamedParams(param) {
    console.assert(param && typeof param === 'object' && !isTokenLike(param) && !(param instanceof SyntaxNode) && !(Symbol.iterator in param), 'these do not belong here')
    console.assert(Object.keys(param).length, 'empty param?')

    for (const [key, value] of Object.entries(param)) {
      try {
        if (value === undefined || value === null) {
          this[key] = null
        } else if (value instanceof Array && (value.length === 0 || value[0] instanceof SyntaxNode)) {
          // SyntaxNode[]
          this[key] = value
          this.push(...this[key])
        } else {
          this[key] = SyntaxNode.asSyntaxNode(value)
          this.#addChildNode(this[key])
        }
      } catch (e) {
        if (e instanceof NodeSyntaxError) {
          throw e.constructor(`For key '${key}', value ${value}`, e)
        } else {
          throw new NodeSyntaxError(this, `For key '${key}', value ${value}`, e)
        }
      }
    }

  }

  /**
   * @param  {...SyntaxNodeOrTokenOrParams?} params
   */
  push(...params) {
    this.#assertSumOfParts()

    for (const param of params.flat()) {
      if (param === undefined || param === null) {
        continue
      }

      if (param instanceof SyntaxNode) {
        this.#addChildNode(param)
        continue
      }

      if (isTokenLike(param)) {
        this.#addChildNode(SyntaxNode.from(param), param.start.toString())
        continue
      }

      if (Symbol.iterator in param) {
        this.push(...param)
        continue
      }

      this.#addNamedParams(param)
    }

    this.#assertSumOfParts()
  }

  add(params = {}) {
    //console.assert(false, 'call push now', params)
    this.push(params)
  }

  #assertSumOfParts() {
    console.assert(this.allTokens.length === this.children.reduce((sum, node) => sum + node.allTokens.length, 0), 'parent == sum of parts of children')
  }

  toString(format = null) {
    return stringifyTokenArray(this.children.flatMap(c => c.tokens), format)
  }

  toStructuredString(format = null) {
    return stringifyTokenArray(this.children.map(c => c.structuredTokens), format)
  }

  toFullString(format = null) {
    return stringifyTokenArray(this.children.map(c => c.allTokens), format)
  }
}
exports.ContainerSyntaxNode = ContainerSyntaxNode

class ExpressionSyntaxNode extends ContainerSyntaxNode { }
exports.ExpressionSyntaxNode = ExpressionSyntaxNode


class StatementSyntaxNode extends ContainerSyntaxNode { }
exports.StatementSyntaxNode = StatementSyntaxNode


class IdentifierSyntaxNode extends SyntaxNode {

  /** @type {Token[]} The identifier parts. */
  get parts() {
    return this.tokens.filter(t => t.type !== 'operator')
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
        throw new NodeSyntaxError(token, `Unexpected pattern type: ${typeof pattern}: ${pattern}`)
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
      // remove syntactic sugar for clarity
      if (typeof pattern === 'string') {
        pattern = { value: pattern }
      }
      throw new NodeSyntaxError(token, `Expected: ${JSON.stringify(pattern)} but got ${JSON.stringify({ type: token.type, value: token.value })}`)
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
    return this.syntaxError("Expected token but found EOF")
  }

  /**
   * @overload
   * @param {string} description
   * @param {Error?} innerError
   * @returns {NodeSyntaxError}
   * @overload
   * @param {TokenLike} token
   * @param {string} description
   * @param {Error?} innerError
   * @returns {NodeSyntaxError}
   */
  syntaxError() {
    let token, description, innerError
    switch (arguments.length) {
      case 0:
        console.assert(false, 'No description specified')
        break
      case 1:
        [token, description] = [this.iterator.value, arguments[0]]
        break
      case 2:
        [token, description] = arguments
        if (typeof token === 'string') {
          // no token, args are description+error
          [token, description, innerError] = [this.iterator.value, token, description]
        }
        break
      default:
        [token, description, innerError] = arguments
        break
    }

    return new NodeSyntaxError(token, description, innerError)
  }

  /**
   * @overload
   * @returns {NodeSyntaxError}
   * @overload
   * @param {string} description
   * @returns {NodeSyntaxError}
   * @overload
   * @param {TokenLike} token
   * @param {string} description
   * @returns {NodeSyntaxError}
   */
  notImplemented() {
    switch (arguments.length) {
      case 0:
        // ()
        return this.syntaxError('This method is not implemented')
      case 1:
        // (description)
        return this.syntaxError(`${arguments[0]} is not implemented`)
      default:
        // (token, description)
        return this.syntaxError(arguments[0], `${arguments[1]} is not implemented`)
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
   * Read multiple tokens if they match the patterns.
   * @param  {...TokenPattern} patterns
   * @returns {Token[]?}
   */
  readNextTokens(...patterns) {
    return patterns.map(p => this.readNextToken(p))
  }

  /**
   * Read all tokens that match pattern.
   * @param  {TokenPattern} patterns
   * @returns {Generator<Token>}
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

  /**
   * @protected
   * @returns {SyntaxNode?}
   */
  readInternal() { throw new Error('abstract method not implemented') }

  /**
   * @returns {SyntaxNode?}
   */
  read() {
    try {
      return this.readInternal()
    } catch (e) {
      if (e instanceof NodeSyntaxError) {
        // rethrow
        throw e
      }

      throw this.syntaxError(e.message, e)
    }
  }

}
exports.SyntaxNodeReader = SyntaxNodeReader
