const moo = require('moo')

/**
 * @typedef {moo.Token} Token
 * @exports Token
 */

class Tokenizer {
  /**
   * The lexer data.
   * @param {states: { [x: string]: Rules }, start?: string} lexerData
   *
   */
  constructor(lexerData) {
    this.lexer = moo.states(lexerData)
    this.groups = this.lexer.groups.reduce((ret, g) => { ret[g.defaultType] = g ; return ret}, {})
  }

  /**
   * @protected Calculates `isTrivia` for the token.
   * @param {Token} token
   */
  calculateIsTrivia (token) {
    return token.type === 'whitespace'
        || token.type === 'newline'
        || token.type === 'comment'
        || token.type.startsWith('comment.')
  }

  /**
   * @protected Decorates the token.
   * @param {Token} token
   */
  decorate(token) {
    token.isTrivia = this.calculateIsTrivia(token)
  }

  /**
   *
   * @param {{ [x;string]: object}} map
   * @returns {(k: string) => string}}
   * PL/SQL is, of course, case insensitive.
   * moo isn't: https://github.com/no-context/moo/issues/117
   * So we get to make its keyword handling CI.
   */
  static kwCaseInsensitiveTransform (map) {

    // Use a JavaScript Map to map keywords to their corresponding token type
    var reverseMap = new Map()

    var types = Object.getOwnPropertyNames(map)
    for (var i = 0; i < types.length; i++) {
      var tokenType = types[i]
      var item = map[tokenType]
      var keywordList = Array.isArray(item) ? item : [item]
      keywordList.forEach(function(keyword) {
        if (typeof keyword !== 'string') {
          throw new Error(`keyword '${keyword}' must be string (in keyword '${tokenType}'), is ${typeof keyword}`)
        }
        reverseMap.set(keyword.toUpperCase(), tokenType)
      })
    }
    return function(k) {
      return reverseMap.get(k.toUpperCase())
    }
  }

  /**
   *
   * @param {string} input%
   * @generator
   * @yields {Token}
   */
  *parse (input) {
    this.lexer.reset(input)
    for (const token of this.lexer) {
      this.decorate(token)
      yield token
    }
  }
}

exports.Tokenizer = Tokenizer
