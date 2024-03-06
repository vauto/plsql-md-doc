const { SyntaxNode, SyntaxNodeReader, IdentifierSyntaxNode, StatementSyntaxNode, SyntaxNodeFactory, TokenIterator, TokenPattern } = require('../syntax')
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

  #readAsCreateStatementStart(token) {
    // CREATE
    this.verify({ type: 'reserved', value: 'CREATE' }, token)
    const create = new SyntaxNode(token)

    let nextTokens = null

    // OR REPLACE
    if (nextTokens = this.tryReadNextTokensIf('OR', 'REPLACE')) {
      create.push(...nextTokens)
    }

    // <object-type>
    const objectType = new SyntaxNode()
    if (nextTokens = this.tryReadNextTokensIf(['PROCEDURE', 'FUNCTION'])) {
      // [PROCEDURE|FUNCTION]
      objectType.push(nextTokens)
    }
    else if (nextTokens = this.tryReadNextTokensIf(['PACKAGE', 'TYPE'])) {
      // [PACKAGE|TYPE] [BODY]?
      objectType.push(nextTokens)
      if (nextTokens = this.tryReadNextTokensIf('BODY')) {
        objectType.push(nextTokens)
      }
    } else {
      // some other type. oy.
      throw new Error(`Object type ${this.readNextToken()} not implemented`)
    }

    // <identifier>
    const name = this.readNextWhenIdentifier()

    // AUTHID [DEFINER|CURRENT_USER]
    let authid = null
    if (nextTokens = this.tryReadNextTokensIf('AUTHID', { type: 'identifier' })) {
      authid = new SyntaxNode(nextTokens)
    }

    // ACCESSIBLE BY (...)
    let accessibleBy = null
    if (nextTokens = this.tryReadNextTokensIf('ACCESSIBLE', 'BY', '(')) {
      // LATER: differentiate type, identifier
      accessibleBy = new SyntaxNode(...nextTokens, ...this.readNextTokensUntil(')'))
    }

    // IS|AS
    const is = new SyntaxNode(this.readNextTokensUntil([
      { type: 'reserved', value: 'IS' },
      { type: 'reserved', value: 'AS' }
    ]))

    return new PlsqlCreateStatementSyntaxNode(create, objectType, name, authid, accessibleBy, is);
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
              return this.#readAsCreateStatementStart(token)

            case 'SUBTYPE':
            case 'TYPE':
            case 'EXCEPTION':
              return this.#readAsContainedStatement(token)
            case 'PROCEDURE':
            case 'FUNCTION':
              return this.#readAsProcedureStart(token)

            case 'END':
              return this.#readAsEndOfBlock(token)
          }
          break;

        case 'slash':
          return new SyntaxNode(token)

        case 'identifier':
          // Some SQL*Plus command, probably 'SHOW ERRORS'.
          let node = this.#tryReadAsShowErrors(token)
          if (node) {
            return node
          }

          break
      }

      // Fallthrough logic, read for a semicolon or a slash.
      console.warn('unrecognized token', token)
      return this.#readAsEndOfBlock()
    }
  }
}

class PlsqlSyntaxNodeFactory extends SyntaxNodeFactory {

  /**
   *
   * @param {Iterator<Token>} tokens
   * @returns {Generator<SyntaxNode>}
   */
  *toSyntax(tokens) {
    const reader = new PlsqlNodeReader(tokens)
    let node = null
    while (node = reader.read()) {
      yield node
    }

  }
}

exports.PlsqlSyntaxNodeFactory = PlsqlSyntaxNodeFactory

class PlsqlCreateStatementSyntaxNode extends StatementSyntaxNode {
  /** @type {SyntaxNode} */ create
  /** @type {SyntaxNode} */ objectType
  /** @type {IdentifierSyntaxNode} */ name
  /** @type {SyntaxNode} */ authid
  /** @type {SyntaxNode} */ accessibleBy
  /** @type {SyntaxNode} */ is

  constructor(create, objectType, name, authid, accessibleBy, is) {
    super({ create, objectType, name, authid, accessibleBy, is })
  }
}
