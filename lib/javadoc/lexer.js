const { Argument } = require('commander')
const { Tokenizer } = require('../lexer')

const contentRegex = /[\w!"#$%&'()*+,-./:;<>?@[\\\]^`|~]+/
// @see https://www.ietf.org/rfc/rfc3986.txt, then cut down to not be ridiculous.
const urlMatch = /\b(?:[a-z][a-z0-9]*):\/\/(?:[^\/?#]*)(?:[^?#]*)(?:\?(?:[^#]*))?(?:#(?:.*))?/

const semistructuredCommon = {
  'url': urlMatch,
  'number': /[+-]?[0-9]*\.?[0-9]+(?:[Ee][+-]?[0-9]+)?[DFdf]?/,

  'operator': [
    '#', // hash (reference to member property/method)
    '(', // lparen
    ')', // rparen
    {
      match: '*', // star (exit operator?)
      pop: 1
    },
    '+', // plus
    ',', // comma
    '-', // hyphen (minus)
    '.', // period
    '/', // slash (divide)
    ':', // colon
    ';', // semicolon
    '<',
    '=',
    '>'
  ],

  star: '*',

  OTHER: {
    match: /./,
    error: true
  }
}

class JavadocTokenizer extends Tokenizer {
  static #lexerData = {
    default: {
      tag: {
        match: /@[A-Za-z][A-Za-z0-9_\-]*/,
        value: s => s.slice(1).toLowerCase()
      },
      url: urlMatch,

      'html.tag.open': {
        match: '<',
        push: 'html.tag'
      },

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

      'markdown.codefence': /`+/,


      // Property/method delimiters
      hash: '#',

      operator: [
        '(', // lparen
        ')', // rparen
        '+', // plus
        ',', // comma
        '-', // hyphen (minus)
        '.', // period
        '/', // slash (divide)
        ':', // colon
        ';', // semicolon
        '<', // lt
        '=', // eq
        '>'  // gt
      ],

      whitespace: /[^\S\r\n]+/,
      newline: {
        match: /\r?\n|[\r\n]/,
        lineBreaks: true
      },
      star: '*',

      content: /.+/
    },


    'html.tag': {
      // https://github.com/antlr/grammars-v4/blob/4a548224c5f707f6fa39bd4b5224aba7f3dd7532/html/HTMLLexer.g4
      'html.tag.close': {
        match: '>',
        pop: 1
      },
      'html.tag.close.self': {
        match: '/>',
        pop: 1
      },

      'slash': '/',
      'equals': '=',
      'string': /"[^"]+"/,
      'name': /[:a-zA-Z|\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][:a-zA-Z|\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-).0-9\u00B7\u0300-\u036F\u203F-\u2040]*/,
      'whitespace': { match: /\s+/, lineBreaks: true }
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
