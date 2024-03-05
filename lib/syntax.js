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

    let t = this.tokens,
      i = 0, len = t.length

    TOKENS:
    while (i < len) {
      const token = t[i++]
      console.log('WHAT IS', token)
      if (token.isTrivia) {
        console.log('.trivia', token)
        continue
      }

      switch (token.type) {
        case 'reserved':
        case 'keyword':
        case 'pseudoKeyword':
          switch (token.value) {
            case 'CREATE':
              console.log('CREATE', token)
              this.create = token
              this.children.push(token)
              continue TOKENS

            case 'OR':
              console.log(token.value, token)
              this.children.push(token)
              continue TOKENS

            case 'REPLACE':
              console.log(token.value, token)
              this.children.push(token)
              continue TOKENS

            case 'PACKAGE':
            case 'TYPE':
              console.log('obj type', token)
              this.objectType = new SyntaxNode(token)
              this.children.push(this.objectType)

              TYPE:
              while (i < len) {
                const peek = t[i]
                if (peek.isTrivia || peek.value === 'BODY') {
                  console.log('... part of object type', peek)
                  this.objectType.tokens.push(t[i++])
                  continue TYPE
                }

                break TYPE
              }
              continue TOKENS

            }
          break
        case 'identifier':
          this.name = new IdentifierSyntaxNode(token)
          this.children.push(this.name)
          NAME:
          while (i < len) {
            const peek = t[i]
            if (peek.isTrivia) {
              console.log('... part of object type', peek)
              this.name.tokens.push(t[i++])
              continue NAME
            }
            switch (peek.type) {
              case 'period':
              case 'identifier':
                console.log('... part of object type', peek)
                this.name.tokens.push(t[i++])
                continue NAME
              default:
                break NAME
            }
          }
          continue TOKENS

        default:
      }
      console.log('what is this', token)
      this.children.push(token)

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
