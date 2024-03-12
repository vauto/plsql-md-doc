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
  static NUMBER_LITERAL = { type: 'number' }
  static STRING_LITERAL = { type: 'string' }
  static OPERATOR = { type: 'operator' }
  static RESERVED = { type: 'reserved' }

  static reserved(value) { return { type: 'reserved', value } }

  static ASSIGNMENT = { type: 'operator', value: ':=' }
  static DEFAULT = Patterns.reserved('DEFAULT')
  static EXCEPTION = Patterns.reserved('EXCEPTION')

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

  static SEMICOLON = { type: 'operator', value: ';' }
  static SLASH = { type: 'operator', value: '/' }
  static END_OF_SQL_STATEMENT = [Patterns.SEMICOLON, Patterns.SLASH]

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
  #tryReadNextAsIdentifier() {
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
    const name = this.#tryReadNextAsIdentifier()

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

  #notImplemented(description = 'This method') { throw new Error(`${description} is not implmented`) }

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

  #readNextAsPlsqlUnitAsIsKeyword() {
    // IS|AS.
    // For this we also want to read any possible trivial tokens up to and including a doc comment.
    // This is because Oracle understandably doesn't recognize comments before the CREATE statement as part of the package and it throws off line numbers, etc.
    const tokens = this.readNextTokensUntil(Patterns.IS_OR_AS)
    return new SyntaxNode(...tokens, this.#tryReadUpToNextDocComment())
  }

  /**
   * @param {SyntaxNode} create
   * @param {SyntaxNode} editionable
   * @param {SyntaxNode} objectType
   * @returns {CreatePackageStatementSyntaxNode}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/CREATE-PACKAGE-statement.html#GUID-03A70A54-90FF-4293-B6B8-F0B35E184AC5
   */
  #readNextAsPackageSpec(create, editionable, objectType) {
    // LATER: 23c: support IF NOT EXISTS

    // <identifier>
    const name = this.readNextAsIdentifier()

    // LATER: AUTHID/ACCESSIBLE BY are *interorderable* and *many*??!
    // for now we just act like it's one.
    const authid = this.#tryReadNextAsAuthidClause()
    const accessibleBy = this.#tryReadNextAsAccessibleByClause()

    const is = this.#readNextAsPlsqlUnitAsIsKeyword()

    return new CreatePackageStatementSyntaxNode({
      create, editionable, objectType,
      name,
      authid, accessibleBy,
      is,
      content: [...this.#readNextAsPackageSpecContent()]
    });
  }

  //-----------------------------------

  #tryReadNextAsTypeOid() {
    const oid = this.tryReadNextToken('OID')
    return oid ? new SyntaxNode(oid, this.readNextToken(Patterns.STRING_LITERAL)) : null
  }

  #tryReadNextAsObjectAttributeDeclaration(inheritance) {
    // n.b. Object attribute currently doesn't support inheritance, this is so we at least eat what we take
    const name = this.#tryReadNextAsIdentifier()
    if (!name) {
      return null
    }

    // there's probably more.
    const type = this.#readNextAsTypeExpression()

    // doesn't allow defaults.
    return new ObjectAttributeDeclarationExpressionSyntaxNode({ inheritance, name, type })
  }

  #tryReadNextAsInheritanceClause() {
    const not = this.tryReadNextToken('NOT')
    const modifier = this.tryReadNextToken(['FINAL', 'INSTANTIABLE', 'OVERRIDING'])
    if (not) {
      console.assert(modifier, '`NOT` found, but modifier was not')
      return new SyntaxNode(not, modifier)
    }

    if (modifier) {
      return new SyntaxNode(modifier)
    }

    return null
  }

  *#tryReadNextAsInheritanceClauses() {
    let inheritance
    while (inheritance = this.#tryReadNextAsInheritanceClause()) {
      yield inheritance
    }
  }

  /**
   * @param {TokenLike[]} inheritance
   * @returns {MethodDeclarationStatementSyntaxNode}
   */
  #tryReadNextAsObjectConstructorMethod(inheritance) {
    // constructor is always function
    const constructor = this.tryReadNextTokens('CONSTRUCTOR', Patterns.FUNCTION)
    if (!constructor) {
      return null
    }

    return new MethodDeclarationStatementSyntaxNode({
      inheritance: inheritance,
      keyword: new SyntaxNode(...constructor),
      name: this.readNextAsIdentifier(),
      parameters: this.#tryReadNextAsParameterListDeclaration(),
      return: new ConstructorReturnDeclarationExpressionSyntaxNode(this.tryReadNextTokens('RETURN', 'SELF', 'AS', 'RESULT')),
    })
  }

  /**
   * @param {TokenLike[]} inheritance
   * @returns {MethodDeclarationStatementSyntaxNode}
   */
  #tryReadNextAsObjectMemberOrStaticMethod(inheritance) {
    const map = this.tryReadNextToken('MAP')
    const memberOrStatic = this.tryReadNextTokens(['MEMBER', 'STATIC'], [Patterns.PROCEDURE, Patterns.FUNCTION])
    if (!memberOrStatic) {
      console.assert(!map, "MAP found but not [MEMBER|STATIC] [PROCEDURE|FUNCTION]")
      return null
    }

    // put MAP first
    if (map) {
      memberOrStatic.unshift(map)
    }

    return new MethodDeclarationStatementSyntaxNode({
      keyword: new SyntaxNode(...inheritance, ...memberOrStatic),
      name: this.readNextAsIdentifier(),
      parameters: this.#tryReadNextAsParameterListDeclaration(),
      return: this.#tryReadNextAsReturnDeclaration()
    })
  }

  /**
   * element_type: @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/element-specification.html#GUID-20D95D8A-5C17-4C89-9AAB-1852CDB57CE2
   */
  #tryReadNextAsObjectMemberDeclaration() {
    const inheritance = [...this.#tryReadNextAsInheritanceClauses()]

    // subprogram_spec
    // map_order_function_spec
    // (we don't care about the distinction, Oracle does)
    let method = this.#tryReadNextAsObjectMemberOrStaticMethod(inheritance)
    if (method) {
      return method
    }

    // constructor_spec (always a function)
    if (method = this.#tryReadNextAsObjectConstructorMethod(inheritance)) {
      return method
    }

    // attribute
    return this.#tryReadNextAsObjectAttributeDeclaration(inheritance)
  }

  #readNextAsObjectMemberDeclaration() {
    const param = this.#tryReadNextAsObjectMemberDeclaration()
    if (param) {
      console.assert(param instanceof SyntaxNode)
      return param
    }
    throw new Error(`Expected: parameter`)
  }

  *#tryReadNextAsObjectMemberDeclarationsWithCommas() {
    let param = this.#tryReadNextAsObjectMemberDeclaration()
    if (!param) {
      return
    }

    console.assert(param instanceof SyntaxNode)
    yield param

    let comma
    while (param && (comma = this.tryReadNextToken(Patterns.COMMA))) {
      yield comma
      yield param = this.#readNextAsObjectMemberDeclaration()
      console.assert(param instanceof SyntaxNode || !param)
    }
  }

  #tryReadNextAsObjectMemberListDeclaration() {
    const lparen = this.#tryReadNextAsLeftParen()
    if (!lparen) {
      return null
    }

    return new ObjectMemberListDeclarationExpressionSyntaxNode(
      lparen,
      [...this.#tryReadNextAsObjectMemberDeclarationsWithCommas()],
      this.#readNextAsRightParen()
    )
  }

  #tryReadNextAsTypeModifier() {
    const not = this.tryReadNextToken('NOT')
    const modifier = this.tryReadNextToken(['FINAL', 'INSTANTIABLE', 'PERSISTABLE'])
    if (not) {
      console.assert(modifier, '`NOT` found, but modifier was not')
      return new SyntaxNode(not, modifier)
    }

    if (modifier) {
      return new SyntaxNode(modifier)
    }

    return null
  }

  *#tryReadNextAsTypeModifiers() {
    let modifier
    while (modifier = this.#tryReadNextAsTypeModifier()) {
      yield modifier
    }
  }

  /**
   * @param {SyntaxNode} create
   * @param {SyntaxNode} editionable
   * @param {SyntaxNode} objectType
   * @returns {CreateTypeStatementSyntaxNode}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/CREATE-TYPE-statement.html#GUID-389D603D-FBD0-452A-8414-240BBBC57034
   */
  #readNextAsTypeSpec(create, editionable, objectType) {
    // LATER: 23c: support IF NOT EXISTS

    // <identifier> [FORCE]? [OID '<oid>']? <sharing-clause>? <default-collation-clause>?
    const name = this.readNextAsIdentifier()

    const force = SyntaxNode.asSyntaxNode(this.tryReadNextToken('FORCE'))
    const oid = this.#tryReadNextAsTypeOid()

    // LATER: AUTHID/ACCESSIBLE BY are *interorderable* and *many*??!
    // for now we just act like it's one.
    const authid = this.#tryReadNextAsAuthidClause()
    const accessibleBy = this.#tryReadNextAsAccessibleByClause()

    // Next see if it is a base type or a subtype.

    const under = SyntaxNode.asSyntaxNode(this.tryReadNextToken('UNDER'))
    if (under) {
      // object subtype definition (UNDER keyword).
      // **NOTE:** there is no `IS` keyword here.
      this.#notImplemented('CREATE TYPE ... UNDER ...')
    }

    // The other 3 require IS
    //  - object base type definition
    //  - nested table
    //  - varray
    const is = this.#readNextAsPlsqlUnitAsIsKeyword()

    let typeType = this.tryReadNextToken('OBJECT')
    if (typeType) {
      return new CreateBaseObjectTypeStatementSyntaxNode({
        create, editionable, objectType,
        name,
        force, oid,
        authid, accessibleBy,
        is,
        members: this.#tryReadNextAsObjectMemberListDeclaration(),
        modifiers: [...this.#tryReadNextAsTypeModifiers()],
        rest: this.tryReadNextToken(Patterns.END_OF_SQL_STATEMENT)
      })
    }

    typeType = this.tryReadNextToken('VARRAY') //, 'VARRAY', 'TABLE'])
    if (typeType) {
      this.#notImplemented('IS VARRAY')
    }

    typeType = this.tryReadNextToken('TABLE', 'OF')
    if (typeType) {
      this.#notImplemented('IS TABLE OF')
    }

    this.#notImplemented('unknown TYPE type')

    // return new CreateTypeStatementSyntaxNode({
    //   create, editionable, objectType,
    //   name, force, oid, authid, accessibleBy, is,
    //   content: [...this.#readNextAsPackageSpecContent()]
    // });
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
        case 'BINARY_INTEGER':
        case 'BOOLEAN':
        case 'CLOB':
        case 'DATE':
        case 'INTEGER':
        case 'PLS_INTEGER':
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
              length: this.readNextToken(Patterns.NUMBER_LITERAL),
              rparen: this.readNextToken(Patterns.RPAREN),
            })
          } else {
            return new ExpressionSyntaxNode({ name: token })
          }
        }
        case 'NUMBER': {
          const lparen = this.tryReadNextToken(Patterns.LPAREN)
          if (lparen) {
            const precision = this.readNextToken([Patterns.NUMBER_LITERAL, '*']) // e.g. `NUMBER(*,0)`
            const comma = this.tryReadNextToken(Patterns.COMMA)
            const scale = comma ? this.readNextToken(Patterns.NUMBER_LITERAL) : null
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

        case 'EXCEPTION':
          // Special case: this is an exception, not a variable
          throw new NodeSyntaxError(token, 'EXCEPTION not expected here')

        default:
          // This is an identifier
          if (this.iterator.nextIs(Patterns.PERIOD)) {
            return this.#readCurrentAsIdentifier(token)
          }

          // These are probably other reserved words
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
    const name = this.#tryReadNextAsIdentifier()
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

  #tryReadNextAsParameterListDeclaration() {
    const lparen = this.tryReadNextToken(Patterns.LPAREN)
    if (!lparen) {
      return null
    }

    return new ParameterListDeclarationExpressionSyntaxNode(
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

  #readAsSubtypeDeclaration(keyword) {
    // https://docs.oracle.com/en/database/oracle/oracle-database/19/lnpls/block.html#GUID-9ACEB9ED-567E-4E1A-A16A-B8B35214FC9D
    this.verify({ value: 'SUBTYPE' }, keyword)

    return new SubtypeDeclarationStatementSyntaxNode({
      keyword,
      name: this.readNextAsIdentifier(),
      is: this.readNextToken(Patterns.IS),
      specification: this.#readNextAsTypeExpression(),
      rest: this.readNextTokensUntil(';')
    })
  }

  #readNextAsTerminator() {
    return new SyntaxNode(this.readNextToken(Patterns.SEMICOLON))
  }

  /**
   * Read as variable, constant, or exception.
   */
  #readAsVariableDeclaration(token) {
    const name = this.#readCurrentAsIdentifier(token)

    const exception = this.tryReadNextToken(Patterns.EXCEPTION)
    if (exception) {
      // <identifier> EXCEPTION;
      return new ExceptionDeclarationStatementSyntaxNode({
        name,
        keyword: exception,
        terminator: this.#readNextAsTerminator()
      })
    }

    const constant = this.tryReadNextToken(Patterns.CONSTANT)
    const type = this.#readNextAsTypeExpression()

    const defaultKeyword = this.tryReadNextToken([Patterns.ASSIGNMENT, Patterns.DEFAULT])
    const defaultValue = defaultKeyword ? this.#readNextAsValueExpression() : null

    return new VariableDeclarationStatementSyntaxNode({
      name,
      constant,
      type,
      defaultKeyword,
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

class CreatePlsqlUnitStatementSyntaxNode extends StatementSyntaxNode {
  /** @property {SyntaxNode} */ create
  /** @property {SyntaxNode?} */ editionable
  /** @property {SyntaxNode} */ objectType
  /** @property {SyntaxNode} */ name
  /** @property {SyntaxNode?} */ authid
  /** @property {SyntaxNode?} */ accessibleBy

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

class CreatePackageStatementSyntaxNode extends CreatePlsqlUnitStatementSyntaxNode {
  /** @property {SyntaxNode} */ is

  #content

  /** @property {SyntaxNode[]} */ content
  get content() {
    console.assert(false, 'stop it')
    return this.#content
  }

  /** @property {SyntaxNode[]} */ members


  /**
   * @param {SyntaxNode} create
   * @param {SyntaxNode?} editionable
   * @param {SyntaxNode} objectType
   * @param {SyntaxNode} name
   * @param {SyntaxNode?} authid
   * @param {SyntaxNode?} accessibleBy
   * @param {SyntaxNode} is
   * @param {SyntaxNode[]} content
   */
  constructor({ create, editionable, objectType, name, authid, accessibleBy, is, content }) {
    super()
    this.add({ create, editionable, objectType, name, authid, accessibleBy, is })
    this.push(content)

    this.#content = content
    this.members = content.filter(x => x instanceof DeclarationStatementSyntaxNode)
  }
}

class CreateBaseObjectTypeStatementSyntaxNode extends CreatePlsqlUnitStatementSyntaxNode {
  /** @property {SyntaxNode} */ is
  /** @property {ObjectAttributeDeclarationExpressionSyntaxNode[]} */ members
  /** @property {SyntaxNode[]} */ modifiers

  /**
   * @param {SyntaxNode} create
   * @param {SyntaxNode?} editionable
   * @param {SyntaxNode} objectType
   * @param {SyntaxNode} name
   * @param {SyntaxNode?} authid
   * @param {SyntaxNode?} accessibleBy
   * @param {SyntaxNode} is
   * @param {SyntaxNode} lparen
   * @param {ObjectMemberListDeclarationExpressionSyntaxNode} members
   * @param {SyntaxNode[]} modifiers
   * @param {SyntaxNode} rest
   */
  constructor({ create, editionable, objectType, name, authid, accessibleBy, is, members, modifiers, rest }) {
    super()
    this.add({ create, editionable, objectType, name, authid, accessibleBy, is })
    this.push(members)
    this.members = members.members
    this.add({ modifiers })
    this.push(rest)
  }
}

class EmptyStatementSyntaxNode extends StatementSyntaxNode {
  constructor(slash) {
    super({ slash })
  }
}

class DeclarationStatementSyntaxNode extends StatementSyntaxNode {
  /** @property {IdentifierSyntaxNode} The name of the declaration. */ name

  /**
   * @param {IdentifierSyntaxNode} name
   */
  constructor({ name } = {}) {
    super()
    if (name) {
      this.add({ name })
    }
  }
}
exports.DeclarationStatementSyntaxNode = DeclarationStatementSyntaxNode

class ExceptionDeclarationStatementSyntaxNode extends DeclarationStatementSyntaxNode {

  /**
   *
   * @param {object} params
   * @param {IdentifierSyntaxNode} params.name
   * @param {TokenLike} params.keyword
   */
  constructor({ name, keyword }) {
    super()
    this.add({ name })
    this.push(keyword)
  }
}
exports.ExceptionDeclarationStatementSyntaxNode = ExceptionDeclarationStatementSyntaxNode


class VariableDeclarationStatementSyntaxNode extends DeclarationStatementSyntaxNode {
  /** @property {SyntaxNode} */ constant
  /** @property {SyntaxNode} */ type
  /** @property {SyntaxNode} */ defaultValue

  /**
   * @param {object} params
   * @param {IdentifierSyntaxNode} params.name
   * @param {SyntaxNode} params.constant
   * @param {SyntaxNode} params.type
   * @param {SyntaxNode} params.default
   * @param {SyntaxNode} params.defaultValue
   */
  constructor({ name, constant, type, defaultKeyword, defaultValue, rest }) {
    super()
    this.add({ name, constant, type })
    if (defaultKeyword) {
      this.push(defaultKeyword)
      this.add({ defaultValue })
    }
    this.push(rest)
  }

  get isConstant() {
    return !!this.constant
  }
}

class TypeDeclarationStatementSyntaxNode extends DeclarationStatementSyntaxNode {
  /** @property {ExpressionSyntaxNode} */ specification
}
exports.TypeDeclarationStatementSyntaxNode = TypeDeclarationStatementSyntaxNode

class SubtypeDeclarationStatementSyntaxNode extends TypeDeclarationStatementSyntaxNode {

  /**
   * @param {object} params
   * @param {SyntaxNode} params.keyword
   * @param {IdentifierSyntaxNode} params.name
   * @param {SyntaxNode} params.is
   * @param {ExpressionSyntaxNode} params.specification
   * @param {SyntaxNode} params.rest
   */
  constructor({ keyword, name, is, specification, rest }) {
    super()
    this.push(keyword)
    this.add({ name })
    this.push(is)
    this.add({ specification })
    this.push(rest)
  }
}

class ProcedureDeclarationStatementSyntaxNode extends DeclarationStatementSyntaxNode {
  /** @type {SyntaxNode} */ keyword
  /** @type {string} A unique ID for this procedure within context. */ id
  /** @type {ParameterListDeclarationExpressionSyntaxNode?} The procedure name. */ parameters

  /**
   * @param {object} params
   * @param {TokenLike} params.keyword  The initial token (`PROCEDURE`)
   * @param {IdentifierSyntaxNode} params.name
   * @param {ParameterListDeclarationExpressionSyntaxNode?} params.parameters
   * @param {SyntaxNode?} params.rest
   */
  constructor({ keyword, name, parameters, rest }) {
    super()
    this.add({ keyword, name, parameters })
    this.push(rest)
  }
}

class FunctionDeclarationStatementSyntaxNode extends DeclarationStatementSyntaxNode {
  /** @type {SyntaxNode} */ keyword
  /** @type {string} A unique ID for this procedure within context. */ id
  /** @type {IdentifierSyntaxNode} The procedure name. */ name
  /** @type {ParameterListDeclarationExpressionSyntaxNode?} The procedure name. */ parameters

  /**
   * @param {object} params
   * @param {TokenLike} params.token  The initial token (`FUNCTION`)
   * @param {IdentifierSyntaxNode} params.name
   * @param {ParameterListDeclarationExpressionSyntaxNode?} params.parameters
   * @param {ReturnDeclarationExpressionSyntaxNode} params.return
   * @param {SyntaxNode?} params.rest
   */
  constructor({ keyword, name, parameters, return: returnClause, rest }) {
    super()
    this.add({ keyword, name, parameters, return: returnClause })
    this.push(rest)
  }
}

class MethodDeclarationStatementSyntaxNode extends DeclarationStatementSyntaxNode {
  /** @type {SyntaxNode} [[map|order]? member|constructor|static]? [procedure|function] */ keyword
  /** @type {string} A unique ID for this procedure within context. */ id
  /** @type {IdentifierSyntaxNode} The procedure name. */ name
  /** @type {ParameterListDeclarationExpressionSyntaxNode?} The procedure name. */ parameters
  /** @type {ReturnDeclarationExpressionSyntaxNode?} The return clause, if function */ return

  /**
   * @param {object} params
   * @param {SyntaxNode} params.keyword  The initial token (`FUNCTION`)
   * @param {IdentifierSyntaxNode} params.name
   * @param {ParameterListDeclarationExpressionSyntaxNode?} params.parameters
   * @param {ReturnDeclarationExpressionSyntaxNode?} params.return
   */
  constructor({ keyword, name, parameters, return: returnClause }) {
    super()
    this.add({ keyword, name, parameters, return: returnClause })
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

class ConstructorReturnDeclarationExpressionSyntaxNode extends ExpressionSyntaxNode {

  constructor(tokens) {
    super()
    this.push(...tokens)
  }

  get type() {
    // FIXME this is not clean
    return this.parent.parent.parent.name
  }
}
exports.ConstructorReturnDeclarationExpressionSyntaxNode = ConstructorReturnDeclarationExpressionSyntaxNode

class ParameterListDeclarationExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {ParameterDeclarationExpressionSyntaxNode[]} */ parameters

  constructor(lparen, parametersWithCommas, rparen) {
    super()
    this.push(lparen, ...parametersWithCommas, rparen)
    this.parameters = parametersWithCommas.filter(x => x instanceof ParameterDeclarationExpressionSyntaxNode)
  }
}
exports.ParameterListDeclarationExpressionSyntaxNode = ParameterListDeclarationExpressionSyntaxNode

class AccessorListExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {ExpressionSyntaxNode[]} */ accessors

  constructor(lparen, accessorsWithCommas, rparen) {
    super()
    this.push(lparen, ...accessorsWithCommas, rparen)
    this.accessors = accessorsWithCommas.filter(x => x instanceof ExpressionSyntaxNode)
  }
}
exports.AccessorListDeclarationExpressionSyntaxNode = AccessorListExpressionSyntaxNode

// ---------

class ObjectMemberDeclarationExpressionSyntaxNode extends ExpressionSyntaxNode {

  /** @property {IdentifierSyntaxNode} */ name

  constructor() {
    super()
  }
}
exports.ObjectMemberDeclarationExpressionSyntaxNode = ObjectMemberDeclarationExpressionSyntaxNode

class ObjectAttributeDeclarationExpressionSyntaxNode extends ObjectMemberDeclarationExpressionSyntaxNode {

  /** @property {ExpressionSyntaxNode} */ type

  constructor({ name, type, inheritance }) {
    super()
    this.add({ name, type })
    this.push(inheritance) // eat what we take, even if it doesn't apply
  }
}
exports.ObjectAttributeDeclarationExpressionSyntaxNode = ObjectAttributeDeclarationExpressionSyntaxNode

class ObjectMemberListDeclarationExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {ObjectAttributeDeclarationExpressionSyntaxNode[]} */ attributes
  /** @type {MethodDeclarationStatementSyntaxNode[]} */ methods

  constructor(lparen, membersWithCommas, rparen) {
    super()
    this.push(lparen, ...membersWithCommas, rparen)
    this.attributes = membersWithCommas.filter(x => x instanceof ObjectAttributeDeclarationExpressionSyntaxNode)
    this.members = membersWithCommas.filter(x => x instanceof MethodDeclarationStatementSyntaxNode)
  }
}
exports.ObjectMemberListDeclarationExpressionSyntaxNode = ObjectMemberListDeclarationExpressionSyntaxNode


