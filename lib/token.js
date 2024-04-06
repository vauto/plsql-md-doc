// @ts-check
const { mustBeNonEmptyArray, mustBeObject, mustBePositiveInteger, ArgumentValueError, mustBeInstanceOf } = require("./guards")
const { Position, TextSpan } = require("./position")
/**
 * @typedef {import("./position").HasPosition} HasPosition
 * @typedef {import("./token-interfaces").TokenLike} TokenLike
 * @typedef {import("./token-interfaces").TokenPattern} TokenPattern
 * @typedef {import("./token-interfaces").TriviaFlag} TriviaFlag
 */

/**
 *
 * @param {TokenPattern} pattern
 * @returns {string}
 */
const patternToString = (pattern) => {
  if (Array.isArray(pattern)) {
    return pattern.map(patternToString).join('\n -- OR -- ')
  }

  return JSON.stringify(pattern)
}

const DONE = Object.freeze({ done: true, value: undefined })

/**
 * @inheritdoc moo.Token
 * @extends TokenLike
 */
class Token {

  /**
   * Returns whether the given pattern and token(like) match.
   * @param {TokenPattern} pattern
   * @param {TokenLike?} token The token-or-null to check.
   * @returns {boolean}
   */
  static matches(pattern, token) {
    switch (typeof pattern) {
      case 'string':
        if (!token || pattern !== token.value) {
          return false
        }
        break
      case 'object':
        if (pattern instanceof Array) {
          return pattern.some(p => Token.matches(p, token))
        }

        // End-of-file can only match the EOF pattern
        if (!token) {
          return pattern.done
        }

        for (const k in pattern) {
          if (pattern[k] !== token[k]) {
            return false
          }
        }
        break
      default:
        throw new TokenSyntaxError(token, `Unexpected pattern type: ${typeof pattern}: ${pattern}`)
    }

    // Everything matched.
    return true
  }

  /**
   * Verifies the given pattern and token match.
   * @param {TokenPattern} pattern The pattern
   * @param {TokenLike?} token  The token
   */
  static mustMatch(pattern, token) {
    if (Token.matches(pattern, token)) {
      return
    }

    // remove syntactic sugar for clarity
    if (typeof pattern === 'string') {
      pattern = { value: pattern }
    }

    const tokenText = token ? JSON.stringify({ type: token.type, value: token.value }) : '<EOF>'
    throw new TokenSyntaxError(token, `\nExpected: ${patternToString(pattern)}\n but got: ${tokenText}`)
  }

  /** @type {string} */ text
  /** @type {string} */ value
  /** @type {string?} */ type
  /** @type {TriviaFlag} */ isTrivia
  /** @type {TextSpan?} */ textSpan

  /**
   * @param {moo.Token} mooToken
   */
  constructor(mooToken) {
    Object.assign(this, mooToken)

    // mooToken has a member-toString.  Don't use it, use ours.
    delete this.toString
  }

  /**
   * @param {TokenFormat?} [format=null]
   * @returns {string}
   */
  toString(format = null) {
    switch (format) {
      case 'T':
        return this.text
      case 'V':
        return this.value
      default:
        return this.value
    }
  }

  get start() { return this.textSpan?.start }
  get end() { return this.textSpan?.end }
}
exports.Token = Token

/**
 * Represents a syntax error with `Token`.
 */
class TokenSyntaxError extends Error {
  /** @type {Position?} */ position

  /**
   *
   * @param {HasPosition?} token The offending token/node
   * @param {string} message
   * @param {Error?} innerError
   */
  constructor(token, message, innerError = undefined) {
    super((token?.start ? `${token?.start} ${message}` : message), innerError)
    this.position = token?.start
  }
}
exports.TokenSyntaxError = TokenSyntaxError

/**
 * @extends TokenLike
 */
class TokenGroup {
  /** @type {Token[]} The full set of tokens, trivial and nontrivial. */ tokens

  /** @type {string?} The name of the group, as passed to compile. */ type
  /** @type {string} */ text
  /** @type {string} */ value
  /** @type {number} The number of bytes from the start of the buffer where the match starts. */ offset
  /** @type {TriviaFlag?} */ isTrivia
  /** @type {TextSpan?} */ textSpan

