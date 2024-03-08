const {
  ExpressionSyntaxNode,
  IdentifierSyntaxNode,
  StatementSyntaxNode,
  SyntaxNode,
  SyntaxNodeOrToken,
  SyntaxNodeReader,
  Token,
  TokenLike
} = require('../syntax')

/**
 * Patterns for reserved words.
 */
class Patterns {
  static IS = { type: 'reserved', value: 'IS' }
  static AS = { type: 'reserved', value: 'AS' }

  static CONSTANT = { type: 'keyword', value: 'CONSTANT' }

  static PERIOD = { type: 'period' }

  static IDENTIFIER = { type: 'identifier' }
  static RESERVED = { type: 'reserved' }
  static KEYWORD = { type: 'keyword' }

  static ASSIGNMENT = { type: 'assignment', value: ':=' }
  static DEFAULT = { type: 'reserved', value: 'DEFAULT' }

  static ANY_KEYWORD = [Patterns.RESERVED, Patterns.KEYWORD]

  static ANY_IDENTIFIER = [Patterns.IDENTIFIER, Patterns.KEYWORD]

  static IS_OR_AS = [Patterns.IS, Patterns.AS]

  static FUNCTION = { type: 'reserved', value: 'FUNCTION' }
  static PROCEDURE = { type: 'reserved', value: 'PROCEDURE' }
}

