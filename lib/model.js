/**
 * @typedef {'mcomment' | 'scomment' | 'string' | 'identifier' | 'code'} TokenType
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

class Token {
  /** @type {TokenType} */ type
  /** @type {string} */ text
  /** @type {Span} */ span
  /** @type {string?} */ error
  /** @type {string?} */ filename
  constructor ({ type, text, start, end, error=undefined, filename=undefined }) {
    this.type = type
    this.text = text
    this.span = new Span(start, end, filename)
    this.error = error
  }

  get start() {
    return this.span.start
  }
  get end() {
    return this.span.end
  }
  get length() {
    return this.span.length
  }

  /** @type {string?} */ trimText
}
exports.Token = Token

// We have to override parseComment and parseComments, PL/SQL doesn't look the same.

class Comment {
  /** array of tag objects */
  tags = []
  code = []

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