  /**
   * @param {Token[]} tokens
   */
  constructor(...tokens) {
    mustBeNonEmptyArray(tokens, 'tokens')
    tokens.forEach((t, i) => mustBeInstanceOf(t, Token, `tokens[${i}]`))
    this.tokens = tokens

    Object.assign(this, this.keyToken)
  }

  /** @type {Token} The key token for this group. */
  get keyToken() { return this.tokens.at(-1) }

  [Symbol.iterator]() { return new SimpleTokenIterator(this.tokens) }

  toString() {
    return this.tokens.join('')
  }

  get start() { return this.textSpan?.start }
  get end() { return this.textSpan?.end }
}
exports.TokenGroup = TokenGroup

/**
 * A simple token iterator
 */
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

  /**
   * @returns {IteratorResult<Token>}
   */
  next() {
    return this.done ? DONE : { value: this.tokens[this.i++] }
  }
}

/**
 * @interface TokenGroup
 * @implements {TokenLike}
 */

/**
 * @param {TokenLike | (TokenLike | null | undefined)[]} tokenLike
 * @returns {Generator<Token>}
 * @yields {Token}
 */
const flattenTokens = function* (tokenLike) {
  mustBeObject(tokenLike, 'tokenLike')

  // TokenGroup
  if (tokenLike instanceof TokenGroup) {
    // Add not as the faux token, but as the underlying list of tokens.
    // They should all be tokens.
    console.assert(tokenLike.tokens.every(t => t instanceof Token), `TokenGroup '${tokenLike}' containing a not-token`, tokenLike)
    yield* tokenLike.tokens
    return
  }

  // Iterable<TokenLike?>
  if (Symbol.iterator in tokenLike) {
    for (const t of tokenLike) {
      if (t !== undefined && t !== null) {
        yield* flattenTokens(t)
      }
    }
    return
  }

  // A true Token
  mustBeInstanceOf(tokenLike, Token, 'tokenLike')
  yield tokenLike
}
exports.flattenTokens = flattenTokens

/**
 * Token iterator taking trivia into account
 * @implements {Iterator<Token>}
 */
class TokenIterator {

  /** @type {Token[]} */ #data
  /** @type {number} */ #index

  /** @type {Token | TokenGroup?} */ #value

  /**
   *
   * @param {Iterable<Token>} data
   * @param {number} start
   */
  constructor(data, start = 0) {
    mustBeObject(data, 'data')
    this.#data = data instanceof Array ? data : [...data]
    this.#index = start
  }

  #clone() {
    // Clone ourself, for peeking.
    return new TokenIterator(this.#data, this.#index)
  }

  [Symbol.iterator]() { return this }

  #done = false
  get done() {
    return this.#done
  }

  /** @type {TokenLike?} The most recently emitted token or token group. */
  get lastValue() {
    return this.#value
  }

