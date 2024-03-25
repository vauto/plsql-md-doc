// @ts-check
const moo = require('moo');
const { Position, TextSpan } = require('./position');

/**
 * @typedef {moo.Token} Token
 * @exports Token
 */

class Tokenizer {
  /** @type {moo.Lexer} */ lexer

  /**
   * The lexer data.
   * @param {{states: { [x: string]: moo.Rules }}} lexerData
   *
   */
  constructor(lexerData) {
    this.lexer = moo.states(lexerData)
  }

  /**
   * @protected Calculates `isTrivia` for the token.
   * @param {Token} token
   * @return {boolean}
   */
  calculateIsTrivia(token) {
    return token.type === 'whitespace'
      || token.type === 'newline'
      || token.type === 'comment'
      || token.type.startsWith('comment.')
  }

  /**
   * @protected Decorates the token.
   * @param {Token} token
   */
  decorate(token, { filename }) {
    token.isTrivia = this.calculateIsTrivia(token)
    token.start = new Position(token.line, token.col, filename)

    token.end = token.lineBreaks
      ? new Position(
        token.line + token.lineBreaks,
        (1 + token.text.match(/.*$/)[0].length),
        filename
      )
      : new Position(token.line, token.col + token.text.length, filename)

    token.textSpan = new TextSpan(token.start, token.end, filename)
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
      this.decorate(token, { filename })
      yield token
    }
  }
}

exports.Tokenizer = Tokenizer
