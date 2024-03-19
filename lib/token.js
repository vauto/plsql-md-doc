const { mustBeNonEmptyArray, mustBeObject, mustBePositiveInteger, ArgumentValueError } = require("./guards")
const { HasStartPosition, Position } = require("./position")
/**
 * @typedef {import("moo").Token} Token
 */

class TokenSyntaxError extends Error {
  /** @type {Position?} */ position

  /**
   *
   * @param {HasStartPosition?} token The offending token/node
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
 * @implements {Token}
 * @extends Token
 */
class TokenGroup {

  constructor(tokens) {
    mustBeNonEmptyArray(tokens, 'tokens')
    this.tokens = tokens
    Object.assign(this, tokens.at(-1))
  }

  /** @type {Token[]} The full set of tokens, trivial and nontrivial. */ tokens

  [Symbol.iterator]() { return new SimpleTokenIterator(this.tokens) }
}
exports.TokenGroup = TokenGroup

/**
 * @typedef {Token | TokenGroup | { type: string, value: string }} TokenLike
 * @typedef {TokenLike | string | TokenPattern[]} TokenPattern For matching tokens.  Arrays indicate `OR` matches.
 */

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

  next() {
    return this.done ? { done: true } : { value: this.tokens[this.i++] }
  }
}

/**
 * @interface TokenGroup
 */

/**
 * @param {TokenLike | TokenLike?[]} tokenLike
 * @returns {Generator<Token>}
 * @yields {Token}
 */
const flattenTokens = function* (tokenLike) {
  mustBeObject(tokenLike, 'tokenLike')

  // TokenGroup
  if (tokenLike instanceof TokenGroup) {
    // Add not as the faux token, but as the underlying list of tokens.
    // They should all be tokens.
    console.assert(tokenLike.tokens.every(isToken), `TokenGroup '${tokenLike}' containing a not-token`, tokenLike)
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
  mustBeToken(tokenLike, 'tokenLike')
  yield tokenLike
}
exports.flattenTokens = flattenTokens

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
    mustBeObject(data, 'data')
    this.#data = data instanceof Array ? data : [...data]
    this.#index = start
  }

  #clone() {
    // Clone ourself, for peeking.
    return new this.constructor(this.#data, this.#index)
  }

  [Symbol.iterator]() { return this }

  #done = false
  get done() {
    return this.#done
  }

  /**
   * @type {TokenGroup?} The current token group.
   * Token data is of the only possibly nontrivial token.
   */
  get value() {
    return this.#value
  }

  #updateDone() {
    if (this.#index >= this.#data.length) {
      this.#done = true
      this.#value = undefined
    }
    return this.#done
  }

  /**
   * Iterate to the next nontrivial token.
   * The nontrivial tokens will be lumped together in a TokenLike class ({@see TokenGroup}).
   * @returns {TokenIterator} this
   */
  nextNonTrivial() {
    if (this.#updateDone()) {
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
    if (this.#updateDone()) {
      return this
    }

    this.#value = this.#data[this.#index++]
    return { done: false, value: this.#value } // this
  }

  // /**
  //  * Iterate one token (trivial or otherwise) but only if the pattern matches.
  //  * @returns {IterableResult} with
  //  * @property {boolean} match  true if matched, false otherwise
  //  * NOTE: does NOT return `this`
  //  */
  // nextIf(pattern) {
  //   if (this.done) {
  //     this.#value = undefined
  //     return { done: true, match: false }
  //   }

  //   const value = this.#data[this.#index]
  //   if (this.#matches(pattern, value)) {
  //     this.#index++
  //     return { done: false, value, match: true }
  //   }

  //   return { done: false, match: false }
  // }

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
        throw new TokenSyntaxError(token, `Unexpected pattern type: ${typeof pattern}: ${pattern}`)
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

  /**
   * Creates a copy of the iterator for lookahead purposes.
   * @returns {TokenIterator}
   */
  peek() {
    return this.#clone()
  }

  /**
   * Skip over the given number of tokens.
   * @param {integer} count
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
 * @typedef {(token: Token) => string} TokenFormatDelegate
 */
class TokenFormatters {

  /**
   * @type {[format: TokenFormat]: {TokenFormatDelegate} }
   */
  static formatters = {
    '': /** @type {Token} */ token => token.toString(),
    'T': token => token.text,
    'V': token => token.value
  }

  /**
   * @param {TokenFormat} format
   * @param {TokenFormat} defaultFormat
   * @returns {TokenFormatDelegate}
   */
  static resolve(...formats) {
    for (const format of formats) {
      if (typeof format !== 'string') continue

      const result = TokenFormatters.formatters[format.toUpperCase()]
      if (result) {
        return result
      }
    }

    console.assert('' in TokenFormatters.formatters)
    return TokenFormatters.formatters['']
  }
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

/**
 * Joins the tokens together sensibly.
 * @param {Token[]} tokens
 * @param {string?} format
 * @returns {string}
 */
function stringifyTokenArray(tokens, format = undefined) {
  const formatter = TokenFormatters.resolve(format)

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
exports.stringifyTokenArray = stringifyTokenArray

/**
 * @param {TokenLike} value
 * @returns {boolean} `true` if tokenlike, `false` otherwise
 */
const isTokenLike = (value) => value && typeof value === 'object' && 'type' in value && 'value' in value
exports.isTokenLike = isTokenLike

/**
 * @param {Token} value
 * @returns {boolean} `true` if a token, `false` otherwise
 */
const isToken = (value) => isTokenLike(value) && !(value instanceof TokenGroup) && !(Symbol.iterator in value)
exports.isToken = isToken


/**
 * @param {any} value
 * @param {string} paramName
 * @returns {Token}
 */
const mustBeToken = (value, paramName = 'value') => {
  if (isToken(value)) {
    return value
  }
  throw new ArgumentValueError(paramName, `Value must be a valid token. (value: ${value})`)
}
exports.mustBeToken = mustBeToken
