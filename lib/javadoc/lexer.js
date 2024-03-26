const { Tokenizer } = require('../lexer')

const contentRegex = /[\w!"#$%&'()*+,-./:;<>?@[\\\]^`|~]+/
// @see https://www.ietf.org/rfc/rfc3986.txt, then cut down to not be ridiculous.
const urlMatch = /\b(?:[a-z][a-z0-9]*):\/\/(?:[^\/?#]*)(?:[^?#]*)(?:\?(?:[^#]*))?(?:#(?:.*))?/

const whitespaceMatch = /[ \t]+/
const newlineMatch = /\r?\n|[\r\n]/

// PL/SQL identifier matcher
const identifierMatches = [
  {
    match: /[a-zA-Z_][a-zA-Z0-9_#$]*/,
    value: s => s.toUpperCase()
  },
  {
    match: /"[^"]+"/,
    value: s => s.slice(1, -1).toUpperCase()
  }
]

const tagRules = [
  {
    // Tags with one required, content-like parameter.
    match: /@(?:param|see|seealso|throws|exception)\b/,
    value: s => s.slice(1),
    next: 'semistructured.1'
  },
  // Tags with optional or structured parameters
  {
    match: /@[A-Za-z]\w*/,
    value: s => s.slice(1)
  }
]

// lazy, not differentiating.
const braces = [
  { match: '{', push: 'structured' },
  { match: '}', pop: 1 },
  { match: '[', push: 'structured' },
  { match: ']', pop: 1 },
]

const semistructuredCommon = {
  'tag': tagRules,
  'url': urlMatch,
  'identifier': [
    /ORA-\d{5}\b/,  // e.g. ORA-00904
    ...identifierMatches,
  ],

  'number': /[+-]?[0-9]*\.?[0-9]+(?:[Ee][+-]?[0-9]+)?[DFdf]?/,

  'operator': [
    ...braces,
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
      // Javadoc-style tags
      'tag': tagRules,

      operator: [
        ...braces,
        {
          match: '=',
          push: 'semistructured.1'
        }
      ],

      newline: { match: newlineMatch, lineBreaks: true },

      whitespace: whitespaceMatch,
      star: '*',
      content: /.+/
    },

    'structured': {
      whitespace: whitespaceMatch,
      newline: {
        match: newlineMatch,
        lineBreaks: true
      },

      'tag': tagRules,
      'url': urlMatch,
      'identifier': identifierMatches,

      'operator': [
        ...braces,
        '(', // lparen
        ')', // rparen
        '*', // star (multiply)
        '+', // plus
        ',', // comma
        '-', // hyphen (minus)
        '.', // period
        '/', // slash (divide)
        ':', // colon
        ';', // semicolon
        '<',
        '=',
        '>',
      ],

      star: '*',

      OTHER: {
        match: /./,
        error: true
      }

    },

    // structured.N:
    // This is for when we have a tag that requires an identifier or special syntax after it,
    // but said syntax is difficult to parse because it's followed by description text.
    // This basically just makes it navigate everytime it hits whitespace.
    // If I could do a counter in moo that would be helpful.
    'semistructured.1': {
      whitespace: {
        match: whitespaceMatch,
        next: 'semistructured.0'
      },
      // newline ALWAYS goes default
      newline: {
        match: newlineMatch,
        lineBreaks: true,
        next: 'default'
      },
      ...semistructuredCommon
    },

    'semistructured.0': {
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
      ...semistructuredCommon
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
