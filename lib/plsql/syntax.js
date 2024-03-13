const {
  ExpressionSyntaxNode,
  IdentifierSyntaxNode,
  StatementSyntaxNode,
  SyntaxNode,
  SyntaxNodeFormat,
  SyntaxNodeOrToken,
  SyntaxNodeReader,
  Token,
  TokenLike,
  TokenPattern,
  ContainerSyntaxNode,
} = require('../syntax')

/**
 * Patterns for reserved words.
 */
class Patterns {

  static IDENTIFIER = { type: 'identifier' }
  static KEYWORD = { type: 'keyword' }
  static NUMBER_LITERAL = { type: 'number' }
  static STRING_LITERAL = { type: 'string' }
  static OPERATOR = { type: 'operator' }
  static RESERVED = { type: 'reserved' }

  /**
   * @param {string} value
   * @returns {TokenPattern}
   */
  static keyword(value) { return { type: 'keyword', value } }
  /**
   * @param {string} value
   * @returns {TokenPattern}
   */
  static operator(value) { return { type: 'operator', value } }
  /**
   * @param {string} value
   * @returns {TokenPattern}
   */
  static reserved(value) { return { type: 'reserved', value } }

  static IS = Patterns.reserved('IS')
  static AS = Patterns.reserved('AS')
  static OF = Patterns.reserved('OF')

  static CONSTANT = Patterns.keyword('CONSTANT')

  static PERIOD = Patterns.operator('.')
  static COMMA = Patterns.operator(',')
  static LPAREN = Patterns.operator('(')
  static RPAREN = Patterns.operator(')')
  static ASSIGNMENT = Patterns.operator(':=')
  static DOTDOT = Patterns.operator('..')

  static PREPROCESSOR = {
    KEYWORD: { type: 'preprocessor.keyword' },
    THEN: { type: 'preprocessor.keyword', value: 'THEN' },
    END: { type: 'preprocessor.keyword', value: 'END' },
  }

  static DEFAULT = Patterns.reserved('DEFAULT')
  static EXCEPTION = Patterns.reserved('EXCEPTION')
  static INTERVAL = Patterns.keyword('INTERVAL')
  static RETURN = Patterns.keyword('RETURN')
  static TIMESTAMP = Patterns.keyword('TIMESTAMP')

  static CURSOR = Patterns.reserved('CURSOR')

  // Loose reserved/keyword matching
  static ANY_KEYWORD = [Patterns.RESERVED, Patterns.KEYWORD]

  // Loose identifier matching (allows keywords, a few reserved words)
  static ANY_IDENTIFIER = [
    Patterns.IDENTIFIER, Patterns.KEYWORD,
    Patterns.CURSOR
  ]

  static ANY_DEFAULT = [Patterns.ASSIGNMENT, Patterns.DEFAULT]

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

