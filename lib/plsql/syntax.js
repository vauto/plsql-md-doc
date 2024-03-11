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

  static PERIOD = { type: 'operator', value: '.' }
  static COMMA = { type: 'operator', value: ',' }
  static LPAREN = { type: 'operator', value: '(' }
  static RPAREN = { type: 'operator', value: ')' }

  static IDENTIFIER = { type: 'identifier' }
  static KEYWORD = { type: 'keyword' }
  static NUMBER = { type: 'number' }
  static OPERATOR = { type: 'operator' }
  static RESERVED = { type: 'reserved' }

  static ASSIGNMENT = { type: 'operator', value: ':=' }
  static DEFAULT = { type: 'reserved', value: 'DEFAULT' }

  // Loose reserved/keyword matching
  static ANY_KEYWORD = [Patterns.RESERVED, Patterns.KEYWORD]

  // Loose identifier matching (allows keywords)
  static ANY_IDENTIFIER = [Patterns.IDENTIFIER, Patterns.KEYWORD]

  // Loose operator matching
  static ANY_OPERATOR = Patterns.OPERATOR
  static BINARY_OPERATOR = [
    '+', '-', '*', '/',
    '<', '=', '>', '<=', '>=', '<>', '!=',
    '=>',
    '||'
  ]

  static IS_OR_AS = [Patterns.IS, Patterns.AS]

  static FUNCTION = { type: 'reserved', value: 'FUNCTION' }
  static PROCEDURE = { type: 'reserved', value: 'PROCEDURE' }
  static PACKAGE = { type: 'keyword', value: 'PACKAGE' } // yes, it's keyword.
  static TRIGGER = { type: 'reserved', value: 'TRIGGER' }
  static TYPE = { type: 'reserved', value: 'TYPE' }

  static PLSQL_UNIT_KIND = [
    Patterns.FUNCTION, Patterns.PROCEDURE, Patterns.PACKAGE, Patterns.TRIGGER, Patterns.TYPE
  ]


  static EDITIONABLE = { type: 'keyword', value: 'EDITIONABLE' }
  static EDITIONING = { type: 'keyword', value: 'EDITIONING' }
  static NONEDITIONABLE = { type: 'keyword', value: 'NONEDITIONABLE' }
}

/**
 * @interface PlsqlIdentifier
 */

class PlsqlIdentifier {
  /** @type {string} */ text
  /** @type {string} */ value

  /**
   * @param {Token} token
   */
  constructor(token) {
    this.text = token.text
    this.value = token.value
  }

  /**
   * @inheritdoc String.length
   * @param {PlsqlIdentifier} compareIdentifier
   */
  get length() {
    return this.text.length
  }

  toString(format = 'T') {
    switch (format?.toUpperCase()) {
      case 'T':
        return this.text
      case 'V':
      default:
        return this.value
    }
  }
}

/**
 * @interface PlsqlName
 */

/** @implements {PlsqlName} */
class PlsqlItemName {

  /**
   * @param  {IdentifierSyntaxNode} node
   */
  constructor(node) {
    const parts = node.parts.map(t => new PlsqlIdentifier(t))
    switch (parts.length) {
      case 1:
        this.name = parts[0]
        break
      default:
        throw new Error(`Unsupported parts count: ${node.parts.length}`)
    }
  }

  get length() {
    return this.name.length
  }

  toString(format = null) {
    return this.name.toString(format)
  }

  valueOf() {
    return this.toString('T')
  }
}
exports.PlsqlItemName = PlsqlItemName

/** @implements {PlsqlName} */
class PlsqlUnitName {

  /** @type {PlsqlIdentifier?} */ owner
  /** @type {PlsqlIdentifier} */ name

  /**
   * @param  {IdentifierSyntaxNode} node
   */
  constructor(node) {
    const parts = node.parts.map(t => new PlsqlIdentifier(t))
    switch (parts.length) {
      case 1:
        [this.name] = parts
        break
      case 2:
        [this.owner, this.name] = parts
        break
      default:
        throw new Error(`Unsupported parts count: ${node.parts.length}`)
    }
  }

  get length() {
    return this.owner ? this.owner.length + 1 + this.name.length : this.name.length
  }

  toString(format = 'T') {
    if (this.owner) {
      return `${this.owner.toString(format)}.${this.name.toString(format)}`
    }

    return this.name.toString(format)
  }

