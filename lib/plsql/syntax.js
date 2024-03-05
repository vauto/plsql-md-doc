const { SyntaxNode, SyntaxNodeFactory, TokenIterator } = require('../syntax')

class PlsqlSyntaxNodeFactory extends SyntaxNodeFactory {

  /**
   * @param  {...{Token | Token[]}} tokens
   * @returns {SyntaxNode}
   */
  create(...tokens) {
    /** @type {Token[]} */ tokens = tokens.flat()
    if (tokens.length === 0) {
      return new SyntaxNode()
    }

    switch (tokens[0].value) {
      case 'CREATE':
        return new PlsqlCreateStatementSyntaxNode(...tokens)
      default:
        return super.create(...tokens)
    }
  }
}

exports.PlsqlSyntaxNodeFactory = PlsqlSyntaxNodeFactory

class PlsqlCreateStatementSyntaxNode extends SyntaxNode {
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

      const tokenGroup = curr.value
      console.assert(!tokenGroup.isTrivia, 'oops trivia')

      switch (tokenGroup.type) {
        case 'reserved':
        case 'keyword':
        case 'pseudoKeyword':
          switch (tokenGroup.value) {
            case 'CREATE':
              {
                console.log('CREATE', tokenGroup)
                this.create = new SyntaxNode(tokenGroup)
                this.children.push(this.create)

                if (curr.peekMatch('OR', 'REPLACE')) {
                  console.log('... peek: OR REPLACE')
                  curr = t.next()
                  this.create.tokens.push(curr.value)
                  curr = t.next()
                  this.create.tokens.push(curr.value)
                }

                console.log('... => ', this.create.toString())
                continue TOKENS
              }
            case 'OR':
            case 'REPLACE':
              throw new Error("whoops.")

            case 'PACKAGE':
            case 'TYPE':
              {
                // console.log('obj type', token)
                this.objectType = new SyntaxNode(tokenGroup)
                this.children.push(this.objectType)

                if (curr.peek().value === 'BODY') {
                  // console.log('... peek: part of object type')
                  curr = t.next()
                  this.objectType.push(curr.value)
                }

                continue TOKENS
              }

            case 'AUTHID':
              {
                this.authid = new SyntaxNode(tokenGroup)
                this.children.push(this.authid)

                if (curr.peekMatch({})) {
                  // console.log('... peek: part of authid')
                  curr = t.next()
                  this.authid.push(curr.value)
                }

                console.log('... => ', this.authid.toString())
                continue TOKENS
              }

            case 'ACCESSIBLE':
              {
                this.accessibleBy = new SyntaxNode(tokenGroup)
                this.children.push(this.accessibleBy)

                if (curr.peekMatch('BY')) {
                  curr = t.next()
                  this.accessibleBy.push(curr.value)
                }

                if (curr.peekMatch('(')) {
                  // LATER: differentiate type, identifier
                  while (!curr.done && !curr.peekMatch(')')) {
                    curr = t.next()
                    this.accessibleBy.push(curr.value)
                  }
                  if (!curr.done) {
                    curr = t.next()
                    this.accessibleBy.push(curr.value)
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
            console.log('IDENTIFIER', tokenGroup)
            this.name = new IdentifierSyntaxNode(tokenGroup)
            this.children.push(this.name)

            while (curr.peekMatch({ type: 'period' }, { type: 'identifier' })) {
              console.log('... peek: part of compound identifier')
              curr = t.next()
              this.name.push(curr.value)
              curr = t.next()
              this.name.push(curr.value)
            }
            console.log('... => ', this.name.toString())
            continue TOKENS
          }

        default:
      }

      console.log('unexpected token', tokenGroup)
      this.children.push(tokenGroup)
    }

    // console.log('create', this.children.map(c => c.toString()))
  }
}

class IdentifierSyntaxNode extends SyntaxNode {
  toString() {
    return [...this.getTokens()].join('')
  }
}
