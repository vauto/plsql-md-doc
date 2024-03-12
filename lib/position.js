const path = require('path')

class Position {
  /** @type {string?} The (optional) filename */ filename
  line = 1
  col = 1

  /**
   * @param {integer} start
   * @param {integer} end
   * @param {string?} filename
   */
  constructor(line, col, filename = undefined) {
    this.line = line
    this.col = col
    this.filename = filename
  }

  /**
   *
   * @param {string?} format
   * @returns {string}
   */
  toString(format = null) {
    switch (format?.toUpperCase()) {
      case 'FULL':
        return this.filename
          ? `${this.filename}:${this.line}:${this.col}`
          : `${this.line}:${this.col}`

      case 'LC':
        return `${this.line}:${this.col}`

      default:
        return this.filename
          ? `${path.basename(this.filename)}:${this.line}:${this.col}`
          : `${this.line}:${this.col}`
    }
  }

  equals(other) {
    return other instanceof Position && this.line == other.line && this.col == other.col
  }
}
exports.Position = Position

class TextSpan {
  /** @type {string?} The (optional) filename */ filename
  /** @type {Position} */ start
  /** @type {Position} */ end

  /**
   * @param {Position?} start
   * @param {Position?} end
   * @returns {TextSpan?}
   */
  static from(start, end) {
    if (start && end) {
      return new TextSpan(start, end, start.filename)
    }
    return null
  }

  /**
   * @param {Position} start
   * @param {Position} end
   * @param {string?} filename
   */
  constructor(start, end, filename = undefined) {
    this.start = start
    this.end = end
    this.filename = filename ?? start?.filename
  }

  get length() {
    return this.end - this.start
  }

  toString() {
    const startEnd = `${this.start.toString('LC')}..${this.end.toString('LC')}`
    return this.filename ? `${this.filename}:${startEnd}` : startEnd
  }
}
exports.TextSpan = TextSpan

