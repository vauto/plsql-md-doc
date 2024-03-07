const { SyntaxNode, SyntaxNodeReader, IdentifierSyntaxNode, StatementSyntaxNode, TokenIterator, TokenPattern } = require('../syntax')
/** @typedef {import('../syntax').Token} Token */

class PlsqlNodeReader extends SyntaxNodeReader {
  // ---------

  /**
   * Reads N more tokens
   * @param {integer} count
   * @returns {Generator<Token>}
   */
  *#readNextTokens(count) {
    for (let i = 0; i < count; i++) {
      yield this.readNextToken()
    }
  }

  /**
   * Reads an identifier node next.
   * @returns {IdentifierSyntaxNode}
   */
  readNextWhenIdentifier() {
    const tokens = [this.readNextToken({ type: 'identifier' })]

    let /** @type {Token[]?} */ nextTokens
    while (nextTokens = this.tryReadNextTokens({ type: 'period' }, { type: 'identifier' })) {
      tokens.push(...nextTokens)
    }

    return new IdentifierSyntaxNode(...tokens)
  }

  // AUTHID [DEFINER|CURRENT_USER]
  #tryReadNextAsAuthidClause() {
    let tokens = this.tryReadNextTokens('AUTHID', { type: 'keyword' })
    return tokens ? new SyntaxNode(tokens) : null
  }

  // ACCESSIBLE BY (...)
  #tryReadNextAsAccessibleByClause() {
    let tokens = this.tryReadNextTokens('ACCESSIBLE', 'BY', '(')
    if (!tokens) {
      return null
    }
    // LATER: differentiate contents of procedure [[TYPE]? <identifier>, ...]
    return new SyntaxNode(...next, ...this.readNextTokensUntil(')'))
  }

  #notImplemented(description = 'This method') { return new Error(`${description} is not implmented`) }

  #readNextAsProcedure() {
    throw this.#notImplemented('Procedure/function object type')
  }

  *#readNextAsPackageSpecContent() {
    let token
    while (token = this.tryReadNextToken([{ type: 'reserved' }, { type: 'keyword' }, { type: 'identifier' }])) {
      switch (token.type) {
        case 'reserved':
        case 'keyword':
          switch (token.value) {
            case 'SUBTYPE':
            case 'TYPE':
            case 'EXCEPTION':
            case 'PRAGMA':
            case 'PROCEDURE':
            case 'FUNCTION':
              yield this.#readAsContainedStatement(token)
              continue
            case 'END':
              yield this.#readAsEndOfBlock(token)
              continue
          }
          break
      }

      // At this point we MAY have an identifier or a keyword being used as an identifier.
      if (token.type === 'reserved') {
        console.warn('unexpected reserved word in package spec', token)
        yield this.#readAsContainedStatement(token)
        continue
      }

      // Just treat this as an identifier.
      // LATER: this is probably a variable
      yield this.#readAsContainedStatement(token)
    }
  }

  #readNextAsPackageSpec(create, objectType) {
    // <identifier>
    const name = this.readNextWhenIdentifier()

    let authid = this.#tryReadNextAsAuthidClause()
    let accessibleBy = this.#tryReadNextAsAccessibleByClause()

    // IS|AS
    const is = new SyntaxNode(this.readNextTokensUntil([
      { type: 'reserved', value: 'IS' },
      { type: 'reserved', value: 'AS' }
    ]))

    // ...content...
    return new CreatePackageStatementSyntaxNode(create, objectType, name, authid, accessibleBy, is, ...this.#readNextAsPackageSpecContent());
  }

  #readNextAsTypeSpec() {
    throw this.#notImplemented('Type spec')
  }

  #readNextWhenStatementType() {
    let next = null
    if (next = this.tryReadNextTokens(['TYPE', 'PACKAGE'], 'BODY')) {
      // PACKAGE BODY, TYPE BODY
      return new SyntaxNode(...next)
    }

    if (next = this.tryReadNextTokens('MATERIALIZED', 'VIEW')) {
      return new SyntaxNode(...next)
    }

    // General case
    return new SyntaxNode(this.readNextToken([{ type: 'reserved' }, { type: 'keyword' }]))
  }

  #readAsCreateStatement(token) {
    // CREATE
    this.verify({ type: 'reserved', value: 'CREATE' }, token)
    const create = new SyntaxNode(token)

    let next = null

    // OR REPLACE
    if (next = this.tryReadNextTokens('OR', 'REPLACE')) {
      create.push(...next)
    }

    // <object-type>
    const objectType = this.#readNextWhenStatementType()
    switch (objectType.value) {
      case 'FUNCTION':
      case 'PROCEDURE':
        return new CreateStatementSyntaxNode(create, objectType, this.#readNextAsProcedure())
      case 'PACKAGE':
        return this.#readNextAsPackageSpec(create, objectType)
      case 'TYPE':
        return new CreateStatementSyntaxNode(create, objectType, this.#readNextAsTypeSpec())
      default:
        throw this.#notImplemented(`Object type ${objectType.value}`)
    }

  }

  #readAsContainedStatement(token) {
    return new SyntaxNode(token, ...this.readNextTokensUntil(';'))
  }

  #readAsProcedureStart(token) {
    return new SyntaxNode(token, ...this.readNextTokensUntil([';', 'IS', 'AS']))
  }

  #readAsEndOfBlock(token) {
    return new SyntaxNode(token, ...this.readNextTokensUntil([';', '/']))
  }

  // Read as an opaque SQL statement.
  #readAsSqlStatement(token) {
    return new SyntaxNode(token, ...this.readNextTokensUntil([';', '/']))
  }

  #tryReadAsShowErrors(token) {
    const tokens = this.tryReadTokensIf(token, 'SHOW', 'ERRORS')
    if (tokens) {
      return new SyntaxNode(tokens)
    }

    return null
  }

  /**
   * @returns {SyntaxNode?}
   */
  read() {
    while (!this.iterator.next().done) {
      const token = this.iterator.value
      if (token.isTrivia) {
        // The content is of trivia tokens only, and probably the last one.
        return new SyntaxNode(token)
      }

      switch (token.type) {
        case 'reserved':
          switch (token.value) {
            case 'CREATE':
              // CREATE [OR REPLACE] [PACKAGE|TYPE]
              return this.#readAsCreateStatement(token)

            // Other SQL statements
            case 'GRANT':
              return this.#readAsSqlStatement(token)
          }
          break;

        case 'keyword':
          switch (token.value) {
            case 'SHOW':
              // SQL*Plus command SHOW ERRORS maybe?
              let node = this.#tryReadAsShowErrors(token)
              if (node) {
                return node
              }
            default:
              console.warn('unexpected keyword', token.value)
              return this.#readAsSqlStatement(token)
          }
          break;

        case 'slash':
          return new EmptyStatementSyntaxNode(token)
      }

      // Fallthrough logic, read for a semicolon or a slash.
      console.warn('unrecognized token', token)
      return this.#readAsEndOfBlock(token)
    }
  }
}
exports.PlsqlNodeReader = PlsqlNodeReader

