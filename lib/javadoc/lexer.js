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

      newline: { match: /\r?\n|[\r\n]/, lineBreaks: true },

      whitespace: /[ \t]+/,
      star: '*',

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
      whitespace: /[ \t]+/
    }
  }

  constructor() {
    super(JavadocTokenizer.#lexerData)
  }

  /** @override */
  calculateIsTrivia(token) {
    switch (token.type) {
      case 'star':
      case 'whitespace':
        return true
      case 'newline':
        return 'structured'
      default:
        return super.calculateIsTrivia(token)
    }
  }
}

exports.JavadocTokenizer = JavadocTokenizer
