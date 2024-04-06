// @ts-check
const path = require('path')
const { mustBeInstanceOf } = require('./guards')
const console = require('./debug').child(__filename)

/** @typedef {'FULL' | 'LC' | 'NAME'} PositionFormat */

class Position {
  /** @type {string?} The (optional) filename */ filename
  line = 1
  col = 1

  /**
   * @param {number} line
   * @param {number} col
   * @param {string?} filename The optional filename.
   */
  constructor(line, col, filename = null) {
    this.line = line
    this.col = col
    this.filename = filename
  }

  /**
   * @param {PositionFormat?} format
   * @returns {string}
   */
  toString(format = null) {
    switch (format?.toUpperCase()) {
      case 'FULL':
      default:
        return this.filename
          ? `${this.filename}:${this.line}:${this.col}`
          : `${this.line}:${this.col}`

      case 'LC':
        return `${this.line}:${this.col}`

      case 'NAME':
        return this.filename
          ? `${path.basename(this.filename)}:${this.line}:${this.col}`
          : `${this.line}:${this.col}`
    }
  }

  /**
   * @param {Position} other
   * @returns {boolean}
   */
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
  constructor(start, end, filename = null) {
    mustBeInstanceOf(start, Position, 'start')
    mustBeInstanceOf(end, Position, 'end')
    this.start = start
    this.end = end
    this.filename = filename ?? start?.filename
  }

  /**
   * @param {PositionFormat?} format
   * @returns {string}
   */
  toString(format = null) {
    const startEnd = `${this.start.toString('LC')}..${this.end.toString('LC')}`

    switch (format) {
      case 'LC':
        return startEnd
      case 'NAME':
        return this.filename ? `${path.basename(this.filename)}:${startEnd}` : `(input):${startEnd}`
      case 'FULL':
      default:
        return this.filename ? `${this.filename}:${startEnd}` : `(input):${startEnd}`
    }
  }

  valueOf() {
    return this.toString('NAME')
  }
}
exports.TextSpan = TextSpan

/** @typedef {{ textSpan: TextSpan? }} HasPosition */
