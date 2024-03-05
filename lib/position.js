/**
 * @typedef {'mcomment' | 'scomment' | 'string' | 'identifier' | 'code'} SyntaxType
 * @typedef {import("moo").Token} Token
 * @typedef {SyntaxNode | Token} SyntaxNodeOrToken
 */

class Position {
  line = 1
  col = 1

  valueOf() {
    return this.position
  }

  toString() {
    return `${this.line}:${this.col}`
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

