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
      const token = tokenIterator.value
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

    let tokenIterator = new TokenIterator(this.tokens)

    TOKENS:
    while (!tokenIterator.next().done) {
      const token = tokenIterator.value

      switch (token.type) {
        case 'reserved':
        case 'keyword':
          switch (token.value) {
            case 'CREATE':
              // CREATE [OR REPLACE]?
              this.create = new SyntaxNode(token)
              this.children.push(this.create)

              if (tokenIterator.expect('OR', 'REPLACE')) {
                this.create.push(tokenIterator.next().value)
                this.create.push(tokenIterator.next().value)
              }

              continue TOKENS

            case 'PACKAGE':
            case 'TYPE':
              // [PACKAGE|TYPE] [BODY]?
              this.objectType = new SyntaxNode(token)
              this.children.push(this.objectType)

              if (tokenIterator.expect('BODY')) {
                this.objectType.push(tokenIterator.next().value)
              }

              continue TOKENS

            case 'AUTHID':
              this.authid = new SyntaxNode(token)
              this.children.push(this.authid)

              if (tokenIterator.expect(['DEFINER', 'CURRENT_USER'])) {
                this.authid.push(tokenIterator.next().value)
              }

              continue TOKENS

            case 'ACCESSIBLE':
              {
                this.accessibleBy = new SyntaxNode(token)
                this.children.push(this.accessibleBy)

                if (tokenIterator.expect('BY')) {
                  this.accessibleBy.push(tokenIterator.next().value)
                }

                if (tokenIterator.expect('(')) {
                  // LATER: differentiate type, identifier
                  while (!tokenIterator.next().done) {
                    this.accessibleBy.push(tokenIterator.value)
                    if (tokenIterator.is(')')) {
                      // Found closing paren
                      break
                    }
                  }
                }

                console.log('... => ', this.accessibleBy.toString())
                continue TOKENS
              }
            case 'IS':
            case 'AS':
              this.is = new SyntaxNode(token)
              this.children.push(this.is)
              console.log('... => ', this.is.toString())
              continue TOKENS
          }
          break
        case 'identifier':
          this.name = new IdentifierSyntaxNode(token)
          this.children.push(this.name)

          while (tokenIterator.expect({ type: 'period' }, { type: 'identifier' })) {
            console.log('... peek: part of compound identifier')
            this.name.push(tokenIterator.next().value, tokenIterator.next().value)
          }
          console.log('... => ', this.name.toString())
          continue TOKENS

        default:
      }

      console.warn('create: unexpected token', token)
      this.children.push(token)
    }
  }
}

class IdentifierSyntaxNode extends SyntaxNode {
  toString() {
    return [...this.getTokens()].join('')
  }
}
