// @ts-check
const moo = require('moo');
const { Position, TextSpan } = require('./position');
const { Token } = require('./token');

/**
 * @typedef {{ state: string }} ILexer
 * @extends moo.Lexer
 * @property {string} state
 *
 * @typedef {ILexer & moo.Lexer} LexerImpl
 */

/**
 * Base tokenizer class.
 */
class Tokenizer {
  /** @type {moo.Lexer} */ lexer

  /**
   * The lexer data.
   * @param {{states: { [x: string]: moo.Rules }}} states
   * @param {string?} start
   *
   */
  constructor(states, start = undefined) {
    this.lexer = moo.states(states, start)
  }

  /** @internal @type {string?} The current lexer state. */
  get state() {
    // @ts-ignore `state` isn't exposed by the type data
    return this.lexer.state
  }

  /** @internal @type {Record<string, any>?} The current lexer error state. */
  get error() {
    // @ts-ignore `error` isn't exposed by the type data
    return this.lexer.error
  }

  /**
   * @protected Calculates `isTrivia` for the token.
   * @param {Token} token
   * @return {boolean}
   */
  calculateIsTrivia(token) {
    if (typeof token.type !== 'string') {
      return false
    }

    return token.type === 'whitespace'
      || token.type === 'newline'
      || token.type === 'comment'
      || token.type.startsWith('comment.')
  }

  /**
   *
   * @param {moo.Token} mooToken
   * @param {string?} filename
   * @returns {TextSpan}
   */
  #calculateTextSpan(mooToken, filename) {
    const start = new Position(mooToken.line, mooToken.col, filename)
    const end = mooToken.lineBreaks
      ? new Position(
        mooToken.line + mooToken.lineBreaks,
        (1 + mooToken.text.match(/.*$/)[0].length),
        filename
      )
      : new Position(mooToken.line, mooToken.col + mooToken.text.length, filename)

    return new TextSpan(start, end)
  }

  /**
   * Decorates the moo token so it becomes our token.
   * @param {moo.Token} mooToken
   * @return {Token}
   */
  #decorate(mooToken, { filename }) {
    const token = new Token(mooToken)
    token.isTrivia = this.calculateIsTrivia(token)
    token.textSpan = this.#calculateTextSpan(mooToken, filename)
    return token
  }

  /**
   *
   * @param {string} key
   * @param {string|string[]|{type: string, match: string[]}} value
   * @returns {{type: string, match: string[]}}
   */
  static #normalizeTransform(key, value) {
    if (!key) throw "key cannot be falsy"
    if (!value) throw "value cannot be falsy"

    switch (typeof value) {
      case 'string':
        return {
          type: key,
          match: [value]
        }
      case 'object':
        if (Array.isArray(value)) {
          return {
            type: key,
            match: value
          }
        } else if ('match' in value) {
          return { type: key, ...value }
        } else {
          // Unknown
          throw new Error(`Cannot process transform value: ${value}\nFor key: ${key}`)
        }
      default:
        throw new Error(`value cannot be of type ${typeof value}\nFor key: ${key}`)
    }
  }

  /**
   *
   * @param {...{ [x: string]: object}} maps
   * @returns {(k: string) => string}}
   * PL/SQL is, of course, case insensitive.
   * moo isn't: https://github.com/no-context/moo/issues/117
   * So we get to make its keyword handling CI.
   */
  static kwCaseInsensitiveTransform(...maps) {

    // Use a JavaScript Map to map keywords to their corresponding token type
    var reverseMap = new Map()

    for (const map of maps) {
      for (const [key, value] of Object.entries(map)) {
        const transform = Tokenizer.#normalizeTransform(key, value)
        transform.match.forEach(function (keyword) {
          if (typeof keyword !== 'string') {
            throw new Error(`keyword '${keyword}' must be string (in keyword '${transform.type}'), is ${typeof keyword}`)
          }
          reverseMap.set(keyword.toUpperCase(), transform.type)
        })
      }
    }
    return function (k) {
      return reverseMap.get(k.toUpperCase())
    }
  }

  /**
   * @param {string} input  The input text
   * @param {object} params
   * @param {string} params.filename
   * @param {number?} params.line
   * @param {number?} params.col
   * @returns {Generator<Token>}
   * @generator
   * @yields {Token}
   */
  *parse(input, { filename, line, col }) {
    this.lexer.reset(input, line && col ? { line, col, state: undefined } : null)
    for (const token of this.lexer) {
      yield this.#decorate(token, { filename })
    }
  }
}

exports.Tokenizer = Tokenizer
