/**
 * @interface Token
 * @property {string} text
 * @property {'mcomment' | 'scomment' | 'string' | 'identifier' | 'code'} type
 * @property {Position} start
 * @property {Position} end
 * @property {string?} error
 */

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
