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
    const tokens = [this.readNextTokenWhen({ type: 'identifier' })]

    let /** @type {Token[]?} */ nextTokens
    while (nextTokens = this.tryReadNextTokensIf({ type: 'period' }, { type: 'identifier' })) {
      console.log('... peek: part of compound identifier')
      tokens.push(...nextTokens)
    }

    const identifier = new IdentifierSyntaxNode(...tokens)
    console.log('... => ', identifier.toString())

    return identifier
  }

  // AUTHID [DEFINER|CURRENT_USER]
  #tryReadNextAsAuthidClause() {
    let tokens = this.tryReadNextTokensIf('AUTHID', { type: 'identifier' })
    return tokens ? new SyntaxNode(tokens) : null
  }

  // ACCESSIBLE BY (...)
  #tryReadNextAsAccessibleByClause() {
    let tokens = this.tryReadNextTokensIf('ACCESSIBLE', 'BY', '(')
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

  #readNextAsPackageSpecContent() {
    throw this.#notImplemented('Package spec content')
  }

  #readNextAsPackageSpec() {
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
    return new PlsqlObjectStatementSyntaxNode(name, authid, accessibleBy, is, this.#readNextAsPackageSpecContent());
  }

  #readNextAsTypeSpec() {
    throw this.#notImplemented('Type spec')
  }

  #readNextWhenStatementType() {
    let next = null
    if (next = this.tryReadNextTokensIf(['TYPE', 'PACKAGE'], 'BODY')) {
      // PACKAGE BODY, TYPE BODY
      return new SyntaxNode(...next)
    }

    if (next = this.tryReadNextTokensIf('MATERIALIZED', 'VIEW')) {
      return new SyntaxNode(...next)
    }

    // General case
    return new SyntaxNode(this.readNextTokenWhen([{ type: 'reserved' }, { type: 'keyword' }]))
  }

  #readAsCreateStatement(token) {
    // CREATE
    this.verify({ type: 'reserved', value: 'CREATE' }, token)
    const create = new SyntaxNode(token)

    let next = null

    // OR REPLACE
    if (next = this.tryReadNextTokensIf('OR', 'REPLACE')) {
      create.push(...next)
    }

    // <object-type>
    const objectType = this.#readNextWhenStatementType()
    switch (objectType.value) {
      case 'FUNCTION':
      case 'PROCEDURE':
        return new CreateStatementSyntaxNode(create, objectType, this.#readNextAsProcedure())
      case 'PACKAGE':
        return new CreateStatementSyntaxNode(create, objectType, this.#readNextAsPackageSpec())
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

            case 'SUBTYPE':
            case 'TYPE':
            case 'EXCEPTION':
              return this.#readAsContainedStatement(token)
            case 'PROCEDURE':
            case 'FUNCTION':
              return this.#readAsProcedureStart(token)

            case 'END':
              return this.#readAsEndOfBlock(token)

            // Other SQL statements
            case 'GRANT':
              return this.#readAsSqlStatement(token)
          }
          break;

        case 'keyword':
          switch (token.value) {
            // TODO package/proc/func
            case 'PRAGMA':
              return this.#readAsContainedStatement(token)
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
          return new SyntaxNode(token)
      }

      // Fallthrough logic, read for a semicolon or a slash.
      console.warn('unrecognized token', token)
      return this.#readAsEndOfBlock()
    }
  }
}
exports.PlsqlNodeReader = PlsqlNodeReader

class NamedStatementSyntaxNode extends StatementSyntaxNode {
  /** @property {string} name */

  /**
   * @param {Token|string} name
   */
  constructor(name) {
    super({ name })
  }

}

class PlsqlObjectStatementSyntaxNode extends NamedStatementSyntaxNode {
  /** @property {string} name */
  /** @type {SyntaxNode} */ authid
  /** @type {SyntaxNode} */ accessibleBy
  /** @type {SyntaxNode} */ is
  /** @type {SyntaxNode} */ content

  constructor(name, authid, accessibleBy, is, content) {
    super(name, { authid, accessibleBy, is, content })
  }
}

class CreateStatementSyntaxNode extends StatementSyntaxNode {
  /** @property {string} create */
  /** @property {string} objectType */
  /** @property {ObjectStatementSyntaxNode} objectStatement */

  get name() {
    return this.objectStatement.name
  }

  // /** @type {SyntaxNode} */ authid
  // /** @type {SyntaxNode} */ accessibleBy
  // /** @type {SyntaxNode} */ is

  /**
   *
   * @param {SyntaxNode} create
   * @param {SyntaxNode} objectType
   * @param {NamedStatementSyntaxNode} objectStatement
   */
  constructor(create, objectType, objectStatement) {
    super({ create, objectType, objectStatement })
  }
}