  /**
   * @param {SyntaxNodeFormat} format
   * @returns {string}
   */
  toString(format = 'T') {
    switch (format?.toUpperCase()) {
      case 'T':
        return this.text
      case 'FILE':
        // Use the text name, but trim quotes
        return this.text.replace(/^"|"$/g, '')
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

  /**
   * @param {SyntaxNodeFormat} format
   * @returns {string}
   */
  toString(format = 'T') {
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

  /**
   * @param {SyntaxNodeFormat} format
   * @returns {string}
   */
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
  #readAsIdentifier(token) {
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

    return this.#readAsIdentifier(token)
  }

  /**
   * Reads an identifier node next.
   * @param {TokenLike} token
   * @returns {IdentifierSyntaxNode}
   */
  readNextAsIdentifier() {
    const token = this.readNextToken(Patterns.ANY_IDENTIFIER)
    return this.#readAsIdentifier(token)
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
              yield this.#readAsEndOfSqlStatement(token)
              continue
          }
          break
      }

      // At this point we MAY have an identifier or a keyword being used as an identifier.
      if (token.type === 'reserved') {
        console.assert(false, `${token.textSpan} unexpected reserved word in package spec`, token)
        yield this.#readAsContainedStatement(token)
        continue
      }

      // Just treat this as an identifier, it's probably a constant or variable
      yield this.#readAsVariableDeclaration(token)
    }
  }

  /**
   * See if there is a doc comment before the next nontrivial node;
   * if there is, return it.
   * @returns {SyntaxNode?}
   */
  #tryReadNextAsDocComment() {
    // Peek, reading individual tokens.
    // If we hit a doc comment, stop.
    let peek = this.iterator.peek()
    let tokens = []
    for (const token of peek) {
      if (!token.isTrivia) {
        // Oops, nontrivial found.  No doc comment here.
        return null
      }

      // Add it to the buffer.
      tokens.push(token)

      // If we hit the end of a doc comment, consume the buffer and return it.
      // (This assumes the lexer input is correctly formed)
      if (token.type === 'comment.doc.end') {
        this.iterator.skip(tokens.length)
        return new SyntaxNode(...tokens)
      }
    }

    return null
  }

  #readNextAsStandaloneFunction(create, editionable, unitType) {
    throw this.notImplemented('CREATE FUNCTION')
  }

  #readNextAsStandaloneProcedure(create, editionable, unitType) {
    throw this.notImplemented('CREATE PROCEDURE')
  }

  /**
   * @param {SyntaxNode} create
   * @param {SyntaxNode} editionable
   * @param {UnitTypeSyntaxNode} unitType
   * @returns {CreatePackageStatementSyntaxNode}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/CREATE-PACKAGE-statement.html#GUID-03A70A54-90FF-4293-B6B8-F0B35E184AC5
   */
  #readNextAsPackageSpec(create, editionable, unitType) {
    // LATER: 23c: support IF NOT EXISTS

    // <identifier>
    const name = this.readNextAsIdentifier()

    // LATER: AUTHID/ACCESSIBLE BY are *interorderable* and *many*??!
    // for now we just act like it's one.
    const authid = this.#tryReadNextAsAuthidClause()
    const accessibleBy = this.#tryReadNextAsAccessibleByClause()

    const is = this.readNextToken(Patterns.IS_OR_AS)

    return new CreatePackageStatementSyntaxNode({
      create, editionable, unitType,
      name,
      authid, accessibleBy,
      is,
      // It is (our) standard practice to put the PACKAGE doc comment right after the IS.
      // This is because Oracle understandably doesn't recognize comments before the CREATE statement as part of the package and it throws off line numbers, etc.
      docComment: this.#tryReadNextAsDocComment(),
      content: [...this.#readNextAsPackageSpecContent()]
    });
  }

  //-----------------------------------

  #tryReadNextAsTypeOid() {
    const oid = this.tryReadNextToken('OID')
    return oid ? new SyntaxNode(oid, this.readNextToken(Patterns.STRING_LITERAL)) : null
  }

  /**
   * @param {InheritanceFlagSyntaxNode[]} inheritance
   * @returns  {ObjectAttributeDeclarationExpressionSyntaxNode?}
   */
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

  /**
   * @returns {InheritanceFlagSyntaxNode?}
   */
  #tryReadNextAsInheritanceClause() {
    const inheritancePatterns = ['FINAL', 'INSTANTIABLE', 'OVERRIDING', 'PERSISTABLE']

    let tokens = this.tryReadNextTokens('NOT', inheritancePatterns) ?? this.tryReadNextTokens(inheritancePatterns)
    return tokens ? new InheritanceFlagSyntaxNode(...tokens) : null
  }

  /**
   * @returns {Generator<InheritanceFlagSyntaxNode>}
   * @generator
   * @yields {InheritanceFlagSyntaxNode}
   */
  *#tryReadNextAsInheritanceClauses() {
    let inheritance
    while (inheritance = this.#tryReadNextAsInheritanceClause()) {
      yield inheritance
    }
  }

  /**
   * @param {InheritanceFlagSyntaxNode[]} inheritance
   * @returns {ConstructorDeclarationStatementSyntaxNode}
   */
  #tryReadNextAsObjectConstructorMethod(inheritance) {
    // constructor is always function
    const constructor = this.tryReadNextTokens('CONSTRUCTOR', Patterns.FUNCTION)
    if (!constructor) {
      return null
    }

    return new ConstructorDeclarationStatementSyntaxNode({
      inheritance: inheritance,
      keyword: new SyntaxNode(...constructor),
      name: this.readNextAsIdentifier(),
      parameters: this.#tryReadNextAsParameterListDeclaration(),
      returnClause: new ConstructorReturnDeclarationExpressionSyntaxNode({
        keyword: new SyntaxNode(this.readNextTokens(Patterns.RETURN, 'SELF', 'AS', 'RESULT')),
        modifiers: [...this.#tryReadNextAsReturnModifiers()]
      })
    })
  }

  /**
   * @param {InheritanceFlagSyntaxNode[]} inheritance
   * @returns {MethodDeclarationStatementSyntaxNode}
   */
  #tryReadNextAsObjectMemberOrStaticMethod(inheritance) {
    const mapOrOrder = this.tryReadNextToken(['MAP', 'ORDER'])
    const memberOrStatic = this.tryReadNextTokens(['MEMBER', 'STATIC'], [Patterns.PROCEDURE, Patterns.FUNCTION])
    if (!memberOrStatic) {
      console.assert(!mapOrOrder, "MAP found but not [MEMBER|STATIC] [PROCEDURE|FUNCTION]")
      return null
    }

    return new ObjectMethodDeclarationStatementSyntaxNode({
      inheritance,
      mapOrOrder,
      memberOrStatic,
      name: this.readNextAsIdentifier(),
      parameters: this.#tryReadNextAsParameterListDeclaration(),
      returnClause: this.#tryReadNextAsReturnDeclaration()
    })
  }

  /**
   * @returns  {MethodDeclarationStatementSyntaxNode?}
   *
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
    throw this.syntaxError('Expected: parameter')
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

    return new ObjectMemberListDeclarationExpressionSyntaxNode({
      lparen,
      // It is (our) standard practice to put the OBJECT TYPE doc comment right after the opening parenthesis.
      // This is because Oracle understandably doesn't recognize comments before the CREATE statement as part of the package and it throws off line numbers, etc.
      docComment: this.#tryReadNextAsDocComment(),
      membersWithCommas: [...this.#tryReadNextAsObjectMemberDeclarationsWithCommas()],
      rparen: this.#readNextAsRightParen()
    })
  }

  #tryReadNextAsTypeModifier() {
    const not = this.tryReadNextToken('NOT')
    const inheritancePatterns = ['FINAL', 'INSTANTIABLE', 'OVERRIDING']
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
   * @param {UnitTypeSyntaxNode} unitType
   * @returns {CreateTypeStatementSyntaxNode}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/CREATE-TYPE-statement.html#GUID-389D603D-FBD0-452A-8414-240BBBC57034
   */
  #readNextAsTypeSpec(create, editionable, unitType) {
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
      throw this.notImplemented('CREATE TYPE ... UNDER ...')
    }

    // The other 3 require IS
    //  - object base type definition
    //  - nested table
    //  - varray
    const is = this.readNextToken(Patterns.IS_OR_AS)

    let keyword = this.tryReadNextToken('OBJECT')
    if (keyword) {
      return new CreateBaseObjectTypeStatementSyntaxNode({
        create, editionable, unitType,
        name,
        force, oid,
        authid, accessibleBy,
        is,
        keyword,
        members: this.#tryReadNextAsObjectMemberListDeclaration(),
        modifiers: [...this.#tryReadNextAsTypeModifiers()],
        terminator: this.tryReadNextToken(Patterns.END_OF_SQL_STATEMENT)
      })
    }

    keyword = this.tryReadNextToken('VARRAY') //, 'VARRAY', 'TABLE'])
    if (keyword) {
      throw this.notImplemented('IS VARRAY')
    }

    keyword = this.tryReadNextToken('TABLE')
    if (keyword) {
      return new CreateNestedTableTypeStatementSyntaxNode({
        create, editionable, unitType,
        name,
        force, oid,
        authid, accessibleBy,
        is,
        docComment: this.#tryReadNextAsDocComment(),
        specification: this.#readAsUnrestrictedTypeExpression(keyword),
        modifiers: [...this.#tryReadNextAsTypeModifiers()],
        terminator: this.tryReadNextToken(Patterns.END_OF_SQL_STATEMENT)
      })
    }

    throw this.notImplemented(this.iterator.value ?? is.lastToken, 'unknown TYPE type')
  }

  /**
   * @returns {UnitTypeSyntaxNode}
   */
  #readNextWhenUnitType() {
    let next = null
    if (next = this.tryReadNextTokens(['TYPE', 'PACKAGE'], 'BODY')) {
      // PACKAGE BODY, TYPE BODY
      return new UnitTypeSyntaxNode(next, { name: next.join(' ') })
    }

    if (next = this.tryReadNextTokens('MATERIALIZED', 'VIEW')) {
      return new UnitTypeSyntaxNode(next, { name: next.join(' ') })
    } else if (next = this.tryReadNextTokens('PUBLIC', 'SYNONYM')) {
      return new UnitTypeSyntaxNode(next, { name: next[1] })
    }

    // General case
    return new UnitTypeSyntaxNode([this.readNextToken(Patterns.ANY_KEYWORD)])
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

    // <unit-type>
    const unitType = this.#readNextWhenUnitType()
    switch (unitType.name) {
      case 'FUNCTION':
        return this.#readNextAsStandaloneFunction(create, editionable, unitType)
      case 'PROCEDURE':
        return this.#readNextAsStandaloneProcedure(create, editionable, unitType)
      case 'PACKAGE':
        return this.#readNextAsPackageSpec(create, editionable, unitType)
      case 'TYPE':
        return this.#readNextAsTypeSpec(create, editionable, unitType)
      default:
        console.assert(false, `${create.textSpan} Unit type '${unitType.name}' is not implemented`)
        return this.#readNextAsSqlStatement({ create, editionable, unitType })
    }
  }

  #readAsTypeIdentifier(token) {
    const identifier = this.#readAsIdentifier(token)

    // Look for special trailing symbols
    const percentType = this.tryReadNextTokens('%', Patterns.ANY_KEYWORD)
    if (percentType) {
      return new ExpressionSyntaxNode({ identifier, percentType })
    }

    return identifier
  }

  /** @returns {ExpressionSyntaxNode?} */
  #tryReadNextAsTypePrecisionExpression() {
    const lparen = this.#tryReadNextAsLeftParen()
    if (lparen) {
      return new ExpressionSyntaxNode({
        lparen,
        precision: this.#readNextAsNumberExpression(),
        rparen: this.#readNextAsRightParen()
      })
    }

    return null
  }

  /** @returns {ExpressionSyntaxNode?} */
  #tryReadNextAsTypePrecisionAndScaleExpression() {
    const lparen = this.#tryReadNextAsLeftParen()
    if (lparen) {
      const precision = this.readNextToken([Patterns.NUMBER_LITERAL, '*']) // e.g. `NUMBER(*,0)`
      const comma = this.tryReadNextToken(Patterns.COMMA)
      const scale = comma ? this.readNextToken(Patterns.NUMBER_LITERAL) : null
      return new ExpressionSyntaxNode({
        lparen,
        precision, comma, scale,
        rparen: this.#readNextAsRightParen()
      })
    }

    return null
  }

  /**
   * @returns {ExpressionSyntaxNode}
   */
  #readNextAsNumberExpression() {
    // LATER: Oracle allows references in a lot of places now as of 19c? 21c?.
    // For now just read a number literal
    return new ExpressionSyntaxNode(this.readNextToken(Patterns.NUMBER_LITERAL))
  }

  /**
   * `BINARY_INTEGER`
   * `BINARY_INTEGER RANGE 0..6`
   * @param {TokenLike} name
   * @returns  {ExpressionSyntaxNode}
   */
  #readAsIntegerTypeExpression(name) {
    const range = this.tryReadNextToken('RANGE')
    if (range) {
      const lower = this.#readNextAsNumberExpression()
      const comma = this.readNextToken(Patterns.DOTDOT)
      const upper = this.#readNextAsNumberExpression()

      return new ExpressionSyntaxNode({
        name,
        range: new ExpressionSyntaxNode({ keyword: range, lower, comma, upper })
      })
    }

    return new ExpressionSyntaxNode({ name })
  }

  /**
   * `INTERVAL DAY [(<precision>)]? TO SECOND [(<precision>)]?`
   * `INTERVAL YEAR [(<precision>)]? TO MONTH`
   * @param {TokenLike} name
   * @returns  {ExpressionSyntaxNode}
   */
  #readAsIntervalTypeExpression(name) {
    this.verify(Patterns.INTERVAL, name)

    const day = this.tryReadNextToken('DAY')
    if (day) {
      return new ExpressionSyntaxNode({
        name,
        day,
        dayPrecision: this.#tryReadNextAsTypePrecisionExpression(),
        to: this.readNextToken('TO'),
        second: this.readNextToken('SECOND'),
        secondPrecision: this.#tryReadNextAsTypePrecisionExpression()
      })
    }

    const year = this.tryReadNextToken('YEAR')
    if (year) {
      return new ExpressionSyntaxNode({
        name,
        year,
        yearPrecision: this.#tryReadNextAsTypePrecisionExpression(),
        to: this.readNextToken('TO'),
        second: this.readNextToken('MONTH')
      })
    }

    throw new NodeSyntaxError(name, "INTERVAL found, but not DAY or YEAR")
  }

  /**
   * `TIMESTAMP [(<length>)]? [WITH [LOCAL]? TIME ZONE]`
   * @param {TokenLike} name
   * @returns  {ExpressionSyntaxNode}
   */
  #readAsTimestampTypeExpression(name) {
    this.verify(Patterns.TIMESTAMP, name)

    const length = this.#tryReadNextAsTypePrecisionExpression()

    const withKeyword = this.tryReadNextToken('WITH')
    const timezoneSpecifier = withKeyword ? [
      withKeyword,
      this.tryReadNextToken('LOCAL'),
      ...this.readNextTokens('TIME', 'ZONE')
    ].filter(x => x) : null

    return new ExpressionSyntaxNode({
      keyword: name, length, timezoneSpecifier
    })
  }

  /**
   *
   * @param {TokenLike} name The initial name token for the type
   * @returns {ExpressionSyntaxNode | IdentifierSyntaxNode}
   */
  #readAsUnrestrictedTypeExpression(name) {
    switch (name.type) {
      case 'identifier':
        return this.#readAsTypeIdentifier(name)
      case 'reserved':
      case 'keyword':
        switch (name.value) {
          case 'BINARY_DOUBLE':
          case 'BINARY_FLOAT':
          case 'BLOB':
          case 'BOOLEAN':
          case 'CLOB':
          case 'DATE':
          case 'INTEGER':
            return new ExpressionSyntaxNode({ name })
          case 'BINARY_INTEGER':
          case 'PLS_INTEGER':
          case 'POSITIVE':
            return this.#readAsIntegerTypeExpression(name)
          case 'INTERVAL':
            return this.#readAsIntervalTypeExpression(name)
          case 'TIMESTAMP':
            return this.#readAsTimestampTypeExpression(name)
          case 'CHAR':
          case 'RAW':
          case 'VARCHAR':
          case 'VARCHAR2': {
            return new ExpressionSyntaxNode({
              name,
              length: this.#tryReadNextAsTypePrecisionExpression()
            })
          }
          case 'NUMBER': {
            return new ExpressionSyntaxNode({
              name,
              restrictions: this.#tryReadNextAsTypePrecisionAndScaleExpression()
            })
          }

          case 'EXCEPTION':
            // Special case: this is an exception, not a variable
            throw this.syntaxError('EXCEPTION not expected here')

          case 'TABLE':
            // nested table (`TABLE OF <type-expr>`)
            // @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/CREATE-TYPE-statement.html#GUID-389D603D-FBD0-452A-8414-240BBBC57034__NESTED_TABLE_TYPE_DEF-DC078C6A
            return new ExpressionSyntaxNode({
              name: name,
              of: this.readNextToken(Patterns.OF),
              valueType: this.#readNextAsTypeExpression()
            })

          default:
            // This is an identifier
            if (this.iterator.nextIs(Patterns.PERIOD)) {
              return this.#readAsTypeIdentifier(name)
            }

            // These are probably other reserved words we should handle. Warn for now.
            console.assert(false, `${name.textSpan}: unhandled type keyword`, name.value)
            return this.#readAsIdentifier(name)
        }
      default:
        throw this.syntaxError(name, 'Expected type expression')
    }
  }

  #readAsTypeExpression(token) {
    const type = this.#readAsUnrestrictedTypeExpression(token)
    const notNull = this.tryReadNextTokens('NOT', 'NULL')
    return new ExpressionSyntaxNode({ type, constraint: notNull })
  }

  #readNextAsTypeExpression() {
    let token = this.readNextToken([Patterns.RESERVED, Patterns.KEYWORD, Patterns.IDENTIFIER])
    return this.#readAsTypeExpression(token)
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
        break

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

  /**
   * @return {SyntaxNode?}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/DETERMINISTIC-clause.html#GUID-6AECC957-27CC-4334-9F43-0FBE88F92654
   */
  #tryReadNextAsDeterministicClause() {
    return SyntaxNode.asSyntaxNode(this.tryReadNextToken('DETERMINISTIC'))
  }

  /**
   * @return {ExpressionSyntaxNode?}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/PARALLEL_ENABLE-clause.html#GUID-CFF3C7D3-6438-44C2-9FAF-569F246C37CA
   */
  #tryReadNextAsParallelEnableClause() {
    const parallelEnable = this.tryReadNextToken('PARALLEL_ENABLE')
    if (!parallelEnable) {
      return null
    }

    const lparen = this.#tryReadNextAsLeftParen()
    if (lparen) {
      // LATER
      throw this.notImplemented('PARTITION BY clause not implemented')
    }

    return new ExpressionSyntaxNode({ parallelEnable })
  }

  /**
   * @return {ExpressionSyntaxNode?}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/PIPELINED-clause.html#GUID-FA182210-C68D-4E03-85B9-A6C681099705
   */
  #tryReadNextAsPipelinedClause() {
    const pipelined = this.tryReadNextToken('PIPELINED')
    if (!pipelined) {
      return null
    }

    // PIPELINED [[ROW|TABLE] POLYMORPHIC]? [[IS|USING] <identifier>]?
    const polymorphic = this.tryReadNextTokens(['ROW', 'TABLE'], 'POLYMORPHIC')
    const using = this.tryReadNextToken(['IS', 'USING'])
    if (using) {
      // PIPELINED [IS|USING] <identifier>
      return new ExpressionSyntaxNode({ pipelined, polymorphic, using, name: this.readNextAsIdentifier() })
    } else {
      return new ExpressionSyntaxNode({ pipelined, polymorphic })
    }
  }

  #tryReadNextAsReturnModifier() {
    // LATER: sharing_clause
    // LATER: invoker_rights_clause
    // LATER: accessible_by_clause
    // LATER: default_collation_clause

    const modifier = this.#tryReadNextAsDeterministicClause()
      // LATER: shard_enable_clause
      ?? this.#tryReadNextAsParallelEnableClause()
      // LATER: result_cache_clause
      // LATER: aggregate_clause
      ?? this.#tryReadNextAsPipelinedClause()
    if (modifier) {
      return modifier
    }

    // LATER: sql_macro_clause
    // LATER: body
    // LATER: call_spec
    // LATER: datatype
    // LATER: declare_section
    // LATER: parameter_declaration

    return null
  }

  *#tryReadNextAsReturnModifiers() {
    let modifier
    while (modifier = this.#tryReadNextAsReturnModifier()) {
      yield modifier
    }
  }


  #tryReadNextAsReturnDeclaration() {
    const keyword = this.tryReadNextToken(Patterns.RETURN)
    if (!keyword) {
      return null
    }

    return new ReturnDeclarationExpressionSyntaxNode({
      keyword,
      type: this.#readNextAsTypeExpression(), // yeah this means we eat `varchar2(x)` but who cares.
      modifiers: [...this.#tryReadNextAsReturnModifiers()]
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

    const mode = [
      this.#tryReadNextAsInMode(),
      this.#tryReadNextAsOutMode()
    ].filter(x => x)

    const type = this.#readNextAsTypeExpression()

    const defaultExpression = this.tryReadNextToken(Patterns.ANY_DEFAULT)
    const defaultValue = defaultExpression ? this.#readNextAsValueExpression() : null

    return new ParameterDeclarationExpressionSyntaxNode({ name, mode, type, defaultExpression, defaultValue })
  }

  #readNextAsParameterDeclaration() {
    const param = this.#tryReadNextAsParameterDeclaration()
    if (param) {
      return param
    }
    throw this.syntaxError(`Expected: parameter`)
  }

  * #tryReadNextAsParameterDeclarationsWithCommas() {
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
      returnClause: this.#tryReadNextAsReturnDeclaration(),
      terminator: this.#readNextAsTerminator()
    })
  }

  #readAsProcedureDeclaration(keyword) {
    this.verify(Patterns.PROCEDURE, keyword)

    return new ProcedureDeclarationStatementSyntaxNode({
      keyword,
      name: this.readNextAsIdentifier(),
      parameters: this.#tryReadNextAsParameterListDeclaration(),
      terminator: this.#readNextAsTerminator()
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
      terminator: this.#readNextAsTerminator()
    })
  }

  /**
   * @returns {SyntaxNode} The terminating semicolon
   */
  #readNextAsTerminator() {
    return new SyntaxNode(this.readNextToken(Patterns.SEMICOLON))
  }

  /**
   * Read as variable, constant, or exception.
   */
  #readAsVariableDeclaration(token) {
    const name = this.#readAsIdentifier(token)

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

    const defaultExpression = this.tryReadNextToken(Patterns.ANY_DEFAULT)
    const defaultValue = defaultExpression ? this.#readNextAsValueExpression() : null

    return new VariableDeclarationStatementSyntaxNode({
      name,
      constant,
      type,
      defaultExpression,
      defaultValue,
      terminator: this.readNextTokensUntil(';')
    })
  }

  #readAsContainedStatement(token) {
    return new SyntaxNode(token, ...this.readNextTokensUntil(';'))
  }

  #readAsProcedureStart(token) {
    return new SyntaxNode(token, ...this.readNextTokensUntil([';', 'IS', 'AS']))
  }

  /**
   * Read up until a SQL statement terminator (`;`, `/`).
   * @param {TokenLike} token
   * @returns {SyntaxNode}
   */
  #readAsEndOfSqlStatement(token) {
    return new SyntaxNode(token, ...this.readNextTokensUntil(Patterns.END_OF_SQL_STATEMENT))
  }

  /**
   * Read up until a SQL statement terminator (`;`, `/`).
   * @returns {SyntaxNode}
   */
  #readNextAsEndOfSqlStatement() {
    return new SyntaxNode(...this.readNextTokensUntil(Patterns.END_OF_SQL_STATEMENT))
  }

  /**
   * Read from the given token as an opaque SQL statement.  NOTE: will not work for multi-semicolon units like PL/SQL units.
   * @param {...SyntaxNodeOrToken} params
   * @returns {StatementSyntaxNode}
   */
  #readAsSqlStatement(token, ...params) {
    return new StatementSyntaxNode(token, ...params, this.#readNextAsEndOfSqlStatement())
  }

  /**
   * Read the terminator as an opaque SQL statement.  NOTE: will not work for multi-semicolon units like PL/SQL units.
   * @param {[key: string]: SyntaxNode} params Named nodes, if any
   * @returns {StatementSyntaxNode}
   */
  #readNextAsSqlStatement(...params) {
    return new StatementSyntaxNode(...params, this.#readNextAsEndOfSqlStatement())
  }

  #tryReadAsShowErrors(token) {
    const tokens = this.tryReadTokensIf(token, 'SHOW', 'ERRORS')
    if (tokens) {
      return new SyntaxNode(tokens)
    }

    return null
  }

  /**
   * Eat SQL*Plus command
   * @param {TokenLike} token
   * @returns {SyntaxNode}
   */
  #readAsSqlPlusCommand(token) {
    return new SyntaxNode(token, ...this.readNextTokensUntil({ type: 'sqlplus.command.end' }))
  }

  /**
   * Eat preprocessor directives
   * @param {TokenLike} token
   * @returns {SyntaxNode}
   */
  #readAsPreprocessorCommand(token) {
    // The preprocessor directives are:
    //  - $IF...$THEN
    //  - $ELSIF..$THEN
    //  - $ELSE (usually standalone)
    //  - $ERROR..$END
    //  - $END (usually standalone)

    this.verify(Patterns.PREPROCESSOR.KEYWORD, token)
    switch (token.value) {
      case 'IF':
      case 'ELSIF':
        // read to $THEN
        return new PreprocessorSyntaxNode(token, ...this.readNextTokensUntil(Patterns.PREPROCESSOR.THEN))
      case 'ELSE':
      case 'END':
        // only one
        return new PreprocessorSyntaxNode(token)
      case 'ERROR':
        // read to $END
        return new PreprocessorSyntaxNode(token, ...this.readNextTokensUntil(Patterns.PREPROCESSOR.END))
      default:
        throw this.syntaxError(token, `Unexpected preprocessor directive`)
    }
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
              console.assert(false, `${token.textSpan} unexpected keyword`, token.value)
              return this.#readAsSqlStatement(token)
          }
          break

        case 'operator':
          switch (token.value) {
            case '/':
              // terminating slash
              return new EmptyStatementSyntaxNode(token)
            case '@':
            case '@@':
              // SQL*Plus file invocation operator
              return this.#readAsSqlPlusCommand(token)
          }
          break

        case 'preprocessor.keyword':
          return this.#readAsPreprocessorCommand(token)
      }

      // Fallthrough logic, read for a semicolon or a slash.
      console.assert(false, `${token.textSpan} unrecognized token`, token)
      return this.#readAsEndOfSqlStatement(token)
    }
  }
}
exports.PlsqlNodeReader = PlsqlNodeReader

