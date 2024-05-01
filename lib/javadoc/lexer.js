const { Tokenizer } = require('../lexer')
const console = require('../debug').child(__filename)
/**
 * @typedef {import('../token').TriviaFlag} TriviaFlag
 */

const reHtmlName = /[a-zA-Z\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][:a-zA-Z\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-).0-9\u00B7\u0300-\u036F\u203F-\u2040]*/
const reHtmlTagOpen = new RegExp(`</?${reHtmlName.source}`) // NOTE: this isn't "an open HTML tag", this is "HTML open (open or close or standalone tag)"

// Potential identifier (may also be content).
/** @type {moo.Rule} */
const identifierRules = [
  // Ticket IDs and Oracle error codes (e.g. ORA-00904, VA-12345)
  {
    match: /\b[A-Z]{1,10}-\d{1,10}\b/,
  },

  // Bare words.  Most likely identifiers.
  // Do not apply language-specific rules here.
  {
    match: /[a-zA-Z][a-zA-Z0-9_#$]*/
  }
]

/**
 * @type {moo.Rule}
 * @remarks
 * You'd think there would be a good URL regex.  There's a thousand of them.
 * @see https://urlregex.com/ - doesn't accept hyphens in #fragment
 * @see https://www.ietf.org/rfc/rfc3986.txt - it matches **whitespace**, whyyy
 */
const absoluteUrlRule = /\b(?:[A-Za-z][A-Za-z0-9]*):\/\/(?:[A-Za-z0-9\.\-]+)(?:\/[\+~%\/\.\w\-_]*)?(?:\?[\-\+=&;%@\.\w_]*)?(?:#[\-\.\!\/\\\w]*)?/
//                            ^^^^^^ scheme ^^^^^^^ ://    ^^^ hostname ^^^    ^^^^^ path ^^^^^       ^^^^^ query ^^^^^^      ^^ fragment ^^

/**
 * @type {moo.Rule[]}
 * @remarks
 * Regex to capture many relative URLs/file paths, excluding braces.  You have to encode 'em, sorry.
 * (NOTE: this will catch things with lowercase names.  :shrug:)
 */
const relativeUrlRules = [
  /[^\r\n<>:;,?"*|{}()\[\]]+\.[a-z0-9]{1,6}\b(?:\?[\-\+=&;%@\.\w_]*)?(?:#[\-\.\!\/\\\w]*)?/,
  //^^^^^^^^^ path ^^^^^^^^^ ^^^^ ext ^^^^^     ^^^^^ query ^^^^^^      ^^ fragment ^^
  ///(?:#[\-\.\!\/\\\w]*)/,
  //  ^^ fragment ^^
]


/** @type {moo.Rule} "whitespace" means non-newline whitespace */
const whitespaceRule = /[^\S\r\n]+/

/** @type {moo.Rule} A double-quoted string literal.  (May be a quoted Oracle identifier.) */
const stringLiteralRule = {
  match: /"[^"]+"/,
  value: s => s.slice(1, -1)
}

/** @type {moo.Rule} */
const tagRule = {
  match: /@[A-Za-z][A-Za-z0-9_\-]*/,
  value: s => s.slice(1).toLowerCase()
}

const newlineRule = {
  match: /(?:\r?\n|[\r\n])/,
  lineBreaks: true,
}

/**
 * Leading whitespace and stars is considered separate from content-whitespace, and summarily ignored.
 */
const paddingRule = {
  match: /^[ \t*]+/ // right after newline can be \s* but nothing else.
}

// Text content pattern
const textContentMatch = /[^\n\r\t {}\[\]a-zA-Z]+/

class JavadocTokenizer extends Tokenizer {
  static #lexerData = {
    default: {
      newline: newlineRule,
      padding: paddingRule,
      whitespace: whitespaceRule,
      tag: tagRule,
      url: absoluteUrlRule,

      // Javadoc treats double-quoted strings as literal text.
      'string': stringLiteralRule,
      'number': /[+-]?[0-9]*\.?[0-9]+(?:[Ee][+-]?[0-9]+)?[DFdf]?/,

      'htmlTag.open': {
        match: reHtmlTagOpen,
        push: 'htmlTag',
        value: s => s.slice(1)
      },

      'markdown.codeFence': /`{3,}/,

      // Catchall for text content
      'text.content': textContentMatch,

      // Potential identifier (may also be content).
      identifier: identifierRules,


      'brace.open': [
        {
          // '{@': start of inline tag
          match: /[{](?=@)/,
          push: 'inlineTag'
        },
        '{'
      ],
      'brace.close': '}',
      'bracket.open': '[',
      'bracket.close': ']',
      'paren.open': '(',
      'paren.close': ')',

      // Property/method delimiters
      hash: '#',
      // at: '@',
      //star: '*',
      slash: '/',
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
    },

    // For immediately after an inline tag starts.
    'inlineTag': {
      newline: newlineRule,
      padding: paddingRule,
      whitespace: whitespaceRule,
      tag: tagRule,
      url: [
        absoluteUrlRule,
        ...relativeUrlRules
      ],

      'identifier': identifierRules,

      'brace.close': {
        match: '}',
        pop: 1
      },
      'paren.open': {
        match: '(',
        pop: 1
      },

      // Catchall for text content
      'text.content': {
        match: textContentMatch,
        pop: 1
      },

      error: {
        match: /./,
        error: true,
        lineBreaks: true,
        pop: 1
      }
    }
  }

  constructor() {
    super(JavadocTokenizer.#lexerData)
  }

  /**
   * @override
   * @param {string} tokenType
   * @returns {TriviaFlag}
   */
  calculateIsTrivia(tokenType) {
    switch (tokenType) {
      case 'newline':
      case 'whitespace':
        return 'structured'
      case 'star.decoration':
      case 'padding':
        return true
      default:
        return false
    }
  }
}

exports.JavadocTokenizer = JavadocTokenizer
