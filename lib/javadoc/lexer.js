const { Argument } = require('commander')
const { Tokenizer } = require('../lexer')

const reHtmlName = /[a-zA-Z\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][:a-zA-Z\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-).0-9\u00B7\u0300-\u036F\u203F-\u2040]*/
const reHtmlTagOpen = new RegExp(`</?${reHtmlName.source}`) // NOTE: this isn't "an open HTML tag", this is "HTML open (open or close or standalone tag)"

class JavadocTokenizer extends Tokenizer {
  static #lexerData = {
    default: {
      // Newlines in Javadoc should start with a newline,
      // then eat all available spaces and stars.
      // (We don't have to worry about '*/' here because the parent lexer should eat all that.)
      newline: {
        match: /(?:\r?\n|[\r\n])\s*(?:\*+[^\S\r\n]*)?/, // right after newline can be \s* but nothing else.
        lineBreaks: true
      },

      'star.decoration': [
        {
          match: /^[*]+/
        },
        {
          match: /[*]+$/
        },
      ],

      tag: {
        match: /@[A-Za-z][A-Za-z0-9_\-]*/,
        value: s => s.slice(1).toLowerCase()
      },

      // @see https://www.ietf.org/rfc/rfc3986.txt, then cut down to not be ridiculous.
      url: /\b(?:[a-z][a-z0-9]*):\/\/(?:[^\/?#]*)(?:[^?#]*)(?:\?(?:[^#]*))?(?:#(?:.*))?/,
      number: /[+-]?[0-9]*\.?[0-9]+(?:[Ee][+-]?[0-9]+)?[DFdf]?/,

      // Potential identifier
      'identifier': [
        {
          match: /\b[A-Z]{1,10}-\d{1,10}\b/,  // e.g. ORA-00904, VA-12345
          value: s => s.toUpperCase()
        },
        // PL/SQL identifier matcher
        {
          match: /[a-zA-Z_][a-zA-Z0-9_#$]*/,
          value: s => s.toUpperCase()
        },
      ],

      'string': {
        match: /"[^"]+"/,
        value: s => s.slice(1, -1)
      },

      'brace.open': '{',
      'brace.close': '}',
      'bracket.open': '[',
      'bracket.close': ']',

      'htmlTag.open': {
        match: reHtmlTagOpen,
        push: 'htmlTag',
        value: s => s.slice(1)
      },

      'markdown.codeFence': /`+/,

      // Property/method delimiters
      hash: '#',
      //star: '*',

      operator: [
        // '(', // lparen
        // ')', // rparen
        // '+', // plus
        //',', // comma
        //'-', // hyphen (minus)
        //'.', // period
        //'/', // slash (divide)
        //':', // colon
        //';', // semicolon
        //'<', // lt
        //'=', // eq
        //'>'  // gt
      ],

      // "whitespace" means non-newline whitespace.
      whitespace: /[^\S\r\n]+/,

      'text.content': /[^\n\r\t @{}a-zA-Z#$]+/
    },


    'htmlTag': {
      // https://github.com/antlr/grammars-v4/blob/4a548224c5f707f6fa39bd4b5224aba7f3dd7532/html/HTMLLexer.g4
      'htmlTag.close': {
        match: '>',
        pop: 1
      },
      'htmlTag.close.self': {
        match: '/>',
        pop: 1
      },

      'slash': '/',
      'equals': '=',
      'string': /"[^"]+"/,
      // HTML Name again for attributes.
      'name': reHtmlName,
      'whitespace': { match: /\s+/, lineBreaks: true }
    }
  }

  constructor() {
    super(JavadocTokenizer.#lexerData)
  }

  /** @override */
  calculateIsTrivia(token) {
    switch (token.type) {
      case 'newline':
        return true
      case 'whitespace':
        return 'structured'
      case 'star.decoration':
        return true
      default:
        return false
    }
  }
}

exports.JavadocTokenizer = JavadocTokenizer