class CreateStatementSyntaxNode extends StatementSyntaxNode {
  /** @property {UnitTypeSyntaxNode} unitType */
  /** @property {IdentifierSyntaxNode} name */
  /** @property {SyntaxNode[]} */ content

  /**
   * @param {SyntaxNode} create
   * @param {SyntaxNode?} editionable
   * @param {UnitTypeSyntaxNode} unitType
   * @param {IdentifierSyntaxNode} name
   * @param {SyntaxNode[]} content
   */
  constructor({ create, editionable, unitType, name, content }) {
    super(create, editionable, unitType, name, content)
    this.unitType = unitType
    this.name = name
    this.content = content
  }
}

class CreatePlsqlUnitStatementSyntaxNode extends StatementSyntaxNode {
  /** @property {SyntaxNode} */ unitType
  /** @property {SyntaxNode} */ name
  /** @property {SyntaxNode?} */ docComment

  /** @override */
  *getDocumentComments() {
    yield* super.getDocumentComments()

    if (this.docComment) {
      yield* this.docComment.allTokens.filter(t => t.type === 'comment.doc')
    }
  }
}
exports.CreatePlsqlUnitStatementSyntaxNode = CreatePlsqlUnitStatementSyntaxNode

class CreatePackageStatementSyntaxNode extends CreatePlsqlUnitStatementSyntaxNode {
  /** @property {SyntaxNode} */ is

