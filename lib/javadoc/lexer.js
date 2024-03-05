const { Tokenizer } = require('../lexer')

class JavadocTokenizer extends Tokenizer {
  static #lexerData = {
    default: {
      'tag': {
        match: /@[A-Za-z]\w+/,
        value: s => s.slice(1)
      },

      lbrace: {
        match: '{',
        push: 'structured'
      },

      rbrace: '}',

      newline: { match: /\r?\n|[\r\n]/, lineBreaks: true, extraData: { isTrivia: true } },

      whitespace: {
        match: /[ \t]+/,
        extraData: { isTrivia: true }
      },

      star: {
        match: '*',
        extraData: { isTrivia: true }
      },

      content: /\S+/
    },
    structured: {
      'rbrace': { match: '}', pop: 1 },
      'tag': {
        match: /@[A-Za-z]\w+/,
        value: s => s.slice(1)
      },
      'identifier': /[A-Za-z]\w+/,
      'lt': '<',
      'gt': '>',
      'lbracket': '[',
      'rbracket': ']',
      'lparen': '(',
      'rparen': ')',
      whitespace: {
        match: /[ \t]+/,
        extraData: { isTrivia: true }
      }
    }
  }

  constructor() {
    super(JavadocTokenizer.#lexerData)
  }
}

exports.JavadocTokenizer = JavadocTokenizer