/**
 * @typedef {SyntaxNodeOrToken | SyntaxNodeOrToken[]} NodeParamValue
 * @typedef {[key: string]: NodeParamValue} NamedNodeParams
 *
 */

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
    const token = this.tryReadNextToken(Patterns.ANY_IDENTIFIER)
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
    const token = this.readNextToken(Patterns.ANY_IDENTIFIER)
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
              yield this.#readAsContainedStatement(token)
              continue
            case 'EXCEPTION':
              yield this.#readAsContainedStatement(token)
              continue
            case 'PRAGMA':
              yield this.#readAsContainedStatement(token)
              continue
            case 'PROCEDURE':
              yield this.#readAsProcedureDeclaration(token)
              continue
            case 'FUNCTION':
              yield this.#readAsFunctionDeclaration(token)
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

      // Just treat this as an identifier, it's probably a constant or variable
      yield this.#readAsVariableDeclaration(token)
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
        case 'BLOB':
        case 'CLOB':
        case 'DATE':
        case 'INTEGER':
        case 'POSITIVE':
          return new ExpressionSyntaxNode({ name: token })
        case 'RAW':
        case 'VARCHAR':
        case 'VARCHAR2': {
          const lparen = this.tryReadNextToken('(')
          if (lparen) {
            return new ExpressionSyntaxNode({
              name: token,
              lparen: lparen,
              length: this.readNextToken({ type: 'number' }),
              rparen: this.readNextToken(')'),
            })
          } else {
            return new ExpressionSyntaxNode({ name: token })
          }
        }
        case 'NUMBER': {
          const lparen = this.tryReadNextToken('(')
          if (lparen) {
            const precision = this.readNextToken([{ type: 'number' }, '*']) // e.g. `NUMBER(*,0)`
            const comma = this.tryReadNextToken(',')
            const scale = comma ? this.readNextToken({ type: 'number' }) : null
            return new ExpressionSyntaxNode({
              name: token,
              lparen,
              precision, comma, scale,
              rparen: this.readNextToken(')'),
            })
          } else {
            return new ExpressionSyntaxNode({ name: token })
          }
        }
        default:
          console.warn('handle this type', token.value)
          return this.#readCurrentAsIdentifier(token)
      }
    }

    return this.readNextAsIdentifier()
  }

  #readNextAsValueExpression() {
    const token = this.readNextToken()
    switch (token.type) {
      case 'string':
      case 'number':
        return new SyntaxNode(token)
      case 'reserved':
      case 'keyword':
        switch (token.value) {
          case 'NULL':
            return new SyntaxNode(token)
          default:
            console.warn('default value res/kw', token)
            return new SyntaxNode(token)
        }
      default:
        console.warn('default value other', token)
        return new SyntaxNode(token)
    }
  }

  #tryReadNextAsReturnDeclaration() {
    const keyword = this.tryReadNextToken('RETURN')
    if (!keyword) {
      return null
    }

    const type = this.#readNextAsTypeExpression() // yeah this means we eat `varchar2(x)` but who cares.
    const pipelined = this.tryReadNextToken('PIPELINED')

    return new ReturnDeclarationExpressionSyntaxNode({
      keyword,
      type,
      pipelined
    })
  }

  #tryReadNextAsInMode() {
    return SyntaxNode.asSyntaxNode(this.tryReadNextToken('IN'))
  }

  #tryReadNextAsOutMode() {
    let outMode = this.tryReadNextToken('OUT')
    if (!outMode) {
      return null
    }

    return new SyntaxNode(outMode, nocopy)

  }

  #tryReadNextAsParameterDeclaration() {
    const name = this.tryReadNextAsIdentifier()
    if (!name) {
      return null
    }

    // there's probably more.
    const inMode = this.#tryReadNextAsInMode()
    const outMode = this.#tryReadNextAsOutMode()
    const type = this.#readNextAsTypeExpression()

    const defaultExpr = this.tryReadNextToken(Patterns.DEFAULT)
    const defaultValue = defaultExpr ? this.#readNextAsValueExpression() : null

    return new ParameterDeclarationExpressionSyntaxNode({ name, in: inMode, out: outMode, type, defaultExpr, defaultValue })
  }

  #readNextAsParameterDeclaration() {
    const param = this.#tryReadNextAsParameterDeclaration()
    if (param) {
      return param
    }
    throw new Error(`Expected: parameter`)
  }

  *#tryReadNextAsParameterDeclarationsWithCommas() {
    let param = this.#tryReadNextAsParameterDeclaration()
    if (!param) {
      return
    }

    yield param

    let comma
    while (param && (comma = this.tryReadNextToken(','))) {
      yield comma
      yield param = this.#readNextAsParameterDeclaration()
    }
  }

  #tryReadNextAsParameterListDeclaration() {
    const lparen = this.tryReadNextToken('(')
    if (!lparen) {
      return null
    }

    return new ParameterListDeclarationExpressionSyntaxNode(
      lparen,
      [...this.#tryReadNextAsParameterDeclarationsWithCommas()],
      this.readNextToken(')')
    )
  }

  #readAsFunctionDeclaration(keyword) {
    this.verify(Patterns.FUNCTION, keyword)

    return new FunctionDeclarationStatementSyntaxNode({
      keyword,
      name: this.readNextAsIdentifier(),
      parameters: this.#tryReadNextAsParameterListDeclaration(),
      return: this.#tryReadNextAsReturnDeclaration(),
      rest: this.readNextTokensUntil(';')
    })
  }

  #readAsProcedureDeclaration(keyword) {
    this.verify(Patterns.PROCEDURE, keyword)

    return new ProcedureDeclarationStatementSyntaxNode({
      keyword,
      name: this.readNextAsIdentifier(),
      parameters: this.#tryReadNextAsParameterListDeclaration(),
      rest: this.readNextTokensUntil(';')
    })
  }

  #readAsSubtypeDeclaration(token) {
    // https://docs.oracle.com/en/database/oracle/oracle-database/19/lnpls/block.html#GUID-9ACEB9ED-567E-4E1A-A16A-B8B35214FC9D
    this.verify({ value: 'SUBTYPE' }, token)

    return new SubtypeDeclarationStatementSyntaxNode({
      node: token,
      name: this.readNextAsIdentifier(),
      is: this.readNextToken(Patterns.IS),
      specification: this.#readNextAsTypeExpression(),
      rest: this.readNextTokensUntil(';')
    })
  }

  /**
   * Read as variable or constant.
   */
  #readAsVariableDeclaration(token) {
    const name = this.#readCurrentAsIdentifier(token)

    const constant = this.tryReadNextToken(Patterns.CONSTANT)
    const type = this.#readNextAsTypeExpression()

    const defaultExpr = this.tryReadNextToken([Patterns.ASSIGNMENT, Patterns.DEFAULT])
    const defaultValue = defaultExpr ? this.#readNextAsValueExpression() : null

    return new VariableDeclarationStatementSyntaxNode({
      name,
      constant,
      type,
      default: defaultExpr,
      defaultValue,
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

class VariableDeclarationStatementSyntaxNode extends StatementSyntaxNode {
  /** @property {SyntaxNode} name */
  /** @property {SyntaxNode} constant */
  /** @property {SyntaxNode} type */
  /** @property {SyntaxNode} default */
  /** @property {SyntaxNode} defaultValue */
  /** @property {SyntaxNode?} rest */

  /**
   * @param {object} params
   * @property {SyntaxNode} constant
   */
  constructor({ name, constant, type, default: defaultNode, defaultValue, rest }) {
    super({ name, constant, type, default: defaultNode, defaultValue, rest })
  }

  get isConstant() {
    return !!this.constant
  }
}

class TypeDeclarationStatementSyntaxNode extends StatementSyntaxNode { }
exports.TypeDeclarationStatementSyntaxNode = TypeDeclarationStatementSyntaxNode

class SubtypeDeclarationStatementSyntaxNode extends TypeDeclarationStatementSyntaxNode {
  constructor({ node, name, is, specification, rest }) {
    super({ node, name, is, specification, rest })
  }
}

class ProcedureDeclarationStatementSyntaxNode extends StatementSyntaxNode {
  /** @type {SyntaxNode} */ keyword
  /** @type {string} A unique ID for this procedure within context. */ id
  /** @type {IdentifierSyntaxNode} The procedure name. */ name
  /** @type {ParameterListDeclarationExpressionSyntaxNode?} The procedure name. */ parameters

  /**
   * @param {TokenLike} token  The initial token (`PROCEDURE`)
   * @property {IdentifierSyntaxNode} name
   * @property {ParameterListDeclarationExpressionSyntaxNode?} parameters
   * @property {SyntaxNode?} rest
   */
  constructor({ keyword, name, parameters, rest }) {
    super()
    this.add({ keyword, name, parameters, rest })
  }
}

class FunctionDeclarationStatementSyntaxNode extends StatementSyntaxNode {
  /** @type {SyntaxNode} */ keyword
  /** @type {string} A unique ID for this procedure within context. */ id
  /** @type {IdentifierSyntaxNode} The procedure name. */ name
  /** @type {ParameterListDeclarationExpressionSyntaxNode?} The procedure name. */ parameters

  /**
   * @param {TokenLike} token  The initial token (`FUNCTION`)
   * @param {IdentifierSyntaxNode} name
   * @param {ParameterListDeclarationExpressionSyntaxNode?} parameters
   * @param {ReturnDeclarationExpressionSyntaxNode} return
   * @param {SyntaxNode?} rest
   */
  constructor({ keyword, name, parameters, return: returnClause, rest }) {
    super()
    this.add({ keyword, name, parameters, return: returnClause, rest })
  }
}

class ParameterDeclarationExpressionSyntaxNode extends ExpressionSyntaxNode {

  /** @property {IdentifierSyntaxNode} */ name
  /** @property {SyntaxNode[]} */ mode
  /** @property {SyntaxNode} */ type
  /** @property {SyntaxNode?} */ defaultExpr
  /** @property {SyntaxNode?} */ defaultValue

  constructor({ name, in: inQualifier, out: outQualifier, type, defaultExpr, defaultValue }) {
    super()
    this.add({
      name,
      mode: [inQualifier, outQualifier].filter(x => x),
      type,
      defaultExpr,
      defaultValue
    })
  }
}
exports.ParameterDeclarationExpressionSyntaxNode = ParameterDeclarationExpressionSyntaxNode

class ReturnDeclarationExpressionSyntaxNode extends ExpressionSyntaxNode {

  /** @property {SyntaxNode} */ type
  /** @property {SyntaxNode?} */ pipelined

  constructor({ keyword, type, pipelined }) {
    super()
    this.add({
      keyword,
      type,
      pipelined
    })
  }
}
exports.ReturnDeclarationExpressionSyntaxNode = ReturnDeclarationExpressionSyntaxNode

class ParameterListDeclarationExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {ParameterDeclarationExpressionSyntaxNode[]} */ parameters

  constructor(lparen, parametersWithCommas, rparen) {
    super()
    this.push(lparen, ...parametersWithCommas, rparen)
    this.parameters = parametersWithCommas.filter(x => x instanceof ParameterDeclarationExpressionSyntaxNode)
  }
}
exports.ParameterListDeclarationExpressionSyntaxNode = ParameterListDeclarationExpressionSyntaxNode
