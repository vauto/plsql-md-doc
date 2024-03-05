/**
 * @typedef {'mcomment' | 'scomment' | 'string' | 'identifier' | 'code'} SyntaxType
 * @typedef {import("moo").Token} Token
 * @typedef {SyntaxNode | Token} SyntaxNodeOrToken
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

/**
 * @param {Token} token
 * @returns {boolean}
 */
const isTrivia = (token) => token.type === 'whitespace' || token.type.startsWith('comment.')
/**
 * @param {Token} token
 * @returns {boolean}
 */
const isNotTrivia = (token) => !isTrivia(token)

class SyntaxNode {

  /**
   *
   * @param  {...{Token | Token[]}} tokens
   * @returns
   */
  static create(...tokens) {
    /** @type {Token[]} */ tokens = tokens.flat()
    if (tokens.length === 0) {
      return new SyntaxNode()
    }

    switch (tokens[0].value) {
      case 'CREATE':
        return new CreateStatementSyntaxNode(...tokens)
      default:
        return new SyntaxNode(...tokens)
    }
  }

  // /** @type {Token} The primary token. */ token
  /** @type {{Token|Token[]}[]} Undifferentiated tokens. */ tokens
  // /** @type {string} */ text
  // /** @type {Span} */ span
  // /** @type {string?} */ error
  // /** @type {string?} */ filename
  constructor(...tokens) {
    this.tokens = [...tokens].flat()

    if (this.tokens.some(x => (x instanceof Array))) {
      throw new Error("boom.")
    }
  }

  get token() {
    return this.tokens[0]
  }

  /** @type {SyntaxNode[]} Child nodes. */ children = []
  /** @type {SyntaxNode?} Parent */ parent = null

  /**
   *
   * @param {...SyntaxNodeOrToken} nodesOrTokens
   */
  push(...nodesOrTokens) {
    for (const nodeOrToken of nodesOrTokens.flat()) {
      if (nodeOrToken instanceof SyntaxNode) {
        this.children.push(nodeOrToken)
        nodeOrToken.parent = this
      } else if (nodeOrToken) {
        this.tokens.push(nodeOrToken)
      } else {
        throw `nodeOrToken: invalid value: ${nodeOrToken}`
      }
    }
  }

  *getTokens() {
    yield* this.tokens.filter(isNotTrivia)
  }

  toString() {
    return [...this.getTokens()].join(' ')
  }

  toFullString() {
    return this.tokens.join(' ')
  }

  /**
   * @generator
   * @yields {Token} A trivial (whitespace, comment) token.
   * @returns {Generator<Token>}
   */
  *getAllTrivia() {
    yield* this.tokens.filter(isTrivia)
  }

  /**
   * @generator
   * @yields {Token} A trivial (whitespace, comment) token.
   * @returns {Generator<Token>}
   */
  *getLeadingTrivia() {
    for (const token of this.tokens) {
      if (!isTrivia(token)) {
        break
      }
      yield token
    }
  }

  /**
   * @generator
   * @yields {Token} A trivial (whitespace, comment) token.
   * @returns {Generator<Token>}
   */
  *getTrailingTrivia() {
    const trivia = []
    for (const token of this.tokens.reverse()) {
      if (!isTrivia(token)) {
        break
      }
      trivia.unshift(token)
    }

    yield* trivia.reverse()
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

class CreateStatementSyntaxNode extends SyntaxNode {
  /** @type {Token} */ create
  /** @type {SyntaxNode} */ objectType
  /** @type {SyntaxNode} */ name

  constructor(...tokens) {
    super(...tokens)

    let t = this.tokens,
        i = 0, len = t.length

    while (i < len) {
      const token = t[i++]
      if (isTrivia(token)) {
        continue
      }

      switch (token.type) {
        case 'reserved':
        case 'keyword':
          switch (token.value) {
            case 'CREATE':
              this.create = token
              break
            case 'OR':
            case 'REPLACE':
              continue
            case 'PACKAGE':
            case 'TYPE':
              this.objectType = new SyntaxNode(token)
              TYPE:
              while (i < len) {
                const peek = t[i]
                if (isTrivia(peek) || peek.value === 'BODY') {
                  this.objectType.push(t[i++])
                  continue TYPE
                }

                break TYPE
              }
              break
          }
          break
        case 'identifier':
          this.name = new IdentifierSyntaxNode(token)
          NAME:
          while (i < len) {
            if (isTrivia(t[i])) {
              this.name.push(t[i++])
              continue NAME
            }
            switch (t[i].type) {
              case 'period':
              case 'identifier':
                this.name.push(t[i++])
                continue NAME
              default:
                break NAME
            }
          }
          break

      }

    }
    // console.log('create', { create: this.create?.toString(), type: this.objectType?.toString(), name: this.name?.toString() })
  }
}

class IdentifierSyntaxNode extends SyntaxNode {
  toString() {
    return [...this.getTokens()].join('')
  }
}

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
  /** @type {Token[]} */
  tokens = []

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

  constructor(code, tokens) {
    this.code = [code]
    this.tokens = tokens
  }
}

exports.Comment = Comment


class SyntaxTree {
  /** @type {SyntaxNode[]} */
  items = []

  /**
   * @return {SyntaxNode?}
   */
  get current() {
    return this.items.at(-1)
  }

  /**
   * @param {SyntaxNodeOrToken} nodeOrToken
   */
  push(nodeOrToken) {
    this.current?.push(nodeOrToken)
    if (nodeOrToken instanceof SyntaxNode) {
      this.items.push(nodeOrToken)
    }
  }

  /**
   * @return {SyntaxNode?}
   */
  pop() {
    const item = this.items.pop()
    if (!item) throw "invalid state: no items"
    return item
  }
}
exports.SyntaxTree = SyntaxTree
