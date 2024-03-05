const { Tokenizer } = require('../lexer')

class JavadocTokenizer extends Tokenizer {
  static #lexerData = {
    default: {
      'tag': {
        match: /@[A-Za-z]\w+/,
        value: s => s.slice(1)
      },

      lbrace: '{',
      rbrace: '}',

      newline: { match: /\r?\n|[\r\n]/, lineBreaks: true, extraData: { isTrivia: true } },

      whitespace: {
        match: /[ \t]+/,
        extraData: { isTrivia: true }
      },
      star: '*',

      content: /[\S@{*]+/
    }
  }

  constructor() {
    super(JavadocTokenizer.#lexerData)
  }
}

exports.JavadocTokenizer = JavadocTokenizer
