// @ts-check
const { mustBeNonEmptyArray, mustBeObject, mustBePositiveInteger, ArgumentValueError, mustBeInstanceOf } = require("./guards")
const { Position, TextSpan } = require("./position")
/**
 * @typedef {import("./position").HasPosition} HasPosition
 * @typedef {import("./token-interfaces").TokenFormat} TokenFormat
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
 * @implements {TokenLike}
 */
class Token {

  /**
   * Returns whether the given pattern and token(like) match.
   * @param {TokenPattern} pattern
   * @param {TokenLike?} token The token-or-null to check.
   * @returns {boolean}
   */
  static matches(pattern, token) {
    const o = this.#old_matches(pattern, token)
    const n = this.#new_matches(pattern, token)
    console.assert(o === n, `${token?.textSpan ?? '<EOF>'} old != new`, { old: o, new: n }, pattern, token ? { type: token.type, value: token.value } : null)
    return n
  }

  /**
   * Returns whether the given pattern and token(like) match.
   * @param {TokenPattern} pattern
   * @param {TokenLike?} token The token-or-null to check.
   * @returns {boolean}
   */
  static #old_matches(pattern, token) {
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
          return !!pattern.done
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
   * Returns whether the given pattern and token(like) match.
   * @param {TokenPattern} pattern
   * @param {TokenLike?} token The token-or-null to check.
   * @returns {boolean}
   */
  static #new_matches(pattern, token) {
    switch (typeof pattern) {
      case 'string':
        return pattern === token?.value

      case 'object':
        mustBeObject(pattern, 'pattern')
        if (pattern instanceof Array) {
          return pattern.some(p => Token.matches(p, token))
        }

        // End-of-file can only match the EOF pattern.
        let matches = (!!pattern.done === !token)
        if (token) {
          matches &&= !('type' in pattern) || pattern.type === token.type
          matches &&= !('value' in pattern) || pattern.value === token.value
        }

        // Now the mind-screw: inverse.
        // It should be XOR'd with the result, but since the options are undefined/true, NOT false/true, we have to do a ternary.
        return pattern.inverse ? !matches : matches

      default:
        throw new TokenSyntaxError(token, `Unexpected pattern type: ${typeof pattern}: ${pattern}`)
    }
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

  // ---------------

  /** @type {string} */ text
  /** @type {string} */ value
  /** @type {string} */ type
  /** @type {TriviaFlag} */ isTrivia
  /** @type {TextSpan?} */ textSpan

  /**
   * @param {moo.Token} mooToken
   * @param {TriviaFlag} isTrivia
   * @param {TextSpan} textSpan
   */
  constructor(mooToken, isTrivia, textSpan) {
    mustBeObject(mooToken, 'mooToken')
    this.text = mooToken.text
    this.type = mooToken.type
    this.value = mooToken.value
    this.isTrivia = isTrivia
    this.textSpan = textSpan
  }

  valueOf() {
    return this.value
  }

  toJSON() {
    return { type: this.type, text: this.text, value: this.value }
  }

  /**
   * Gets the token as a string.
   * @param {TokenFormat} format How to format the token.
   */
  toString(format = '') {
    switch (format) {
      case 'T':
        return this.text
      case 'V':
        return this.value
      default:
        return this.value
    }
  }

  /**
   * Gets the full token text as a string.
   * @param {TokenFormat} format How to format the token.
   */
  toFullString(format = '') {
    return this.toString(format)
  }

  get start() { return this.textSpan?.start }
  get end() { return this.textSpan?.end }
}
exports.Token = Token

/**
 * Represents a syntax error with `Token`.
 * @implements {HasPosition}
 */
class TokenSyntaxError extends Error {
  /** @type {TextSpan?} */ textSpan

  /**
   *
   * @param {HasPosition?} token The offending token/node
   * @param {string} message
   * @param {Error?} innerError
   */
  constructor(token, message, innerError = undefined) {
    super((token?.textSpan?.start ? `${token.textSpan.start} ${message}` : message), innerError)
    this.textSpan = token?.textSpan
  }

  get start() { return this.textSpan.start }
  get end() { return this.textSpan.end }
}
exports.TokenSyntaxError = TokenSyntaxError

/**
 * @implements {TokenLike}
 * @implements {Iterable<Token>}
 */