  /** @type {SyntaxNode[]} */ members

  /**
   * @param {object} params
   * @param {SyntaxNode} params.create
   * @param {SyntaxNode?} params.editionable
   * @param {UnitTypeSyntaxNode} params.unitType
   * @param {SyntaxNode} params.name
   * @param {SyntaxNode?} params.authid
   * @param {SyntaxNode?} params.accessibleBy
   * @param {SyntaxNode} params.is
   * @param {TokenLike?} params.docComment
   * @param {SyntaxNode[]} params.content
   */
  constructor({ create, editionable, unitType, name, authid, accessibleBy, is, docComment, content }) {
    super(create, editionable, unitType, name, authid, accessibleBy, is, docComment, ...content)
    this.unitType = unitType
    this.name = name
    this.docComment = docComment
    this.members = content.filter(x => x instanceof DeclarationStatementSyntaxNode)
  }
}

/**
 * `CREATE TYPE`
 */
class CreateTypeStatementSyntaxNode extends CreatePlsqlUnitStatementSyntaxNode {
  /** @property {SyntaxNode[]} */ modifiers
}
exports.CreateTypeStatementSyntaxNode = CreateTypeStatementSyntaxNode

class CreateBaseObjectTypeStatementSyntaxNode extends CreateTypeStatementSyntaxNode {
  /** @property {SyntaxNode} */ type
  /** @property {SyntaxNode} */ is