  #updateDone() {
    if (this.#index >= this.#data.length) {
      this.#done = true
      this.#value = undefined
    }
    return this.#done
  }

  // ---------------

  /**
   * Iterate one token (trivial or otherwise).
   * @return {IteratorResult<Token>}
   */
  next() {
    if (this.#updateDone()) {
      return DONE
    }

    this.#value = this.#data[this.#index++]
    return { done: false, value: this.#value }
  }

  /**
   * Iterate to the next structured token.
   * The non-structural tokens will be lumped together with each found structured token in a ({@see TokenGroup}).
   * @return {IteratorResult<TokenGroup>}
   */
  nextStructured() {
    if (this.#updateDone()) {
      return DONE
    }

    const start = this.#index,
      length = this.#data.length
    // Scan until we find a nontrivial node or the end of the buffer.
    for (; this.#index < length; this.#index++) {
      if (this.#data[this.#index].isTrivia !== true) {
        break
      }
    }

    const tokens = this.#index >= length
      // All the remaining is trivia.
      ? this.#data.slice(start)
      : this.#data.slice(start, ++this.#index)

    const value = this.#value = new TokenGroup(...tokens)
    return { done: false, value }
  }

  /**
   * Iterate to the next nontrivial token.
   * The nontrivial tokens will be lumped together with each found nontrivial token in a ({@see TokenGroup}).
   * @return {IteratorResult<TokenGroup>}
   */
  nextNonTrivial() {
    if (this.#updateDone()) {
      return DONE
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

    const value = this.#value = new TokenGroup(...tokens)
    return { done: false, value }
  }

  // ---------------

  /**
   * Test whether the next token (or tokens) match given patterns.
   * @param {...TokenPattern} patterns Token-like objects to match.
   * String values are expected to match `Token.value`.
   * @returns {boolean} true if matches, false otherwise
   * @see TokenIterator#next
   */
  nextIs(...patterns) {
    const peek = this.#clone()
    for (const pattern of patterns) {
      if (!Token.matches(pattern, peek.next().value)) {
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
   * @see TokenIterator#nextNonTrivial
   */
  nextNonTrivialIs(...patterns) {
    const peek = this.#clone()
    for (const pattern of patterns) {
      if (!Token.matches(pattern, peek.nextNonTrivial().value)) {
        return false
      }
    }

    // Everything matched
    return true
  }

  // ---------------

  /**
   * Creates a copy of the iterator for lookahead purposes.
   * @returns {TokenIterator}
   */
  peek() {
    return this.#clone()
  }

  /**
   * Skip over the given number of tokens.
   * @param {number} count
   * @returns {void}
   */
  skip(count = 1) {
    mustBePositiveInteger(count, 'count')
    if (this.done) {
      // nothing to skip.
      return
    }

    // So the way "next" works is to grab the value before adding.
    // To make this not a pain I am making it "skip N-1 then next()" for now.
    if (count > 1) {
      this.#index += count - 1
    }
    this.next()
  }
}
exports.TokenIterator = TokenIterator

/**
 * @typedef {null | '' | 'T' | 'V'} TokenFormat
 */

/**
 *
 * @param {TokenLike?} prevToken
 * @param {TokenLike} nextToken
 * @returns
 */
const needsWhitespace = (prevToken, nextToken) => {
  if (!prevToken) {
    // at start of tokens
    return false
  }

  switch (prevToken.type) {
    case 'identifier':
    case 'reserved':
    case 'keyword':
    case 'number':
    case 'string':
    case 'content':
      switch (nextToken.type) {
        case 'identifier':
        case 'reserved':
        case 'keyword':
        case 'number':
        case 'string':
        case 'content':
          return true
        case 'operator':
          switch (nextToken.value) {
            case '+':
            case '-':
              return true;
            default:
              return false
          }
        default:
          return false
      }
    case 'operator':
      switch (prevToken.value) {
        case '+':
        case '-':
          switch (nextToken.type) {
            case 'identifier':
            case 'reserved':
            case 'keyword':
            case 'string':
            case 'content':
              return true;
            default:
              return false
          }

        case ',':
        case ')':
          switch (nextToken.type) {
            case 'identifier':
            case 'reserved':
            case 'keyword':
            case 'number':
            case 'string':
            case 'content':
              return true;
            case 'operator':
              switch (nextToken.value) {
                case '+':
                case '-':
                  return true
                default:
                  return false
              }
            default:
              return false
          }
      }
    default:
      return false
  }
}
exports.needsWhitespace = needsWhitespace

/**
 * Joins the tokens together sensibly.
 * @param {Token[]} tokens
 * @param {TokenFormat?} format
 * @returns {string}
 */
function stringifyTokenArray(tokens, format = undefined) {

  let prevToken
  let result = ''

  for (const token of tokens) {
    if (needsWhitespace(prevToken, token)) {
      result += ' '
    }

    result += token.toString(format)
    prevToken = token
  }

  return result.trimEnd()
}
exports.stringifyTokenArray = stringifyTokenArray

/**
 * @param {any} value
 * @returns {value is TokenLike} `true` if tokenlike, `false` otherwise
 */
const isTokenLike = (value) => value && typeof value === 'object' && 'type' in value && 'value' in value
exports.isTokenLike = isTokenLike

/**
 * @param {any} value
 * @param {string} paramName
 * @returns {asserts value is TokenLike}
 */
const mustBeTokenLike = (value, paramName = 'value') => {
  if (!isTokenLike(value)) {
    throw new ArgumentValueError(paramName, `Value must be a token or token-like object. (value: ${value})`)
  }
}
exports.mustBeTokenLike = mustBeTokenLike