class TokenGroup {
  /** @type {ReadonlyArray<Token>} The full set of tokens, trivial and nontrivial. */ tokens
  /** @type {Token} The key token for this group. */ keyToken
  /** @type {TextSpan} Gets the full textspan of the token group, including trivia. */ fullTextSpan

  /**
   * @param {...Token} tokens
   */
  constructor(...tokens) {
    mustBeNonEmptyArray(tokens, 'tokens')
    tokens.forEach((t, i) => mustBeInstanceOf(t, Token, `tokens[${i}]`))
    this.tokens = tokens

    switch (this.tokens.length) {
      case 1:
        // The easy case.
        this.keyToken = this.tokens[0]
        this.fullTextSpan = this.keyToken.textSpan
        break
      default:
        // Pick the first occurrence of a nontrivial token.
        // Barring that, pick the first token.
        // We are guaranteed it is not null as the array cannot be empty.
        this.keyToken = this.tokens.find(t => !t.isTrivia) ?? this.tokens[0]
        this.fullTextSpan = TextSpan.from(this.tokens[0].textSpan.start, this.tokens.at(-1).textSpan.end)
        break
    }
  }

  [Symbol.iterator]() { return new SimpleTokenIterator(this.tokens) }

  valueOf() {
    return this.value
  }

  /**
   * Gets the token as a string.
   * @param {TokenFormat} format How to format the token.
   */
  toString(format) {
    return this.tokens.map(t => t.toString(format)).join('')
  }

  /**
   * Gets the full token text as a string.
   * @param {TokenFormat} format How to format the token.
   */
  toFullString(format) {
    return this.tokens.map(t => t.toFullString(format)).join('')
  }

  /**
   * Gets the full token group as JSON.
   */
  toJSON() {
    return { type: this.type, text: this.text, value: this.value, tokens: this.tokens.map(t => t.toJSON())}
  }

  get text() { return this.keyToken.text }
  get value() { return this.keyToken.value }
  get isTrivia() { return this.keyToken.isTrivia }
  get type() { return this.keyToken.type }
  get textSpan() { return this.keyToken.textSpan }

  /** Gets the full text of the token group, including trivia. */
  get fullText() { return this.tokens.map(t => t.text).join('') }
  /** Gets the full value of the token group, including trivia. */
  get fullValue() { return this.tokens.map(t => t.value).join('') }

  get start() { return this.textSpan?.start }
  get end() { return this.textSpan?.end }
}
exports.TokenGroup = TokenGroup

/**
 * A simple token iterator
 */
class SimpleTokenIterator {
  /**
   * @param {ReadonlyArray<Token>} tokens
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
  /** @type {(Token | TokenGroup)[]} */ #read = []

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

  /** @type {(Token | TokenGroup)?} The most recently emitted token or token group. */
  get lastValue() {
    return this.#done ? undefined : this.#read.at(-1)
  }

  #updateDone() {
    if (this.#done) {
      return true
    }

    if (this.#index >= this.#data.length) {
      this.#done = true
      return true
    }

    return false
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

    const value = this.#data[this.#index++]
    this.#read.push(value)
    return { done: false, value }
  }

  /**
   * Iterate to the next structured token.
   * The non-structural tokens will be lumped together with each found structured token in a ({@link TokenGroup}).
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

    const value = new TokenGroup(...tokens)
    this.#read.push(value)
    return { done: false, value }
  }

  /**
   * Iterate to the next nontrivial token.
   * The nontrivial tokens will be lumped together with each found nontrivial token in a ({@link TokenGroup}).
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

    const value = new TokenGroup(...tokens)
    this.#read.push(value)
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
    if (this.#done) {
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

  /**
   * Rewind the amount we emitted previously.
   *
   * Note there are no corresponding previousNonTrivial / previousStructured, because this undoes whichever one was called last.
   * @return {IteratorResult<Token | TokenGroup>}
   */
  previous() {
    if (this.#done) {
      this.#done = false
      return { done: false, value: this.lastValue }
    }

    const value = this.#read.pop()
    if (value instanceof Token) {
      this.#index--
    } else {
      this.#index -= value.tokens.length
    }
    return { done: false, value }
  }
}
exports.TokenIterator = TokenIterator

/**
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