  /** @type {ObjectMemberListDeclarationExpressionSyntaxNode} */ #members

  /**
   * @param {object} params
   * @param {SyntaxNode} params.create
   * @param {SyntaxNode?} params.editionable
   * @param {UnitTypeSyntaxNode} params.unitType
   * @param {SyntaxNode} params.name
   * @param {SyntaxNode?} params.authid
   * @param {SyntaxNode?} params.accessibleBy
   * @param {SyntaxNode} params.is
   * @param {SyntaxNode} params.keyword
   * @param {ObjectMemberListDeclarationExpressionSyntaxNode} params.members
   * @param {SyntaxNode[]} params.modifiers
   * @param {SyntaxNode} params.terminator
   */
  constructor({ create, editionable, unitType, name, force, oid, authid, accessibleBy, is, keyword, members, modifiers, terminator }) {
    super(create, editionable, unitType, name, force, oid, authid, accessibleBy, is, keyword, members, modifiers, terminator)
    this.unitType = unitType
    this.name = name
    this.#members = members
    this.modifiers = modifiers

    // Doc comment comes from members
    this.docComment = members.docComment

    // SPECIAL: set the return type for constructors
    for (const constructor of this.constructors) {
      constructor.returnClause.type ??= this.name
    }
  }

  /** @type {ConstructorDeclarationStatementSyntaxNode[]} */
  get constructors() {
    return this.methods.filter(m => m instanceof ConstructorDeclarationStatementSyntaxNode)
  }