class CreateStatementSyntaxNode extends StatementSyntaxNode {
  /** @property {string} create */
  /** @property {string} objectType */
  /** @property {string} name */
  /** @property {SyntaxNode[]} */ content

  /**
   * @param {SyntaxNode} create
   * @param {SyntaxNode} objectType
   * @param {SyntaxNode} name
   * @param {SyntaxNode[]} content
   */
  constructor(create, objectType, name, ...content) {
    super({ create, objectType, name, content })
  }
}

class CreatePackageStatementSyntaxNode extends StatementSyntaxNode {
  /** @property {string} create */
  /** @property {string} objectType */
  /** @property {string} name */
  /** @property {SyntaxNode?} authid */
  /** @property {SyntaxNode?} accessibleBy */
  /** @property {SyntaxNode} is */
  /** @property {SyntaxNode[]} content */

  constructor(create, objectType, name, authid, accessibleBy, is, ...content) {
    super({ create, objectType, name, authid, accessibleBy, is })
    this.push(...content)
    this.content = content
  }

  /** @override */
  *getDocumentComments() {
    const leading = [... super.getDocumentComments()]

    if (leading.length === 0) {
      // No doc comments outside (which is good -- Oracle doesn't recognize those as part of the package and it throws off line numbers, etc.)
      // Get first doc comment (and ONLY first doc comment) inside.
      for (const trivia of this.getAllTrivia()) {
        if (trivia.type === 'comment.doc') {
          yield trivia
          break
        }
      }
    }
  }
}

class EmptyStatementSyntaxNode extends StatementSyntaxNode {
  constructor(slash) {
    super({ slash })
  }
}
