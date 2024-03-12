const { Tokenizer } = require('../lexer')

const contentRegex = /[\w!"#$%&'()*+,-./:;<>?@[\\\]^`|~]+/
// @see https://www.ietf.org/rfc/rfc3986.txt, then cut down to not be ridiculous.
const urlMatch = /\b(?:[a-z][a-z0-9]*):\/\/(?:[^\/?#]*)(?:[^?#]*)(?:\?(?:[^#]*))?(?:#(?:.*))?/

const whitespaceMatch = /[ \t]+/
const newlineMatch = /\r?\n|[\r\n]/

// PL/SQL identifier matcher
const identifierMatch = /[A-Za-z][\w#$]+/

const tagRules = [
  {
    // Tags with one required, content-like parameter.
    match: /@(?:param|see|seealso)\b/,
    value: s => s.slice(1),
    next: 'structured.1'
  },
  // Tags with optional or structured parameters
  {
    match: /@[A-Za-z]\w*/,
    value: s => s.slice(1)
  }
]

const structuredCommon = {
  'tag': tagRules,
  'url': urlMatch,
  'identifier': identifierMatch,

  'lt': '<',
  'gt': '>',
  'lbracket': '[',
  'rbracket': ']',
  'lparen': '(',
  'rparen': ')',
  'operator': [
    '=',
    '.'
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
      // Javadoc-style tags
      'tag': tagRules,

      lbrace: {
        match: '{',
        push: 'structured.braces'
      },

      rbrace: '}',

      newline: { match: newlineMatch, lineBreaks: true },

      whitespace: whitespaceMatch,
      star: '*',
      content: /.+/
    },

    'structured.braces': {
      // lbrace MAY be nested
      'lbrace': { match: '{' },
      'rbrace': { match: '}', pop: 1 },

      // braces: eat whitespace but do not pop/next
      whitespace: whitespaceMatch,
      newline: {
        match: newlineMatch,
        lineBreaks: true
      },

      ...structuredCommon
    },

    // structured.N:
    // This is for when we have a tag that requires an identifier or special syntax after it,
    // but said syntax is difficult to parse because it's followed by description text.
    // This basically just makes it navigate everytime it hits whitespace.
    // If I could do a counter in moo that would be helpful.
    'structured.1': {
      whitespace: {
        match: whitespaceMatch,
        next: 'structured.0'
      },
      // newline ALWAYS goes default
      newline: {
        match: newlineMatch,
        lineBreaks: true,
        next: 'default'
      },
      ...structuredCommon
    },

    'structured.0': {
      whitespace: {
        match: whitespaceMatch,
        next: 'default'
      },

      // newline ALWAYS goes default
      newline: {
        match: newlineMatch,
        lineBreaks: true,
        next: 'default'
      },
      ...structuredCommon
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