  get members() { return this.#members.members }
  get attributes() { return this.#members.attributes }
  get methods() { return this.#members.methods }
}
exports.CreateBaseObjectTypeStatementSyntaxNode = CreateBaseObjectTypeStatementSyntaxNode

class CreateNestedTableTypeStatementSyntaxNode extends CreateTypeStatementSyntaxNode {
  /** @property {SyntaxNode} */ is
  /** @property {ExpressionSyntaxNode} */ specification

  /**
   * @param {object} params
   * @param {SyntaxNode} params.create
   * @param {SyntaxNode?} params.editionable
   * @param {UnitTypeSyntaxNode} params.unitType
   * @param {SyntaxNode} params.name
   * @param {SyntaxNode?} params.authid
   * @param {SyntaxNode?} params.accessibleBy
   * @param {SyntaxNode} params.is
   * @param {TokenLike?} params.docComment
   * @param {ExpressionSyntaxNode} params.specification
   * @param {SyntaxNode[]} params.modifiers
   * @param {SyntaxNode} params.terminator
   */
  constructor({ create, editionable, unitType, name, force, oid, authid, accessibleBy, is, docComment, specification, modifiers, terminator }) {
    super(create, editionable, unitType, name, force, oid, authid, accessibleBy, is, docComment, specification, modifiers, terminator)
    this.unitType = unitType
    this.name = name
    this.docComment = docComment
    this.modifiers = modifiers
  }
}
exports.CreateBaseObjectTypeStatementSyntaxNode = CreateBaseObjectTypeStatementSyntaxNode

class EmptyStatementSyntaxNode extends StatementSyntaxNode {
  constructor(terminator) {
    super(terminator)
    this.terminator = terminator
  }
}

/**
 * @abstract
 */
class DeclarationStatementSyntaxNode extends StatementSyntaxNode {
  /** @type {IdentifierSyntaxNode} The name of the declaration. */ name

  /**
   * @param {...SyntaxNodeOrToken} params
   */
  constructor(...params) {
    super(...params)
    this.name = this.children.find(c => c instanceof IdentifierSyntaxNode)
    this.terminator = this.children.reverse().find(c => c instanceof EmptyStatementSyntaxNode)
  }
}
exports.DeclarationStatementSyntaxNode = DeclarationStatementSyntaxNode

class ExceptionDeclarationStatementSyntaxNode extends DeclarationStatementSyntaxNode {

  /**
   * @param {object} params
   * @param {IdentifierSyntaxNode} params.name
   * @param {TokenLike} params.keyword
   * @param {SyntaxNode} params.terminator
   */
  constructor({ name, keyword, terminator }) {
    super(name, keyword, terminator)
    console.assert(this.name === name)
    // TODO console.assert(this.terminator === terminator)
    this.keyword = keyword
  }
}
exports.ExceptionDeclarationStatementSyntaxNode = ExceptionDeclarationStatementSyntaxNode


class VariableDeclarationStatementSyntaxNode extends DeclarationStatementSyntaxNode {
  /** @type {SyntaxNode} */ constant
  /** @type {SyntaxNode} */ type
  /** @type {SyntaxNode?} The `default` keyword or symbol (`:=`) */ defaultExpression
  /** @type {SyntaxNode?} */ defaultValue

  /**
   * @param {NamedNodeParams} params
   * @param {IdentifierSyntaxNode} params.name
   * @param {SyntaxNode} params.constant
   * @param {SyntaxNode} params.type
   * @param {SyntaxNode?} params.defaultExpression The `default` keyword or symbol (`:=`)
   * @param {SyntaxNode?} params.defaultValue
   * @param {SyntaxNode} params.terminator
   */
  constructor({ name, constant, type, defaultExpression, defaultValue, terminator }) {
    super(name, constant, type, defaultExpression, defaultValue, terminator)

    console.assert(this.name === name)
    // TODO console.assert(this.terminator === terminator)
    this.constant = constant
    this.type = type
    this.defaultExpression = defaultExpression
    this.defaultValue = defaultValue
  }

  get isConstant() {
    return !!this.constant
  }
}

class TypeDeclarationStatementSyntaxNode extends DeclarationStatementSyntaxNode {
  /** @property {ExpressionSyntaxNode} */ specification

  /**
   * @param {...SyntaxNodeOrToken} params
   */
  constructor(...params) {
    super(...params)

    // TODO this.specification = ...
  }
}
exports.TypeDeclarationStatementSyntaxNode = TypeDeclarationStatementSyntaxNode

class SubtypeDeclarationStatementSyntaxNode extends TypeDeclarationStatementSyntaxNode {

  /**
   * @param {NamedNodeParams} params
   * @param {SyntaxNode} params.keyword
   * @param {IdentifierSyntaxNode} params.name
   * @param {SyntaxNode} params.is
   * @param {ExpressionSyntaxNode} params.specification
   * @param {SyntaxNode} params.terminator
   */
  constructor({ keyword, name, is, specification, terminator }) {
    super(keyword, name, is, specification, terminator)
    this.keyword = keyword
    this.name = name
    // TODO console.assert(this.terminator === terminator)
    this.specification = specification
  }
}

class ProcedureDeclarationStatementSyntaxNode extends DeclarationStatementSyntaxNode {
  /** @type {SyntaxNode} */ keyword
  /** @type {string} A unique ID for this procedure within context. */ id
  /** @type {ParameterListDeclarationExpressionSyntaxNode?} The procedure name. */ parameters

  /**
   * @param {NamedNodeParams} params
   * @param {TokenLike} params.keyword  The initial token (`PROCEDURE`)
   * @param {IdentifierSyntaxNode} params.name
   * @param {ParameterListDeclarationExpressionSyntaxNode?} params.parameters
   * @param {SyntaxNode?} params.terminator
   */
  constructor({ keyword, name, parameters, terminator }) {
    super(keyword, name, parameters, terminator)
    // TODO console.assert(this.name === name)
    // TODO console.assert(this.terminator === terminator)
    this.name = name
    this.terminator = terminator
    this.keyword = keyword
    this.parameters = parameters
  }
}

class FunctionDeclarationStatementSyntaxNode extends DeclarationStatementSyntaxNode {
  /** @type {SyntaxNode} */ keyword
  /** @type {string} A unique ID for this procedure within context. */ id
  /** @type {IdentifierSyntaxNode} The procedure name. */ name
  /** @type {ParameterListDeclarationExpressionSyntaxNode?} The procedure name. */ parameters

  /**
   * @param {NamedNodeParams} params
   * @param {TokenLike} params.token  The initial token (`FUNCTION`)
   * @param {IdentifierSyntaxNode} params.name
   * @param {ParameterListDeclarationExpressionSyntaxNode?} params.parameters
   * @param {ReturnDeclarationExpressionSyntaxNode} params.returnClause
   * @param {SyntaxNode?} params.terminator
   */
  constructor({ keyword, name, parameters, returnClause, terminator }) {
    super(keyword, name, parameters, returnClause, terminator)
    this.keyword = keyword
    this.name = name
    this.parameters = parameters
    this.returnClause = returnClause
    this.terminator = terminator
  }
}

class MethodDeclarationStatementSyntaxNodeBase extends DeclarationStatementSyntaxNode { }
exports.MethodDeclarationStatementSyntaxNodeBase = MethodDeclarationStatementSyntaxNodeBase

class MethodDeclarationStatementSyntaxNode extends MethodDeclarationStatementSyntaxNodeBase {
  /** @type {SyntaxNode} [procedure|function] */ keyword
  /** @type {string} A unique ID for this procedure within context. */ id
  /** @type {IdentifierSyntaxNode} The procedure name. */ name
  /** @type {ParameterListDeclarationExpressionSyntaxNode?} The procedure name. */ parameters
  /** @type {ReturnDeclarationExpressionSyntaxNode?} The return clause, if function */ returnClause

  /**
   * @param {NamedNodeParams} params
   * @param {SyntaxNode} params.keyword  The initial token (`FUNCTION`)
   * @param {IdentifierSyntaxNode} params.name
   * @param {ParameterListDeclarationExpressionSyntaxNode?} params.parameters
   * @param {ReturnDeclarationExpressionSyntaxNode?} params.returnClause
   */
  constructor({ keyword, name, parameters, returnClause, terminator }) {
    super(keyword, name, parameters, returnClause, terminator)
    this.keyword = keyword
    this.name = name
    this.parameters = parameters
    this.returnClause = returnClause
    this.terminator = terminator
  }
}
exports.MethodDeclarationStatementSyntaxNode = MethodDeclarationStatementSyntaxNode

class ObjectMethodDeclarationStatementSyntaxNode extends MethodDeclarationStatementSyntaxNodeBase {

  /** @type {InheritanceFlagSyntaxNode[]} */ inheritance
  /** @type {SyntaxNode} */ memberOrStatic
  /** @param {SyntaxNode?} */ mapOrOrder

  /**
   *
   * @param {NamedNodeParams} params
   * @param {InheritanceFlagSyntaxNode[]} params.inheritance
   * @param {SyntaxNode?} params.mapOrOrder
   * @param {SyntaxNode?} params.memberOrStatic
   * @param {IdentifierSyntaxNode} params.name
   * @param {ParameterListDeclarationExpressionSyntaxNode?} params.parameters
   * @param {ReturnDeclarationExpressionSyntaxNode?} params.returnClause
   */
  constructor({ inheritance, mapOrOrder, memberOrStatic, name, parameters, returnClause }) {
    super(inheritance, mapOrOrder, memberOrStatic, name, parameters, returnClause)
    this.name = name
    this.inheritance = inheritance
    this.mapOrOrder = mapOrOrder
    this.memberOrStatic = memberOrStatic
  }
}

/**
 * Marker subclass dealing with constructor functions
 */
class ConstructorDeclarationStatementSyntaxNode extends ObjectMethodDeclarationStatementSyntaxNode { }
exports.ConstructorDeclarationStatementSyntaxNode = ConstructorDeclarationStatementSyntaxNode


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

/**
 * Node representing the Oracle SQL or PL/SQL unit type.
 */
class UnitTypeSyntaxNode extends SyntaxNode {
  /**
   * @param {TokenLike[]} tokens
   * @param {object} params
   * @param {string?} params.name How Oracle refers to this.  Oracle has compound keywords like `PUBLIC SYNONYM` and `PACKAGE BODY`, but in those the primary ones are `SYNONYM` and `PACKAGE BODY` respectively.
   */
  constructor(tokens, { name } = {}) {
    if (!tokens) throw new Error(`tokens cannot be undefined/null`)
    if (!tokens.length) throw new Error(`tokens cannot be empty`)
    super(...tokens)

    this.name = name?.toString() ?? tokens[0].value
  }

  /** @type {string} The canonical name of the type; e.g., `SYNONYM`. */ name
}

class ParameterDeclarationExpressionSyntaxNode extends ExpressionSyntaxNode {

  /** @type {IdentifierSyntaxNode} */ name
  /** @type {SyntaxNode[]} */ mode
  /** @type {SyntaxNode} */ type
  /** @type {SyntaxNode?} The `default` keyword or symbol (`:=`) */ defaultExpression
  /** @type {SyntaxNode?} */ defaultValue

  /**
   * @param {object} params
   * @param {SyntaxNode?} params.defaultExpression The `default` keyword or symbol (`:=`)
   */
  constructor({ name, mode, type, defaultExpression, defaultValue }) {
    super(name, mode, type, defaultExpression, defaultValue)
    this.name = name
    this.mode = mode
    this.type = type
    this.defaultExpression = defaultExpression
    this.defaultValue = defaultValue
  }
}
exports.ParameterDeclarationExpressionSyntaxNode = ParameterDeclarationExpressionSyntaxNode

class ReturnDeclarationExpressionSyntaxNode extends ExpressionSyntaxNode {

  /** @type {SyntaxNode} */ type
  /** @type {SyntaxNode[]} */ modifiers = []

  /**
   *
   * @param {object} params
   * @param {TokenLike} keyword
   * @param {ExpressionSyntaxNode?} type
   * @param {SyntaxNode[]} modifiers
   */
  constructor({ keyword, type, modifiers }) {
    super(keyword, type, modifiers)
    this.keyword = keyword
    this.type = type
    this.modifiers = modifiers
  }
}
exports.ReturnDeclarationExpressionSyntaxNode = ReturnDeclarationExpressionSyntaxNode

class ConstructorReturnDeclarationExpressionSyntaxNode extends ReturnDeclarationExpressionSyntaxNode {

  /**
   * @param {object} params
   * @param {SyntaxNodeOrTokenLike} keyword
   * @param {TokenLike[]} tokens
   */
  constructor({ keyword, modifiers }) {
    super(keyword, modifiers)
    this.keyword = keyword
    this.modifiers = modifiers
  }
}
exports.ConstructorReturnDeclarationExpressionSyntaxNode = ConstructorReturnDeclarationExpressionSyntaxNode

class ParameterListDeclarationExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {ParameterDeclarationExpressionSyntaxNode[]} */ parameters

  constructor(lparen, parametersWithCommas, rparen) {
    super(lparen, ...parametersWithCommas, rparen)
    this.parameters = parametersWithCommas.filter(x => x instanceof ParameterDeclarationExpressionSyntaxNode)
  }
}
exports.ParameterListDeclarationExpressionSyntaxNode = ParameterListDeclarationExpressionSyntaxNode

class AccessorListExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {ExpressionSyntaxNode[]} */ accessors

  constructor(lparen, accessorsWithCommas, rparen) {
    super(lparen, ...accessorsWithCommas, rparen)
    this.accessors = accessorsWithCommas.filter(x => x instanceof ExpressionSyntaxNode)
  }
}
exports.AccessorListDeclarationExpressionSyntaxNode = AccessorListExpressionSyntaxNode

// ---------

class ObjectMemberDeclarationExpressionSyntaxNode extends ExpressionSyntaxNode {

