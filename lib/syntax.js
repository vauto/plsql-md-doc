/**
 * @typedef {'mcomment' | 'scomment' | 'string' | 'identifier' | 'code'} SyntaxType
 * @typedef {import("moo").Token} Token
 * @typedef {SyntaxNode | Token} SyntaxNodeOrToken
 */

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

/**
 * Token iterator taking trivia into account
 */
class TokenIterator {

  constructor(tokens, start = 0) {
    this.tokens = tokens
    this.i = start
  }

  [Symbol.iterator]() { return this }

  next() {
    const start = this.i,
      len = this.tokens.length
    if (start >= len) {
      return { done: true, value: undefined }
    }

    for (; this.i < len; this.i++) {
      if (!this.tokens[this.i].isTrivia) {
        break
      }
    }

    const self = this
    if (this.i >= len) {
      return {
        done: false,
        peek: () => { done: true },
        value: { /* pseudo-token */ type: 'EOT' },
        tokens: this.tokens.slice(start)
      }
    }

    const tokens = this.tokens.slice(start, ++this.i)
    return {
      done: false,
      peek: () => new TokenIterator(this.tokens, this.i).next().value,
      tokens,
      value: tokens.at(-1)
    }
  }
}

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

  /** @type {Token[]} All tokens. */ tokens

  constructor(...tokens) {
    this.tokens = [...tokens].flat()
    this.tokens.forEach(t => t.isTrivia = isTrivia(t))

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
    throw new Error('DONOT PUSH')
    // for (const nodeOrToken of nodesOrTokens.flat()) {
    //   if (nodeOrToken instanceof SyntaxNode) {
    //     this.children.push(nodeOrToken)
    //     nodeOrToken.parent = this
    //   } else if (nodeOrToken) {
    //     this.tokens.push(nodeOrToken)
    //   } else {
    //     throw `nodeOrToken: invalid value: ${nodeOrToken}`
    //   }
    // }
  }

  *getTokens() {
    yield* this.tokens.filter(isNotTrivia)
  }

  toString() {
    if (this.children.length) {
      return this.children.join(' ')
    }
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
    yield* this.tokens.filter(t => t.isTrivia)
  }

  /**
   * @generator
   * @yields {Token} A trivial (whitespace, comment) token.
   * @returns {Generator<Token>}
   */
  *getLeadingTrivia() {
    for (const token of this.tokens) {
      if (!token.isTrivia) {
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
      if (token.isTrivia) {
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

    let t = new TokenIterator(this.tokens)


    TOKENS:
    while (true) {
      let curr = t.next()
      if (curr.done) {
        break
      }

      const token = curr.value
      console.assert(!token.isTrivia, 'NOT TRIVIA')

      switch (token.type) {
        case 'reserved':
        case 'keyword':
        case 'pseudoKeyword':
          switch (token.value) {
            case 'CREATE':
              console.log('CREATE', token)
              this.create = new SyntaxNode(...curr.tokens)
              this.children.push(this.create)

              if (curr.peek().value === 'OR') {
                // console.log('... peek: OR REPLACE')
                curr = t.next()
                this.create.tokens.push(...curr.tokens)
                curr = t.next()
                this.create.tokens.push(...curr.tokens)
              }

              console.log('... => ', this.create.toString())
              continue TOKENS

            case 'OR':
            case 'REPLACE':
              throw new Error("whoops.")

            case 'PACKAGE':
            case 'TYPE':
              {
                // console.log('obj type', token)
                this.objectType = new SyntaxNode(token)
                this.children.push(this.objectType)

                if (curr.peek().value === 'BODY') {
                  // console.log('... peek: part of object type')
                  curr = t.next()
                  this.objectType.children.push(...curr.tokens)
                }

                continue TOKENS
              }

            case 'AUTHID':
              {
                this.authid = new SyntaxNode(token)
                this.children.push(this.authid)

                if (curr.peek()) {
                  // console.log('... peek: part of authid')
                  curr = t.next()
                  this.authid.tokens.push(...curr.tokens)
                }

                console.log('... => ', this.authid.toString())
                continue TOKENS
              }

              case 'ACCESSIBLE':
                {

                  this.accessibleBy = new SyntaxNode(token)
                  this.children.push(this.accessibleBy)

                  if (curr.peek().value === 'BY') {
                    curr = t.next()
                    this.accessibleBy.tokens.push(...curr.tokens)
                  }

                  if (curr.peek().value === '(') {
                    // LATER: differentiate type, identifier
                    while (!curr.done && curr.peek().value !== ')') {
                      curr = t.next()
                      this.accessibleBy.tokens.push(...curr.tokens)
                    }
                    if (!curr.done) {
                      curr = t.next()
                      this.accessibleBy.tokens.push(...curr.tokens)
                    }
                }

                  console.log('... => ', this.accessibleBy.toString())
                  continue TOKENS
                }
                case 'IS':
                case 'AS':
                  this.is = new SyntaxNode(...curr.tokens)
                  this.children.push(this.is)
                  console.log('... => ', this.is.toString())
                  continue TOKENS
          }
          break
        case 'identifier':
          {
            this.name = new IdentifierSyntaxNode(token)
            this.children.push(this.name)
            while (curr.peek().type === 'period') {
              // console.log('... peek: part of compound identifier')
              curr = t.next()
              this.name.tokens.push(...curr.tokens)
              curr = t.next()
              this.name.tokens.push(...curr.tokens)
            }
            console.log('... => ', this.name.toString())
            continue TOKENS
          }

        default:
      }

      console.log('unexpected token', token)
      this.children.push(token)
    }

    console.log('create', this.children.map(c => c.toString()))
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
