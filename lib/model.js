/**
 * @interface Token
 * @property {string} text
 * @property {'mcomment' | 'scomment' | 'string' | 'identifier' | 'code'} type
 * @property {Position} start
 * @property {Position} end
 * @property {string?} error
 */

export class Position {
  position = 0
  line = 1
  column = 1

  newLine() {
    this.position++
    this.line++
    this.column = 1
  }

  increment() {
    this.position++
    this.column++
  }

  clone() {
    return { ...this }
  }

  /**
   * @param {Token} token 
   * @returns  {Token}
   */
  enrichToken(token) {
    token.start = this.clone()

    let start = 0
    while (true) {
      let i = token.text.indexOf('\n', start);
      if (i < 0) {
        // At end
        this.column += token.text.length - start
        break
      }

      this.position += i - start
      this.newLine()
      start = i + 1
    }

    token.end = this.clone()

    return token
  }

  valueOf() {
    return this.position
  }

  toString() {
    return `${this.position} (${this.line}:${this.column})`
  }
}

// We have to override parseComment and parseComments, PL/SQL doesn't look the same.

export class Comment {
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
