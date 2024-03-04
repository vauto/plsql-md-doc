/**
 * @typedef {'mcomment' | 'scomment' | 'string' | 'identifier' | 'code'} SyntaxType
 * @typedef {import("moo").Token} Token
 */

// class Token  {
//   Token({ type, text, })
// }

class Position {
  position = 0
  line = 1
  column = 1

  /**
   * Advance one line.
   */
  newLine() {
    this.position++
    this.line++
    this.column = 1
  }

  /**
   * Increment on the same line.
   * @param {integer} amount
   */
  increment(amount = 1) {
    this.position += amount
    this.column += amount
  }

  clone() {
    return Object.assign(new Position(), this)
  }

  /**
   * @param {string} text
   * @returns  {Position}
   */
  advance(text) {
    let start = 0
    while (true) {
      let newlineIndex = text.indexOf('\n', start);
      if (newlineIndex < 0) {
        // At end
        const end = text.length - start
        this.position += end
        this.column += end
        break
      }

      this.position += newlineIndex - start
      this.newLine()
      start = newlineIndex + 1
    }

    return this
  }

  valueOf() {
    return this.position
  }

  toString(format = undefined) {
    switch (format) {
      case 'P':
        return this.position.toString()
      case 'L':
        return `${this.line}:${this.column}`
      default:
        return `${this.position} (${this.line}:${this.column})`
    }
  }

  equals(other) {
    return other instanceof Position && this.position == other.position && this.line == other.line && this.column == other.column
  }
}
exports.Position = Position

class Span {
  /** @type {Position} */ start
  /** @type {Position} */ end

  /**
   * @param {Position} start
   * @param {Position} end
   */
  constructor(start, end, filename) {
    this.start = start
    this.end = end
    this.filename = filename
  }

  get length() {
    return this.end - this.start
  }

  toString() {
    const startEnd = `${this.start.toString('L')}..${this.end.toString('L')}`
    return this.filename ? `${this.filename}:${startEnd}` : startEnd
  }
}
exports.Span = Span



class SyntaxNodeFactory {
  /**
   *
   * @param {Token} token
   * @param {SyntaxNode} left
   * @param {SyntaxNode?} right
   */
  static createBinaryExpression(token, left, right = null) {
    return new BinaryExpressionSyntaxNode({ token, left, right })
  }
}

exports.SyntaxNodeFactory = SyntaxNodeFactory

const isTrivia = (token) => token.type === 'whitespace' || token.type.startsWith('comment.')

class SyntaxNode {
  // /** @type {Token} The primary token. */ token
  /** @type {Token[]} Undifferentiated tokens. */ tokens
  // /** @type {string} */ text
  // /** @type {Span} */ span
  // /** @type {string?} */ error
  // /** @type {string?} */ filename
  constructor(...tokens) {
    this.tokens = [...tokens].flat()
  }

  get token() {
    return this.tokens[0]
  }


  toString() {
    return this.tokens.filter(x => !isTrivia(x)).join(' ')
  }

  toFullString() {
    return this.tokens.join(' ')
  }

  *getAllTrivia() {
    for (const token of this.tokens.filter(isTrivia)) {
      yield token
    }
  }

  *getLeadingTrivia() {
    for (const token of this.tokens) {
      if (!isTrivia(token)) {
        break
      }
      yield token
    }
  }

  *getTrailingTrivia() {
    const trivia = []
    for (const token of this.tokens.reverse()) {
      if (!isTrivia(token)) {
        break
      }
      trivia.unshift(token)
    }

    for (const token of trivia.reverse()) {
      yield token
    }
  }



  // get start() {
  //   return this.span.start
  // }
  // get end() {
  //   return this.span.end
  // }
  // get length() {
  //   return this.span.length
  // }



  // /**
  //  * Removes excess indentation from string of code.
  //  * @return {String}
  //  */
  // get trimText () {
  //   // Find indentation from first line of code.
  //   let str = this.text
  //   let indent = str.match(/(?:^|\n)([ \t]*)[^\s]/);
  //   if (indent) {
  //     // Replace common indentation on all lines.
  //     str = str.replace(new RegExp('(^|\n)' + indent[1], 'g'), '$1');
  //   }

  //   return str.trim();
  // }
}
exports.SyntaxNode = SyntaxNode

class ExpressionSyntaxNode extends SyntaxNode {
  // /** @type {SyntaxNode[]} */ children  = []
}
class BinaryExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {SyntaxNode} */ left
  /** @type {SyntaxNode} */ right

  constructor({ token, left, right }) {
    super({ token })
    this.left = left
    this.right = right
  }
}

class StatementSyntaxNode extends SyntaxNode {

}

// We have to override parseComment and parseComments, PL/SQL doesn't look the same.

class CodeContext {
  /** @type {string} */ type
  /** @type {string} */ name
  /** @type {CodeContext[]} */ children = []
  /** @type {CodeContext?} */ parent
  /** @type {string?} */ header
  /** @type {CodeContext[]?} */ constants
  /** @type {CodeContext[]?} */ exceptions
  /** @type {CodeContext[]?} */ subtypes
  /** @type {CodeContext[]?} */ variables

  /**
   * @param {...CodeContext} params
   */
  constructor(params) {
    Object.assign(this, params)
  }
}

exports.CodeContext = CodeContext

class Comment {
  /** array of tag objects */
  tags = []
  /** @type {SyntaxNode[]} */
  code = []

  /** @type {CodeContext?} */ ctx

  /** The parsed description
   * @property {string} full The full text
   * @property {string} summary The first line of the comment
   * @property {string} body The rest of the comment
   */

  description = { full: '', summary: '', body: '' }
  /** true when "@api private" is used */
  isPrivate = false
  isConstructor = false
  line = 0

  constructor(params) {
    if (params) {
      for (const k of Object.keys(params)) {
        this[k] = params[k]
      }
    }
  }
}

exports.Comment = Comment
