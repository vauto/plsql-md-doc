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
