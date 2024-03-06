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

  /**
   *
   * @param {Iterator<Token>} tokens
   * @returns {Generator<SyntaxNode>}
   */
  *toSyntax(tokens) {
    const tokenIterator = tokens instanceof TokenIterator
      ? tokens : new TokenIterator(tokens)

    while (!tokenIterator.next().done) {
      let curr = tokenIterator

      const token = curr.value
      if (token.isTrivia) {
        // The content is of trivia tokens only, and probably the last one.
        yield new SyntaxNode(token)
        continue
      }

      switch (token.type) {
        case 'reserved':
          switch (token.value) {
            case 'CREATE':
              // CREATE [OR REPLACE] [PACKAGE|TYPE]
              yield new PlsqlCreateStatementSyntaxNode(...tokenIterator.readUntil(['IS', 'AS']))
              continue

            case 'SUBTYPE':
            case 'TYPE':
            case 'EXCEPTION':
              yield new SyntaxNode(...tokenIterator.readUntil(';'))
              continue
            case 'PROCEDURE':
            case 'FUNCTION':
              yield new SyntaxNode(...tokenIterator.readUntil([';', 'IS', 'AS']))
              continue

            case 'END':
              yield new SyntaxNode(...tokenIterator.readUntil([';', '/']))
              continue
          }
          break;

          case 'slash':
            yield new SyntaxNode(token)
            continue

          case 'identifier':
            // Some SQL*Plus command, probably 'SHOW ERRORS'.
            if (tokenIterator.is('SHOW', 'ERRORS')) {
                yield new SyntaxNode(token, tokenIterator.next().value)
                continue
            }
            break
      }

      // Fallthrough logic
      console.warn('scan for terminator', token)
      const buffer = []
      SCAN:
      while (!tokenIterator.done) {
        const token = tokenIterator.value
        buffer.push(token)
        switch (token.type) {
          case 'semicolon':
          case 'slash':
            yield this.create(buffer)
            break SCAN
        }
        tokenIterator.next()
      }
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

                if (curr.expect('OR', 'REPLACE')) {
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

                if (curr.expect({})) {
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

                if (curr.expect('BY')) {
                  curr = t.next()
                  this.accessibleBy.push(curr.value)
                }

                if (curr.expect('(')) {
                  // LATER: differentiate type, identifier
                  while (!curr.done && !curr.expect(')')) {
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
              this.is = new SyntaxNode(curr.value)
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

            while (curr.expect({ type: 'period' }, { type: 'identifier' })) {
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

      console.warn('create: unexpected token', tokenGroup)
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