  /** @property {IdentifierSyntaxNode} */ name

  /**
   *
   * @param {IdentifierSyntaxNode} name
   * @param  {...SyntaxNode} params
   */
  constructor(name, ...params) {
    super(name, ...params)
    console.assert(name, 'oops')
    this.name = name
  }
}
exports.ObjectMemberDeclarationExpressionSyntaxNode = ObjectMemberDeclarationExpressionSyntaxNode

class ObjectAttributeDeclarationExpressionSyntaxNode extends ObjectMemberDeclarationExpressionSyntaxNode {

  /** @type {SyntaxNode} */ type
  /** @type {InheritanceFlagSyntaxNode[]} */ inheritance

  /**
   *
   * @param {object} param0
   * @param {IdentifierSyntaxNode} param0.name
   * @param {SyntaxNode} param0.type
   * @param {InheritanceFlagSyntaxNode[]} param0.inheritance
   */
  constructor(name, type, inheritance) {
    super(name, type, inheritance) // eat what we take, even if it doesn't apply
    console.assert(this.name === name)
    this.type = type
    this.inheritance = inheritance
  }

  get specification() {
    return this.type
  }
}
exports.ObjectAttributeDeclarationExpressionSyntaxNode = ObjectAttributeDeclarationExpressionSyntaxNode

class ObjectMemberListDeclarationExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {SyntaxNode?} The type's doc comment */ docComment
  /** @type {ObjectAttributeDeclarationExpressionSyntaxNode[]} */ attributes
  /** @type {MethodDeclarationStatementSyntaxNode[]} */ methods

  constructor({ lparen, docComment, membersWithCommas, rparen }) {
    super(lparen, docComment, ...membersWithCommas, rparen)
    this.docComment = docComment
    this.attributes = membersWithCommas.filter(x => x instanceof ObjectAttributeDeclarationExpressionSyntaxNode)
    this.methods = membersWithCommas.filter(x => x instanceof MethodDeclarationStatementSyntaxNode)
  }

  /** @type {SyntaxNode[]} */
  get members() {
    return this.attributes.concat(this.methods)
  }
}
exports.ObjectMemberListDeclarationExpressionSyntaxNode = ObjectMemberListDeclarationExpressionSyntaxNode

// dumb syntax node, do not export
class PreprocessorSyntaxNode extends SyntaxNode {
}

class InheritanceFlagSyntaxNode extends SyntaxNode {

  /** @type {SyntaxNode?} */ not
  /** @type {SyntaxNode} */ name
  /** @type {boolean} */ value = true

  constructor(...tokens) {
    super(...tokens)
    this.name = tokens.at(-1)
    if (tokens.length === 2) {
      this.not = tokens[0]
    }
    this.value = !this.not
  }
}
