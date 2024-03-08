const path = require('path')

class Position {
  /** @type {string?} The (optional) filename */ filename
  line = 1
  col = 1

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

