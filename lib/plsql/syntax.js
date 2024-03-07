const { SyntaxNode, SyntaxNodeReader, IdentifierSyntaxNode, StatementSyntaxNode, TokenIterator, TokenPattern } = require('../syntax')
/** @typedef {import('../syntax').Token} Token */

/**
 * Patterns for reserved words.
 */
class Patterns {
  static IS = { type: 'reserved', value: 'IS' }
  static AS = { type: 'reserved', value: 'AS' }

  static PERIOD = { type: 'period' }

  static IDENTIFIER = { type: 'identifier' }
  static RESERVED = { type: 'reserved' }
  static KEYWORD = { type: 'keyword' }

  static ANY_KEYWORD = [Patterns.RESERVED, Patterns.KEYWORD]

  static ANY_IDENTIFIER = [Patterns.IDENTIFIER, Patterns.KEYWORD]

  static IS_OR_AS = [Patterns.IS, Patterns.AS]
}

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

  #readCurrentAsIdentifier(token) {
    const tokens = [token]
    let /** @type {Token[]?} */ nextTokens
    while (nextTokens = this.tryReadNextTokens(Patterns.PERIOD, Patterns.ANY_IDENTIFIER)) {
      tokens.push(...nextTokens)
    }

    return new IdentifierSyntaxNode(...tokens)
  }

  tryReadNextAsIdentifier() {
    const token = this.tryReadNextToken(Patterns.IDENTIFIER)
    if (!token) {
      return null
    }

    return this.#readCurrentAsIdentifier(token)
  }

  /**
   * Reads an identifier node next.
   * @returns {IdentifierSyntaxNode}
   */
  readNextAsIdentifier() {
    const token = this.readNextToken(Patterns.IDENTIFIER)
    return this.#readCurrentAsIdentifier(token)
  }

  // AUTHID [DEFINER|CURRENT_USER]
  #tryReadNextAsAuthidClause() {
    let tokens = this.tryReadNextTokens('AUTHID', Patterns.KEYWORD)
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
    while (token = this.tryReadNextToken([Patterns.ANY_KEYWORD, Patterns.IDENTIFIER])) {
      switch (token.type) {
        case 'reserved':
        case 'keyword':
          switch (token.value) {
            case 'SUBTYPE':
              yield this.#readAsSubtypeDeclaration(token)
              continue
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

  /**
   * Read until we find addoc comment.
   */
  *#tryReadUpToNextDocComment() {
    // Read individual tokens.
    // If we hit a doc comment, stop.
    let result
    while ((result = this.iterator.nextIf([{ isTrivia: true }])).match) {
      yield result.value
      if (result.value.type === 'comment.doc') {
        break
      }
    }
  }

  #readNextAsPackageSpec(create, objectType) {
    // <identifier>
    const name = this.readNextAsIdentifier()

    let authid = this.#tryReadNextAsAuthidClause()
    let accessibleBy = this.#tryReadNextAsAccessibleByClause()

    // IS|AS.
    // For this we also want to read any possible trivial tokens up to and including a doc comment.
    // This is because Oracle understandably doesn't recognize comments before the CREATE statement as part of the package and it throws off line numbers, etc.
    const tokens = this.readNextTokensUntil(Patterns.IS_OR_AS)
    const is = new SyntaxNode(...tokens, this.#tryReadUpToNextDocComment())

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
    return new SyntaxNode(this.readNextToken(Patterns.ANY_KEYWORD))
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

  #readNextAsTypeExpression() {
    let token
    if (token = this.tryReadNextToken(Patterns.ANY_KEYWORD)) {
      switch (token.value) {
        case 'VARCHAR':
        case 'VARCHAR2':
          return new StatementSyntaxNode({
            name: token,
            lparen: this.readNextToken('('),
            length: this.readNextToken({ type: 'number' }),
            rparen: this.readNextToken(')'),
          })
        default:
          console.warn('handle this type', token.value)
          return this.#readCurrentAsIdentifier(token)
      }
    }

    return this.readNextAsIdentifier()
  }

  #readAsSubtypeDeclaration(token) {
    // https://docs.oracle.com/en/database/oracle/oracle-database/19/lnpls/block.html#GUID-9ACEB9ED-567E-4E1A-A16A-B8B35214FC9D
    this.verify({ value: 'SUBTYPE' }, token)
    return new StatementSyntaxNode({
      type: token,
      name: this.readNextAsIdentifier(),
      is: this.readNextToken(Patterns.IS),
      specification: this.#readNextAsTypeExpression(),
      rest: this.readNextTokensUntil(';')
    })
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
    while (!this.iterator.nextNonTrivial().done) {
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
  /** @property {SyntaxNode} create */
  /** @property {SyntaxNode} objectType */
  /** @property {SyntaxNode} name */
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
    yield* super.getDocumentComments()

    // Get the doc comment trailing IS/AS, if any.
    for (const token of this.is.getTrailingTrivia()) {
      if (token.type === 'comment.doc') {
        yield token
      }
    }
  }
}

class EmptyStatementSyntaxNode extends StatementSyntaxNode {
  constructor(slash) {
    super({ slash })
  }
}