  valueOf() {
    return this.toString()
  }
}
exports.PlsqlUnitName = PlsqlUnitName

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

  /**
   * @param {TokenLike} token
   * @returns {IdentifierSyntaxNode}
   */
  #readCurrentAsIdentifier(token) {
    const tokens = [token]
    let /** @type {Token[]?} */ nextTokens
    while (nextTokens = this.tryReadNextTokens(Patterns.PERIOD, Patterns.ANY_IDENTIFIER)) {
      tokens.push(...nextTokens)
    }

    return new IdentifierSyntaxNode(...tokens)
  }

  /**
   * @param {TokenLike} token
   * @returns {IdentifierSyntaxNode?}
   */
  tryReadNextAsIdentifier() {
    const token = this.tryReadNextToken(Patterns.ANY_IDENTIFIER)
    if (!token) {
      return null
    }

    return this.#readCurrentAsIdentifier(token)
  }

  /**
   * Reads an identifier node next.
   * @param {TokenLike} token
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

  /** @returns {SyntaxNode?} */
  #tryReadNextAsLeftParen() { return SyntaxNode.asSyntaxNode(this.tryReadNextToken(Patterns.LPAREN)) }
  /** @returns {SyntaxNode} */
  #readNextAsLeftParen() { return new SyntaxNode(this.readNextToken(Patterns.LPAREN)) }
  /** @returns {SyntaxNode} */
  #readNextAsRightParen() { return new SyntaxNode(this.readNextToken(Patterns.RPAREN)) }

  #tryReadNextAsAccessor() {
    // <unit-kind>? <identifier>
    const unitKind = this.tryReadNextToken(Patterns.PLSQL_UNIT_KIND)
    const name = this.tryReadNextAsIdentifier()

    return name ? new ExpressionSyntaxNode({ unitKind, name }) : null
  }

  *#tryReadNextAsAccessorsWithCommas() {
    let accessor = this.#tryReadNextAsAccessor()
    if (!accessor) {
      return
    }

    yield accessor

    let comma
    while (accessor && (comma = this.tryReadNextToken(Patterns.COMMA))) {
      yield comma
      yield accessor = this.#tryReadNextAsAccessor()
    }
  }

  #tryReadNextAsAccessorList() {
    const lparen = this.#tryReadNextAsLeftParen()
    if (!lparen) {
      return null
    }

    return new AccessorListExpressionSyntaxNode(
      lparen,
      [...this.#tryReadNextAsAccessorsWithCommas()],
      this.#readNextAsRightParen()
    )
  }

  /**
   * Read `ACCESSIBLE BY (...)` clause.
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/21/lnpls/ACCESSIBLE-BY-clause.html#GUID-9720619C-9862-4123-96E7-3E85F240FF36
   */
  #tryReadNextAsAccessibleByClause() {
    let tokens = this.tryReadNextTokens('ACCESSIBLE', 'BY')
    if (!tokens) {
      return null
    }


    return new ExpressionSyntaxNode({
      accessibleBy: new SyntaxNode(tokens),
      accessorList: this.#tryReadNextAsAccessorList()
    })
  }

  #notImplemented(description = 'This method') { return new Error(`${description} is not implmented`) }

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

  #readNextAsStandaloneFunction(create, editionable, objectType) {
    throw this.#notImplemented('CREATE FUNCTION')
  }

  #readNextAsStandaloneProcedure(create, editionable, objectType) {
    throw this.#notImplemented('CREATE PROCEDURE')
  }

  #readNextAsPackageSpec(create, editionable, objectType) {
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
    return new CreatePackageStatementSyntaxNode({
      create, editionable, objectType,
      name, authid, accessibleBy, is,
      content: [...this.#readNextAsPackageSpecContent()]
    });
  }

  #readNextAsTypeSpec(create, editionable, objectType) {
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
    } else if (next = this.tryReadNextTokens('PUBLIC', 'SYNONYM')) {
      return new SyntaxNode(...next)
    }

    // General case
    return new SyntaxNode(this.readNextToken(Patterns.ANY_KEYWORD))
  }

  /**
   * @returns {SyntaxNode?}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/CREATE-TYPE-statement.html#GUID-389D603D-FBD0-452A-8414-240BBBC57034
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/CREATE-VIEW.html#GUID-61D2D2B4-DACC-4C7C-89EB-7E50D9594D30
   */
  #tryReadNextAsEditionableClause() {
    let tokens
    if (tokens = this.tryReadNextTokens(Patterns.EDITIONABLE, Patterns.EDITIONING)) {
      // EDITIONABLE EDITIONING (yes, that's real)
      return new SyntaxNode(...tokens)
    }

    let token
    if (token = this.tryReadNextToken([Patterns.EDITIONABLE, Patterns.EDITIONING, Patterns.NONEDITIONABLE])) {
      return new SyntaxNode(token)
    }

    return null
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

    // EDITIONABLE
    const editionable = this.#tryReadNextAsEditionableClause()

    // <object-type>
    const objectType = this.#readNextWhenStatementType()
    switch (objectType.value) {
      case 'FUNCTION':
        return this.#readNextAsStandaloneFunction(create, editionable, objectType)
      case 'PROCEDURE':
        return this.#readNextAsStandaloneProcedure(create, editionable, objectType)
      case 'PACKAGE':
        return this.#readNextAsPackageSpec(create, editionable, objectType)
      case 'TYPE':
        return this.#readNextAsTypeSpec(create, editionable, objectType)
      default:
        throw this.#notImplemented(`Object type ${objectType.value}`)
    }
  }

  #readNextAsTypeExpression() {
    let token
    if (token = this.tryReadNextToken(Patterns.ANY_KEYWORD)) {
      switch (token.value) {
        case 'BLOB':
        case 'BOOLEAN':
        case 'CLOB':
        case 'DATE':
        case 'INTEGER':
        case 'POSITIVE':
          return new ExpressionSyntaxNode({ name: token })
        case 'RAW':
        case 'VARCHAR':
        case 'VARCHAR2': {
          const lparen = this.tryReadNextToken(Patterns.LPAREN)
          if (lparen) {
            return new ExpressionSyntaxNode({
              name: token,
              lparen: lparen,
              length: this.readNextToken(Patterns.NUMBER),
              rparen: this.readNextToken(Patterns.RPAREN),
            })
          } else {
            return new ExpressionSyntaxNode({ name: token })
          }
        }
        case 'NUMBER': {
          const lparen = this.tryReadNextToken(Patterns.LPAREN)
          if (lparen) {
            const precision = this.readNextToken([Patterns.NUMBER, '*']) // e.g. `NUMBER(*,0)`
            const comma = this.tryReadNextToken(Patterns.COMMA)
            const scale = comma ? this.readNextToken(Patterns.NUMBER) : null
            return new ExpressionSyntaxNode({
              name: token,
              lparen,
              precision, comma, scale,
              rparen: this.readNextToken(Patterns.RPAREN),
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

  /**
   * Reads a simple value expression.
   * @returns {ExpressionSyntaxNode}
   */
  #readNextAsSingleValueExpression() {
    const token = this.tryReadNextToken()
    switch (token.type) {
      case 'string':
      case 'number':
        return new SyntaxNode(token)
      case 'reserved':
      case 'keyword':
        switch (token.value) {
          // well-known, standalone keywords
          case 'NULL':
          case 'TRUE':
          case 'FALSE':
            return new SyntaxNode(token)

          // keywords that MAY have parens
          case 'SYSDATE':
          case 'SYSTIMESTAMP':
          case 'CURRENT_DATE':
          case 'CURRENT_TIMESTAMP':
            return new SyntaxNode(token)
          default:
            break
        }
      case 'operator':
        switch (token.value) {
          case '(': {
            // (expr)
            return new ExpressionSyntaxNode({
              lparen: token,
              expression: this.#readNextAsValueExpression(),
              rparen: this.readNextToken(Patterns.RPAREN)
            })
          }

          case '+':
          case '-':
            // Unary operator
            return new ExpressionSyntaxNode({
              operator: token,
              expression: this.#readNextAsValueExpression()
            })

          default:
            break
        }
      default:
        break
    }

    console.warn(`unhandled single value expression (${token.type} ${JSON.stringify(token.value)})`, token)
    return new SyntaxNode(token)
  }

  /**
   * Reads a compound value expression.
   * @returns {ExpressionSyntaxNode}
   */
  #readNextAsValueExpression() {
    const expression = this.#readNextAsSingleValueExpression()
    // See if there is an operator
    const operator = this.tryReadNextToken(Patterns.BINARY_OPERATOR)
    if (operator) {
      // Binary/ternary operator
      return new ExpressionSyntaxNode({
        left: expression,
        operator,
        right: this.#readNextAsValueExpression()
      })
    }

    return expression
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

    const nocopy = this.tryReadNextToken('NOCOPY')
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
    while (param && (comma = this.tryReadNextToken(Patterns.COMMA))) {
      yield comma
      yield param = this.#readNextAsParameterDeclaration()
    }
  }

  #tryReadNextAsParameterDeclarationList() {
    const lparen = this.tryReadNextToken(Patterns.LPAREN)
    if (!lparen) {
      return null
    }

    return new ParameterDeclarationListExpressionSyntaxNode(
      lparen,
      [...this.#tryReadNextAsParameterDeclarationsWithCommas()],
      this.#readNextAsRightParen()
    )
  }

  #readAsFunctionDeclaration(keyword) {
    this.verify(Patterns.FUNCTION, keyword)

    return new FunctionDeclarationStatementSyntaxNode({
      keyword,
      name: this.readNextAsIdentifier(),
      parameters: this.#tryReadNextAsParameterDeclarationList(),
      return: this.#tryReadNextAsReturnDeclaration(),
      rest: this.readNextTokensUntil(';')
    })
  }

  #readAsProcedureDeclaration(keyword) {
    this.verify(Patterns.PROCEDURE, keyword)

    return new ProcedureDeclarationStatementSyntaxNode({
      keyword,
      name: this.readNextAsIdentifier(),
      parameters: this.#tryReadNextAsParameterDeclarationList(),
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

  /** @override */
  readInternal() {
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
          break

        case 'operator':
          switch (token.value) {
            case '/':
              // terminating slash
              return new EmptyStatementSyntaxNode(token)
          }
          break
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
  /** @property {SyntaxNode?} editionable */
  /** @property {string} objectType */
  /** @property {string} name */
  /** @property {SyntaxNode[]} */ content

  /**
   * @param {SyntaxNode} create
   * @param {SyntaxNode?} editionable
   * @param {SyntaxNode} objectType
   * @param {SyntaxNode} name
   * @param {SyntaxNode[]} content
   */
  constructor({ create, editionable, objectType, name, content }) {
    super({ create, editionable, objectType, name, content })
  }
}

class CreatePackageStatementSyntaxNode extends StatementSyntaxNode {
  /** @property {SyntaxNode} create */
  /** @property {SyntaxNode?} editionable */
  /** @property {SyntaxNode} objectType */
  /** @property {SyntaxNode} name */
  /** @property {SyntaxNode?} authid */
  /** @property {SyntaxNode?} accessibleBy */
  /** @property {SyntaxNode} is */
  /** @property {SyntaxNode[]} content */

  /**
   * @param {SyntaxNode} create
   * @param {SyntaxNode?} editionable
   * @param {SyntaxNode} objectType
   * @param {SyntaxNode} name
   * @param {SyntaxNode[]} content
   */
  constructor({ create, editionable, objectType, name, authid, accessibleBy, is, content }) {
    super({ create, editionable, objectType, name, authid, accessibleBy, is, content })
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
  /** @type {ParameterDeclarationListExpressionSyntaxNode?} The procedure name. */ parameters

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
  /** @type {ParameterDeclarationListExpressionSyntaxNode?} The procedure name. */ parameters

  /**
   * @param {TokenLike} token  The initial token (`FUNCTION`)
   * @param {IdentifierSyntaxNode} name
   * @param {ParameterDeclarationListExpressionSyntaxNode?} parameters
   * @param {ReturnDeclarationExpressionSyntaxNode} return
   * @param {SyntaxNode?} rest
   */
  constructor({ keyword, name, parameters, return: returnClause, rest }) {
    super()
    this.add({ keyword, name, parameters, return: returnClause, rest })
  }
}

class TokenArray extends Array {
  constructor(...items) {
    super(...items.filter(x => x))
  }

  /** @override */
  join(separator, format = null) {
    if (format) {
      return super.map(t => t.toString(format)).join(separator)
    } else {
      return super.join(separator)
    }
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
      mode: new TokenArray(inQualifier, outQualifier),
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

class ParameterDeclarationListExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {ParameterDeclarationExpressionSyntaxNode[]} */ parameters

  constructor(lparen, parametersWithCommas, rparen) {
    super()
    this.push(lparen, ...parametersWithCommas, rparen)
    this.parameters = parametersWithCommas.filter(x => x instanceof ParameterDeclarationExpressionSyntaxNode)
  }
}
exports.ParameterListDeclarationExpressionSyntaxNode = ParameterDeclarationListExpressionSyntaxNode

class AccessorListExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {ExpressionSyntaxNode[]} */ accessors

  constructor(lparen, accessorsWithCommas, rparen) {
    super()
    this.push(lparen, ...accessorsWithCommas, rparen)
    this.accessors = accessorsWithCommas.filter(x => x instanceof ExpressionSyntaxNode)
  }
}
exports.AccessorListDeclarationExpressionSyntaxNode = AccessorListExpressionSyntaxNode
