const { console } = require('../debug')
const {
  ExpressionSyntaxNode,
  IdentifierSyntaxNode,
  StatementSyntaxNode,
  SyntaxNode,
  SyntaxNodeOrToken,
  SyntaxNodeReader,
  Token,
  TokenLike,
  TokenPattern,
  Annotation,
} = require('../syntax')
const { TokenFormat, TokenSyntaxError } = require('../token')

console.setAsSeen('DATE_LTZ', 'TIMESTAMP_LTZ', 'GUID', 'GUIDS') // HACK ignore these, these are vAuto Commons aliases
console.setAsSeen('SYNONYM') // HACK we know these aren't handled, stop telling us

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
  static NEWLINE = { type: 'newline' }

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

  static CURSOR = Patterns.reserved('CURSOR')
  static DEFAULT = Patterns.reserved('DEFAULT')
  static EXCEPTION = Patterns.reserved('EXCEPTION')
  static INTERVAL = Patterns.keyword('INTERVAL')
  static REF = Patterns.keyword('REF')
  static RETURN = Patterns.keyword('RETURN')
  static TIMESTAMP = Patterns.keyword('TIMESTAMP')

  // Loose reserved/keyword matching
  static ANY_KEYWORD = [Patterns.RESERVED, Patterns.KEYWORD]

  // Loose identifier matching (allows keywords, a few reserved words)
  static ANY_IDENTIFIER = [
    Patterns.IDENTIFIER,
    Patterns.KEYWORD,
    Patterns.RESERVED
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

  static SEMICOLON = Patterns.operator(';')
  static SLASH = Patterns.operator('/')
  static END_OF_SQL_STATEMENT = [Patterns.SEMICOLON, Patterns.SLASH]

  static IS_OR_AS = [Patterns.IS, Patterns.AS]

  static FUNCTION = Patterns.reserved('FUNCTION')
  static PRAGMA = Patterns.keyword('PRAGMA')
  static PROCEDURE = Patterns.reserved('PROCEDURE')
  static PACKAGE = Patterns.keyword('PACKAGE') // yes, it's keyword.
  static TRIGGER = Patterns.reserved('TRIGGER')
  static TYPE = Patterns.reserved('TYPE')

  static PLSQL_UNIT_KIND = [
    Patterns.FUNCTION, Patterns.PROCEDURE, Patterns.PACKAGE, Patterns.TRIGGER, Patterns.TYPE
  ]


  static EDITIONABLE = Patterns.keyword('EDITIONABLE')
  static EDITIONING = Patterns.keyword('EDITIONING')
  static NONEDITIONABLE = Patterns.keyword('NONEDITIONABLE')
}

/**
 * @typedef {TokenFormat | 'FILE'} PlsqlIdentifierFormat
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
   * @param {PlsqlIdentifierFormat} format
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
 * @exports PlsqlName
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
   * @param {PlsqlIdentifierFormat} format
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
   * @param {PlsqlIdentifierFormat} format
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
  *#readToEndOfLine() {
    while (!this.iterator.next().done) {
      const token = this.iterator.value
      yield token
      if (token.type === 'newline') {
        break
      }
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
            case 'PROCEDURE':
              yield this.#readAsProcedureDeclaration(token)
              continue
            case 'FUNCTION':
              yield this.#readAsFunctionDeclaration(token)
              continue
            case 'PRAGMA':
              yield this.#readAsPragma(token)
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

  /**
   * @returns {LiteralSyntaxNode?}
   */
  #tryReadNextAsStringLiteral() {
    return SyntaxNode.asSyntaxNode(this.tryReadNextToken(Patterns.STRING_LITERAL))
  }

  /**
   * @returns {LiteralSyntaxNode}
   */
  #readNextAsStringLiteral() {
    return SyntaxNode.asSyntaxNode(this.readNextToken(Patterns.STRING_LITERAL))
  }

  #tryReadNextAsTypeOid() {
    const oid = this.tryReadNextToken('OID')
    return oid ? new ExpressionSyntaxNode(oid, this.#readNextAsStringLiteral()) : null
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
  #tryReadNextAsInheritanceFlag() {
    const inheritancePatterns = ['FINAL', 'INSTANTIABLE', 'OVERRIDING', 'PERSISTABLE']

    let tokens = this.tryReadNextTokens('NOT', inheritancePatterns) ?? this.tryReadNextTokens(inheritancePatterns)
    return tokens ? new InheritanceFlagSyntaxNode(...tokens) : null
  }

  /**
   * @returns {Generator<InheritanceFlagSyntaxNode>}
   * @generator
   * @yields {InheritanceFlagSyntaxNode}
   */
  *#tryReadNextAsInheritanceFlags() {
    let inheritance
    while (inheritance = this.#tryReadNextAsInheritanceFlag()) {
      yield inheritance
    }
  }

  /**
   * @param {InheritanceFlagSyntaxNode[]} inheritance
   * @returns {ConstructorDeclarationStatementSyntaxNode?}
   */
  #tryReadNextAsObjectConstructorMethod(inheritance) {
    // constructor is always function
    const tokens = this.tryReadNextTokens('CONSTRUCTOR', Patterns.FUNCTION)
    if (!tokens) {
      return null
    }


    const [constructor, functionKeyword] = tokens
    return new ConstructorDeclarationStatementSyntaxNode({
      inheritance: inheritance,
      constructor,
      functionKeyword,
      name: this.readNextAsIdentifier(),
      parameters: this.#tryReadNextAsParameterListDeclaration(),
      returnClause: new ConstructorReturnDeclarationExpressionSyntaxNode({
        keyword: new SyntaxNode(this.readNextTokens(Patterns.RETURN, 'SELF', 'AS', 'RESULT')),
        modifiers: [...this.#tryReadNextAsReturnModifiers()]
      })
    })
  }

  /**
   * `[MAP|ORDER]? [MEMBER|STATIC] [PROCEDURE|FUNCTION] <identifier>...`
   * @param {InheritanceFlagSyntaxNode[]} inheritance
   * @returns {ObjectMethodDeclarationStatementSyntaxNode?}
   */
  #tryReadNextAsObjectMemberOrStaticMethod(inheritance) {
    const requiredPatterns = [['MEMBER', 'STATIC'], [Patterns.PROCEDURE, Patterns.FUNCTION]]
    const tokens = this.tryReadNextTokens(['MAP', 'ORDER'], ...requiredPatterns)
      ?? this.tryReadNextTokens(...requiredPatterns)
    if (!tokens) {
      return null
    }

    const [mapOrOrder, memberOrStatic, keyword] = tokens.length === 3 ? tokens : [null, ...tokens]

    return new ObjectMethodDeclarationStatementSyntaxNode({
      inheritance,
      mapOrOrder, memberOrStatic, keyword,
      name: this.readNextAsIdentifier(),
      parameters: this.#tryReadNextAsParameterListDeclaration(),
      returnClause: this.#tryReadNextAsReturnDeclaration()
    })
  }

  /**
   * @returns  {ObjectAttributeDeclarationExpressionSyntaxNode? | ObjectMemberDeclarationExpressionSyntaxNode?}
   * element_type: @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/element-specification.html#GUID-20D95D8A-5C17-4C89-9AAB-1852CDB57CE2
   */
  #tryReadNextAsObjectMemberDeclaration() {
    const inheritance = [...this.#tryReadNextAsInheritanceFlags()]

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
      console.assert(param instanceof ObjectMethodDeclarationStatementSyntaxNodeBase || param instanceof ObjectAttributeDeclarationExpressionSyntaxNode)
      return param
    }
    throw this.syntaxError('Expected: object member')
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
        console.assertOnce(unitType.name, false, `${create.textSpan} Unit type '${unitType.name}' is not implemented`)
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

    throw new TokenSyntaxError(name, "INTERVAL found, but not DAY or YEAR")
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

  #readAsRefCursorTypeExpression(ref, cursor) {

  }

  #readAsRefTypeExpression(ref) {
    this.verify(Patterns.REF, ref)
    const cursor = this.tryReadNextToken(Patterns.CURSOR)
    if (cursor) {
      // REF CURSOR type expression
      return this.#readAsRefCursorTypeExpression(ref, cursor)
    }

    // Some other ref type.
    // Compositing it this way so we cover all the bases though 99% of the cases are REF <some object type>.
    return new ExpressionSyntaxNode({ ref, type: this.#readNextAsTypeExpression() })
  }

  /**
   *
   * @param {TokenLike} name The initial name token for the type
   * @returns {ExpressionSyntaxNode | IdentifierSyntaxNode}
   */
  #readAsUnrestrictedTypeExpression(name) {
    this.verify(Patterns.ANY_IDENTIFIER, name)

    // If followed by a period, assume it is a multi-part identifier.
    if (this.iterator.nextIs(Patterns.PERIOD)) {
      return this.#readAsTypeIdentifier(name)
    }

    // ORACRAP: Many of the core types (e.g., BINARY_INTEGER) are NOT reserved -OR- keyword word despite being in the STANDARD package.
    // So we cannot check them for reserved/keyword status, but we do know (based on above) that they are standalone.

    switch (name.value) {
      // Single-word types without length/precision/scale
      case 'BFILE':
      case 'BINARY_DOUBLE':
      case 'BINARY_FLOAT':
      case 'BLOB':
      case 'BOOLEAN':
      case 'CFILE':
      case 'CLOB':
      case 'DATE':
      case 'SYS_REFCURSOR':
      case 'ROWID':
      case 'UROWID':
      case 'YMINTERVAL_UNCONSTRAINED': // alias for INTERVAL YEAR (9) TO MONTH
      case 'DSINTERVAL_UNCONSTRAINED': // alias for INTERVAL DAY (9) TO SECOND (9)
      case 'TIMESTAMP_UNCONSTRAINED': // alias for TIMESTAMP(9)
      case 'TIMESTAMP_LTZ_UNCONSTRAINED': // alias for TIMESTAMP(9) WITH LOCAL TIME ZONE
      case 'TIMESTAMP_TZ_UNCONSTRAINED': // alias for TIMESTAMP(9) WITH TIME ZONE
        return new ExpressionSyntaxNode({ name })
      case 'BINARY_INTEGER':
      case 'NATURAL':
      case 'NATURALN':
      case 'PLS_INTEGER':
      case 'POSITIVE':
      case 'POSITIVEN':
      case 'SIMPLE_INTEGER':
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
      case 'DECIMAL':
      case 'INTEGER': // nonrangeable, can specify precision/scale
      case 'NUMBER': {
        return new ExpressionSyntaxNode({
          name,
          restrictions: this.#tryReadNextAsTypePrecisionAndScaleExpression()
        })
      }

      case 'EXCEPTION':
        // Special case: this is an exception, not a variable
        throw this.syntaxError('EXCEPTION not expected here')

      case 'REF':
        return this.#readAsRefTypeExpression(name)

      case 'TABLE':
        // nested table (`TABLE OF <type-expr>`)
        // @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/CREATE-TYPE-statement.html#GUID-389D603D-FBD0-452A-8414-240BBBC57034__NESTED_TABLE_TYPE_DEF-DC078C6A
        return new ExpressionSyntaxNode({
          name: name,
          of: this.readNextToken(Patterns.OF),
          valueType: this.#readNextAsTypeExpression()
        })

      case 'LONG':
        // oh boy, the ancient LONG/LONG RAW types
        return new ExpressionSyntaxNode(long, this.tryReadNextToken('RAW'))

      default:
        if (!name.value.endsWith('_T')) {
          // These are possibly other reserved words we should handle. Warn for now.
          // if (!this.#singleTypeKeywordsSeen.has(name.value)) {
          //   this.#singleTypeKeywordsSeen.add(name.value)
          console.assertOnce(name.value, false, `${name.textSpan}: unhandled type keyword`, name.value)
          // }
        }
        return this.#readAsIdentifier(name)
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
  #tryReadNextAsSingleValueExpression() {
    const token = this.tryReadNextToken()
    return token ? this.#readAsSingleValueExpression(token) : null
  }

  /**
   * Reads a simple value expression.
   * @returns {ExpressionSyntaxNode}
   */
  #readNextAsSingleValueExpression() {
    return this.#readAsSingleValueExpression(this.readNextToken())
  }

  /**
   * `(<expr>)`
   * @param {TokenLike} token
   * @returns {ParenthesizedExpressionSyntaxNode}
   */
  #readAsParenthesizedExpression(token) {
    this.verify(Patterns.LPAREN, token)
    return new ParenthesizedExpressionSyntaxNode({
      left: SyntaxNode.asSyntaxNode(token),
      expression: this.#readNextAsValueExpression(),
      right: this.readNextToken(Patterns.RPAREN)
    })
  }

  /**
   * `(<expr>)`
   * @returns {ParenthesizedExpressionSyntaxNode}
   */
  #tryReadNextAsParenthesizedExpression() {
    const token = this.tryReadNextToken(Patterns.LPAREN)
    return token ? this.#readAsParenthesizedExpression(token) : null
  }

  /**
   * Reads a simple value expression.
   * @param {TokenLike} token
   * @returns {ExpressionSyntaxNode}
   */
  #readAsSingleValueExpression(token) {
    switch (token.type) {
      case 'string':
      case 'number':
        return new ExpressionSyntaxNode(token)
      case 'reserved':
      case 'keyword':
        switch (token.value) {
          // well-known, standalone keywords
          case 'NULL':
          case 'TRUE':
          case 'FALSE':
            return new ExpressionSyntaxNode(token)

          // keywords that MAY have parens (parent will consume this)
          case 'SYSDATE':
          case 'SYSTIMESTAMP':
          case 'CURRENT_DATE':
          case 'CURRENT_TIMESTAMP':
            return new ExpressionSyntaxNode({
              name: new IdentifierSyntaxNode(token),
              parameters: this.#tryReadNextAsParameterListDeclaration()
            })
          default:
            break
        }
        break

      case 'operator':
        switch (token.value) {
          case '(': {
            return this.#readAsParenthesizedExpression(token)
          }

          case '+':
          case '-':
            // Unary operator
            return new UnaryExpressionSyntaxNode({
              operator: SyntaxNode.asSyntaxNode(token),
              expression: this.#readNextAsValueExpression()
            })

          default:
            break
        }
      default:
        break
    }

    return new ExpressionSyntaxNode(token)
  }

  /**
   * Reads a compound value expression.
   * @returns {ExpressionSyntaxNode}
   */
  #tryReadNextAsValueExpression() {
    const expression = this.#tryReadNextAsSingleValueExpression()
    if (!expression) {
      return null
    }

    console.assert(expression instanceof ExpressionSyntaxNode)

    // See if there is an operator
    const operator = SyntaxNode.asSyntaxNode(this.tryReadNextToken(Patterns.BINARY_OPERATOR))
    if (operator) {
      // Binary/ternary operator
      return new BinaryExpressionSyntaxNode({
        left: expression,
        operator,
        right: this.#readNextAsValueExpression()
      })
    }

    return expression
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
    const keyword = SyntaxNode.asSyntaxNode(this.tryReadNextToken(Patterns.RETURN))
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

  /**
   * @returns {SyntaxNode?} A node of `:=`, `DEFAULT`, or null.
   */
  #tryReadNextAsAnyDefault() {
    return SyntaxNode.asSyntaxNode(this.tryReadNextToken(Patterns.ANY_DEFAULT))
  }

  #tryReadNextAsParameterDeclaration() {
    const name = this.#tryReadNextAsIdentifier()
    if (!name) {
      return null
    }

    const inMode = this.#tryReadNextAsInMode(),
      outMode = this.#tryReadNextAsOutMode(),
      mode = inMode || outMode ? new ExpressionSyntaxNode(inMode, outMode) : null

    const type = this.#readNextAsTypeExpression()

    const defaultExpression = this.#tryReadNextAsAnyDefault()
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

  /**
   * @param {TokenLike} token
   * @returns {FunctionDeclarationStatementSyntaxNode}
   */
  #readAsFunctionDeclaration(token) {
    this.verify(Patterns.FUNCTION, token)

    return new FunctionDeclarationStatementSyntaxNode({
      keyword: SyntaxNode.asSyntaxNode(token),
      name: this.readNextAsIdentifier(),
      parameters: this.#tryReadNextAsParameterListDeclaration(),
      returnClause: this.#tryReadNextAsReturnDeclaration(),
      terminator: this.#readNextAsTerminator()
    })
  }

  #tryReadNextAsParameter() {
    // LATER: worry about parameter names.
    const value = this.#tryReadNextAsValueExpression()
    return value ? new ParameterExpressionSyntaxNode({ value }) : null
  }

  #readNextAsParameter() {
    // LATER: worry about parameter names.
    return new ParameterExpressionSyntaxNode({ value: this.#readNextAsValueExpression() })
  }

  *#tryReadNextAsParametersWithCommas() {
    let param = this.#tryReadNextAsParameter()
    if (!param) {
      return
    }

    yield param

    let comma
    while (param && (comma = this.tryReadNextToken(Patterns.COMMA))) {
      yield comma
      yield param = this.#readNextAsParameter()
    }
  }

  /**
   * @param {TokenLike} keyword
   * @returns {PragmaDeclarationStatementSyntaxNode}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/plsql-language-fundamentals.html#GUID-D6EFD7E8-39DF-4430-B625-B6D37E49F6F4
   */
  #readAsPragma(keyword) {
    this.verify(Patterns.PRAGMA, keyword)

    const name = this.#tryReadNextAsIdentifier() // probably a keyword to be safe

    const lparen = this.#tryReadNextAsLeftParen()
    const parameters = lparen ? new ParameterListExpressionSyntaxNode(lparen, [...this.#tryReadNextAsParametersWithCommas()], this.#readNextAsRightParen()) : null

    return PragmaDeclarationStatementSyntaxNode.create({ keyword, name, parameters, terminator: this.#readNextAsTerminator() })
  }

  /**
   * @param {TokenLike} token
   * @returns {ProcedureDeclarationStatementSyntaxNode}
   */
  #readAsProcedureDeclaration(token) {
    this.verify(Patterns.PROCEDURE, token)

    return new ProcedureDeclarationStatementSyntaxNode({
      keyword: SyntaxNode.asSyntaxNode(token),
      name: this.readNextAsIdentifier(),
      parameters: this.#tryReadNextAsParameterListDeclaration(),
      terminator: this.#readNextAsTerminator()
    })
  }

  #readAsSubtypeDeclaration(keyword) {
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
   * Tries reading a terminator (semicolon, handling unknown tokens).
   * If the next character isn't a semicolon, it will warn, then read up to the next semicolon.
   * @returns {SyntaxNode?} The terminating semicolon
   * -OR- additional unhandled data plus a semicolon
   * -OR- null (if at EOF)
   */
  #tryReadNextAsTerminator() {
    const semicolon = SyntaxNode.asSyntaxNode(this.tryReadNextToken(Patterns.SEMICOLON))
    if (semicolon) {
      return semicolon
    }

    const terminatorPlusOther = SyntaxNode.asSyntaxNode([...this.readNextTokensUntil(Patterns.SEMICOLON)])
    if (terminatorPlusOther) {
      console.assert(false, `${terminatorPlusOther.start} Expected SEMICOLON but found '${terminatorPlusOther}'`)
      return terminatorPlusOther
    }

    // EOF; this is fine.
    return null
  }


  /**
   * Reads a terminator (semicolon, handling unknown tokens).
   * If the next character isn't a semicolon, it will warn, then read up to the next semicolon.
   * @returns {SyntaxNode} The terminating semicolon
   * -OR- additional unhandled data plus a semicolon
   * @throws {TokenSyntaxError} if at EOF
   */
  #readNextAsTerminator() {
    const result = this.#tryReadNextAsTerminator()
    if (result) {
      return result
    }

    throw this.endOfStreamError()
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

    const defaultExpression = this.#tryReadNextAsAnyDefault()
    const defaultValue = defaultExpression ? this.#readNextAsValueExpression() : null

    return new VariableDeclarationStatementSyntaxNode({
      name,
      constant,
      type,
      defaultExpression,
      defaultValue,
      terminator: this.#readNextAsTerminator()
    })
  }

  /**
   * @param {TokenLike} token
   * @returns {SyntaxNode} A syntax node containing an opaque statement.
   */
  #readAsContainedStatement(token) {
    return new SyntaxNode(token, ...this.readNextTokensUntil(Patterns.SEMICOLON))
  }

  /**
   * Read up until a SQL statement terminator (`;`, `/`).
   * @param {TokenLike} token
   * @returns {SyntaxNode} A syntax node containing an opaque SQL statement.
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
    return new SqlStatementSyntaxNode(token, ...params, this.#readNextAsEndOfSqlStatement())
  }

  /**
   * Read next as an opaque SQL statement, up to the terminator.  NOTE: will not work for multi-semicolon units like PL/SQL units.
   * @param {[key: string]: SyntaxNode} params Named nodes, if any
   * @returns {StatementSyntaxNode}
   */
  #readNextAsSqlStatement(...params) {
    return new SqlStatementSyntaxNode(...params, this.#readNextAsEndOfSqlStatement())
  }

  /**
   * Read next as an opaque SQL*Plus command, up to the end of line.
   * @param {[key: string]: SyntaxNode} params Named nodes, if any
   * @returns {SqlPlusStatementSyntaxNode}
   */
  #readAsSqlPlusCommandStatement(token) {
    return new SqlPlusStatementSyntaxNode(token, ...this.#readToEndOfLine())
  }

  /**
   * Eat SQL*Plus command
   * @param {TokenLike} token
   * @returns {SqlPlusStatementSyntaxNode}
   */
  #readAsSqlPlusScriptStatement(token) {
    return new SqlPlusStatementSyntaxNode(token, ...this.readNextTokensUntil({ type: 'sqlplus.script.end' }))
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
              // SQL*Plus command SHOW (e.g., ERRORS)
              return this.#readAsSqlPlusCommandStatement(token)
            default:
              console.assert(false, `${token.textSpan} unexpected keyword`, token.value)
              return this.#readAsSqlStatement(token)
          }
          break

        case 'operator':
          switch (token.value) {
            case '/':
              // terminating slash
              return new TerminatorSyntaxNode(token)
            case '@':
            case '@@':
              // SQL*Plus file invocation operator
              return this.#readAsSqlPlusScriptStatement(token)
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

////////////////////////////////////////////////////////////////////////////////
// Nodes
////////////////////////////////////////////////////////////////////////////////

/**
 * Represents a statement terminator (e.g. `;`, `/`).
 */
class TerminatorSyntaxNode extends SyntaxNode { }
exports.TerminatorSyntaxNode = TerminatorSyntaxNode

/**
 * @abstract
 * Represents a member declaration.
 */
class DeclarationStatementSyntaxNode extends StatementSyntaxNode {
  /** @type {IdentifierSyntaxNode} The name of the declaration. */ name
  /** @type {string} The friendly name of the kind of member (e.g., `Procedure`). */ memberKind
  /** @type {Annotation[]} Annotations for this statement. */ annotations = []

  /**
   * @param {...SyntaxNodeOrToken} params
   */
  constructor(...params) {
    super(...params)
    this.name = this.children.find(c => c instanceof IdentifierSyntaxNode)
    this.memberKind = this.kind.replace(/DeclarationStatement$/, '')
  }
}
exports.DeclarationStatementSyntaxNode = DeclarationStatementSyntaxNode

/**
 * @abstract
 * Represents a member declaration.
 *
 * Temporary placeholder because I have this confusing distinction.
 */
class DeclarationExpressionSyntaxNode extends ExpressionSyntaxNode { }
exports.DeclarationExpressionSyntaxNode = DeclarationExpressionSyntaxNode

/**
 * @typedef {DeclarationStatementSyntaxNode | DeclarationExpressionSyntaxNode} DeclarationSyntaxNode
 * @exports DeclarationSyntaxNode
 */


/**
 * Top-level SQL statement.
 */
class SqlStatementSyntaxNode extends DeclarationStatementSyntaxNode { }
exports.SqlStatementSyntaxNode = SqlStatementSyntaxNode

/**
 * `CREATE` PL/SQL unit statement.
 */
class CreatePlsqlUnitStatementSyntaxNode extends SqlStatementSyntaxNode {
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

  /**
   * Processes all child statements to apply child pragmas where applicable.
   * @protected
   * @param {DeclarationSyntaxNode[]} declarations
   * @returns {void}
   */
  processPragmas(declarations) {
    // We only process declarations (which includes pragmas).
    console.assert(declarations.every(t => t instanceof DeclarationStatementSyntaxNode || t instanceof DeclarationExpressionSyntaxNode))

    /** @type {PragmaDeclarationStatementSyntaxNode[]} 'siblings' pragmas encountered, to apply to all with name */
    const siblingPragmas = declarations.filter(d => d instanceof PragmaDeclarationStatementSyntaxNode && d.searchHint === 'siblings')

    /** @type {PragmaDeclarationStatementSyntaxNode[]} 'next' pragmas encountered, to be consumed as we encounter them */
    let nextPragmas = []

    let /** @type {DeclarationStatementSyntaxNode?} Immediately previous declaration (non-pragma). */ previousDeclaration
    for (const declaration of declarations) {
      // We need to know if this is a pragma or not.
      const pragma = declaration instanceof PragmaDeclarationStatementSyntaxNode ? declaration : null
      if (pragma) {
        switch (pragma.searchHint) {
          case 'parent':
            // Applies to this object.
            if (!pragma.tryAnnotate(this)) {
              console.warn(`pragma ${pragma} does not match parent ${this}`)
            }
            continue

          case 'previous':
            if (!previousDeclaration || !pragma.tryAnnotate(previousDeclaration)) {
              console.warn('"previous" pragma failed to annotate item', pragma, previousDeclaration)
            }
            break

          case 'next':
            // Applies to upcoming member.
            nextPragmas.push(pragma)
            break

          case 'siblings':
            // We already grabbed these.
            break

          default:
            console.warn('unsupported pragma search hint', pragma, this)
            break
        }
      } else {
        // Not a pragma.
        // if there are applicable sibling/next pragmas, apply those first.  (Currently [23c] pragmas do NOT apply to other pragmas.)
        // Siblings: should match by name, ignore falsiness
        for (const sibling of siblingPragmas) {
          sibling.tryAnnotate(declaration)
        }

        // Previous: consume any we match, and keep what we don't.
        nextPragmas = nextPragmas.filter(pragma => !pragma.tryAnnotate(declaration))
      }

      previousDeclaration = declaration
    }

    // At this point we should have no "next" pragmas remaining. (Siblings are OK because they're explicitly named.)
    if (nextPragmas.length) {
      console.warn(`${this}: Unmatched pragmas`, ...nextPragmas)
    }
  }
}
exports.CreatePlsqlUnitStatementSyntaxNode = CreatePlsqlUnitStatementSyntaxNode

/**
 * `CREATE [OR REPLACE] PACKAGE` spec.
 */
class CreatePackageStatementSyntaxNode extends CreatePlsqlUnitStatementSyntaxNode {
  /** @property {SyntaxNode} */ is
  /** @property {DeclarationSyntaxNode[]} */ members

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
    this.members = content.filter(x => x instanceof DeclarationStatementSyntaxNode || x instanceof DeclarationExpressionSyntaxNode)
    this.processPragmas(this.members)
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

    this.processPragmas(this.members)

    // SPECIAL: set the return type for constructors to our type.
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
exports.VariableDeclarationStatementSyntaxNode = VariableDeclarationStatementSyntaxNode

class TypeDeclarationStatementSyntaxNode extends DeclarationStatementSyntaxNode {
  /** @property {ExpressionSyntaxNode} */ specification
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

/**
 * Base class of any method declaration.
 * @see ConstructorDeclarationStatementSyntaxNode
 * @see FunctionDeclarationStatementSyntaxNode
 * @see ObjectMethodDeclarationStatementSyntaxNodeBase
 * @see ObjectMethodDeclarationStatementSyntaxNode
 * @see ProcedureDeclarationStatementSyntaxNode
 */
class MethodDeclarationStatementSyntaxNodeBase extends DeclarationStatementSyntaxNode {
  /** @type {SyntaxNode} [procedure|function] */ keyword
  /** @type {string} A unique ID for this procedure within context. */ id
  /** @type {ParameterListDeclarationExpressionSyntaxNode?} The parameters. */ parameters
}
exports.MethodDeclarationStatementSyntaxNodeBase = MethodDeclarationStatementSyntaxNodeBase

class ProcedureDeclarationStatementSyntaxNode extends MethodDeclarationStatementSyntaxNodeBase {

  /**
   * @param {object} params
   * @param {SyntaxNode} params.keyword  The initial token (`PROCEDURE`)
   * @param {IdentifierSyntaxNode} params.name
   * @param {ParameterListDeclarationExpressionSyntaxNode?} params.parameters
   * @param {SyntaxNode?} params.terminator
   */
  constructor({ keyword, name, parameters, terminator }) {
    super(keyword, name, parameters, terminator)
    this.keyword = keyword
    this.name = name
    this.parameters = parameters
    this.terminator = terminator
  }
}

class FunctionDeclarationStatementSyntaxNode extends MethodDeclarationStatementSyntaxNodeBase {
  /**
   * @param {object} params
   * @param {SyntaxNode} params.keyword  The initial token (`FUNCTION`)
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

/**
 * Base class of any object method declaration.
 * @see ObjectMethodDeclarationStatementSyntaxNode
 * @see ConstructorDeclarationStatementSyntaxNode
 */
class ObjectMethodDeclarationStatementSyntaxNodeBase extends MethodDeclarationStatementSyntaxNodeBase {
  /** @type {boolean} */ isStatic
}

class ObjectMethodDeclarationStatementSyntaxNode extends ObjectMethodDeclarationStatementSyntaxNodeBase {

  /** @type {InheritanceFlagSyntaxNode[]} */ inheritance
  /** @type {SyntaxNode} */ memberOrStatic
  /** @param {SyntaxNode?} */ mapOrOrder

  /**
   * @overload
   * @param {object} params
   * @param {InheritanceFlagSyntaxNode[]} params.inheritance
   * @param {SyntaxNode?} params.mapOrOrder
   * @param {SyntaxNode?} params.memberOrStatic
   * @param {SyntaxNode?} params.keyword
   * @param {IdentifierSyntaxNode} params.name
   * @param {ParameterListDeclarationExpressionSyntaxNode?} params.parameters
   * @param {ReturnDeclarationExpressionSyntaxNode?} params.returnClause
   * @overload
   * @param {...SyntaxNodeOrToken} params
   */
  constructor({ inheritance, mapOrOrder, memberOrStatic, keyword, name, parameters, returnClause }) {
    super(inheritance, mapOrOrder, memberOrStatic, keyword, name, parameters, returnClause)
    this.mapOrOrder = mapOrOrder
    this.memberOrStatic = memberOrStatic
    this.keyword = keyword
    this.name = name
    this.inheritance = inheritance
    this.parameters = parameters
    this.returnClause = returnClause

    this.memberKind = 'Method'
    this.isStatic = memberOrStatic.value === 'STATIC'
  }
}

/**
 * Marker subclass dealing with constructor functions
 */
class ConstructorDeclarationStatementSyntaxNode extends ObjectMethodDeclarationStatementSyntaxNodeBase {
  constructor({ inheritance, constructor, functionKeyword, name, parameters, returnClause }) {
    super(inheritance, constructor, functionKeyword, name, parameters, returnClause)
    this.keyword = functionKeyword
    this.name = name
    this.inheritance = inheritance
    this.parameters = parameters
    this.returnClause = returnClause

    this.isStatic = false
  }
}
exports.ConstructorDeclarationStatementSyntaxNode = ConstructorDeclarationStatementSyntaxNode

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
  /** @type {ExpressionSyntaxNode?} */ mode
  /** @type {ExpressionSyntaxNode} */ type
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

class ParameterListDeclarationExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {ParameterDeclarationExpressionSyntaxNode[]} */ parameters

  constructor(lparen, parametersWithCommas, rparen) {
    super(lparen, ...parametersWithCommas, rparen)
    this.parameters = parametersWithCommas.filter(x => x instanceof ParameterDeclarationExpressionSyntaxNode)
  }
}
exports.ParameterListDeclarationExpressionSyntaxNode = ParameterListDeclarationExpressionSyntaxNode

class ReturnDeclarationExpressionSyntaxNodeBase extends ExpressionSyntaxNode {

  /** @type {SyntaxNode} `RETURN` */ keyword
  /** @type {ExpressionSyntaxNode?} */ type
  /** @type {SyntaxNode[]} */ modifiers = []

  /**
   * @param {object} params
   * @param {TokenLike} params.keyword `RETURN`
   * @param {ExpressionSyntaxNode?} params.type
   * @param {SyntaxNode[]} params.modifiers
   */
  constructor(...params) {
    super(...params)
  }
}
exports.ReturnDeclarationExpressionSyntaxNodeBase = ReturnDeclarationExpressionSyntaxNodeBase

class ReturnDeclarationExpressionSyntaxNode extends ReturnDeclarationExpressionSyntaxNodeBase {

  /**
   * @param {object} params
   * @param {TokenLike} params.keyword `RETURN`
   * @param {ExpressionSyntaxNode?} params.type
   * @param {SyntaxNode[]} params.modifiers
   */
  constructor({ keyword, type, modifiers }) {
    super(keyword, type, modifiers)
    this.keyword = keyword
    this.type = type
    this.modifiers = modifiers
  }
}
exports.ReturnDeclarationExpressionSyntaxNode = ReturnDeclarationExpressionSyntaxNode

class ConstructorReturnDeclarationExpressionSyntaxNode extends ReturnDeclarationExpressionSyntaxNodeBase {

  /**
   * @param {object} params
   * @param {SyntaxNode} params.keyword `RETURN SELF AS RESULT`
   * @param {SyntaxNode[]} params.modifiers
   */
  constructor({ keyword, modifiers }) {
    super(keyword, modifiers)
    this.keyword = keyword
    this.modifiers = modifiers
  }
}
exports.ConstructorReturnDeclarationExpressionSyntaxNode = ConstructorReturnDeclarationExpressionSyntaxNode

class AccessorListExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {ExpressionSyntaxNode[]} */ accessors

  constructor(lparen, accessorsWithCommas, rparen) {
    super(lparen, ...accessorsWithCommas, rparen)
    this.accessors = accessorsWithCommas.filter(x => x instanceof ExpressionSyntaxNode)
  }
}
exports.AccessorListDeclarationExpressionSyntaxNode = AccessorListExpressionSyntaxNode

// ---------


class ObjectMemberDeclarationExpressionSyntaxNode extends DeclarationExpressionSyntaxNode {

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
  constructor({ name, type, inheritance }) {
    console.assert(arguments.length === 1)
    super(name, type, inheritance) // eat what we take, even if it doesn't apply
    console.assert(name)
    console.assert(type)
    console.assert(inheritance)
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
  /** @type {ObjectMethodDeclarationStatementSyntaxNodeBase[]} */ methods

  constructor({ lparen, docComment, membersWithCommas, rparen }) {
    super(lparen, docComment, ...membersWithCommas, rparen)
    this.docComment = docComment
    this.attributes = membersWithCommas.filter(x => x instanceof ObjectAttributeDeclarationExpressionSyntaxNode)
    this.methods = membersWithCommas.filter(x => x instanceof ObjectMethodDeclarationStatementSyntaxNodeBase)
    console.assert(membersWithCommas.length === this.members.length + membersWithCommas.filter(x => x.value === ',').length, 'oops')
  }

  /** @type {DeclarationSyntaxNode[]} */
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

/**
 * Represents a `PRAGMA` compiler instruction.
 * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/plsql-language-fundamentals.html#GUID-D6EFD7E8-39DF-4430-B625-B6D37E49F6F4
 */
class PragmaDeclarationStatementSyntaxNode extends DeclarationStatementSyntaxNode {
  /** @override */
  memberKind = 'Pragma'

  /**
   * @typedef {'parent' | 'previous' |'next' | 'siblings'} SearchHint
   * @type {SearchHint}
   * How this pragma should look for its associated statement.
   *
   * Some pragmas do not have names.
   * Some pragmas do have names, but apply to items that may not have unique names, such as package procedures/functions.
   * In all cases they apply to a previous item, the next item, or the parent node.
   *
   * - parent: applies to parent, optionally by name
   * - previous: applies to single previous item, either by name or immediate predecessor
   * - next: applies to single next item, either by name or immediate successor
   * - siblings: applies to all siblings by name only
   */
  searchHint

  /**
   * @param {object} params
   * @param {SyntaxNode} params.keyword
   * @param {IdentifierSyntaxNode} params.name
   * @param {ParameterListExpressionSyntaxNode} params.parameters
   * @param {TerminatorSyntaxNode?} terminator
   * @returns {PragmaDeclarationStatementSyntaxNode} the created node
   */
  static create({ keyword, name, parameters, terminator }) {
    console.assert(keyword && name && parameters)
    switch (name.value) {
      /** @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/AUTONOMOUS_TRANSACTION-pragma.html */
      case 'AUTONOMOUS_TRANSACTION':
      /** @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/COVERAGE-pragma.html */
      case 'COVERAGE':
      /**
       * Named, but applies to nearest previous declaration.
       * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/DEPRECATE-pragma.html
       */
      case 'DEPRECATE':
        return new PragmaDeclarationStatementSyntaxNode({ keyword, name, parameters, terminator, searchHint: PragmaDeclarationStatementSyntaxNode.#searchHintByName[name.value] })
      case 'EXCEPTION_INIT':
        return new ExceptionInitPragmaDeclarationStatementSyntaxNode({ keyword, name, parameters, terminator })
      /**
       * Applies to all overloads with the given name.
       * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/INLINE-pragma.html
       */
      case 'INLINE':
      /**
       * Nearest previous declaration.
       * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/RESTRICT_REFERENCES-pragma.html
       */
      case 'RESTRICT_REFERENCES':
      /** @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/SERIALLY_REUSABLE-pragma.html */
      case 'SERIALLY_REUSABLE':
      /**
       * Annotation to mark a procedure as terminating.  Goes inside the procedure/function, but names it.
       * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/Supresses-warning-pragma-6009.html
       */
      case 'SUPPRESSES_WARNING_6009':
      /** @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/UDF-pragma.html */
      case 'UDF':
        return new PragmaDeclarationStatementSyntaxNode({ keyword, name, parameters, terminator, searchHint: PragmaDeclarationStatementSyntaxNode.#searchHintByName[name.value] })
      default:
        console.warn(`${keyword.textSpan.toString('NAME')} Unknown pragma '${name}'`, ...arguments)
        return new PragmaDeclarationStatementSyntaxNode({ keyword, name, parameters, terminator, searchHint: PragmaDeclarationStatementSyntaxNode.#searchHintByName[name.value] })
    }
  }

  /** @type {[key: string]: SearchHint} */
  static #searchHintByName = {
    /** @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/AUTONOMOUS_TRANSACTION-pragma.html */
    'AUTONOMOUS_TRANSACTION': 'parent',
    /** @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/COVERAGE-pragma.html */
    'COVERAGE': 'next',
    /**
     * Named, but applies to nearest previous declaration.
     * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/DEPRECATE-pragma.html
     */
    'DEPRECATE': 'previous',
    /**
     * Named, but applies to a previous exception declaration.
     * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/EXCEPTION_INIT-pragma.html
     */
    'EXCEPTION_INIT': 'previous',
    /**
     * Applies to all overloads with the given name.
     * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/EXCEPTION_INIT-pragma.html
     */
    'INLINE': 'siblings',
    /**
     * Nearest previous declaration.
     * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/RESTRICT_REFERENCES-pragma.html
     */
    'RESTRICT_REFERENCES': 'previous',
    /** @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/SERIALLY_REUSABLE-pragma.html */
    'SERIALLY_REUSABLE': 'parent',
    /**
     * Annotation to mark a procedure as terminating.  Goes inside the procedure/function, but names it.
     * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/Supresses-warning-pragma-6009.html
     */
    'SUPPRESSES_WARNING_6009': 'parent',
    /** @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/UDF-pragma.html */
    'UDF': 'parent'
  }

  /**
   * @param {object} params
   * @param {SyntaxNode} params.keyword
   * @param {IdentifierSyntaxNode} params.name
   * @param {ParameterListExpressionSyntaxNode} params.parameters
   * @param {TerminatorSyntaxNode} terminator
   * @param {SearchHint} searchHint
   */
  constructor({ keyword, name, parameters, terminator, searchHint }) {
    super(keyword, name, parameters, terminator)
    this.name = name
    this.parameters = parameters.parameters
    this.searchHint = searchHint
  }

  /**
   * @param {DeclarationStatementSyntaxNode} target The target node.
   * @returns {Annotation}
   */
  createAnnotation(target) {
    const { name, parameters } = this
    return new Annotation({ name, parameters, target })
  }

  /**
   * @param {DeclarationStatementSyntaxNode} node
   * @returns {boolean}
   */
  isMatch(node) {
    return !this.name || this.name.value === node.name.value
  }

  /**
   * Adds an annotation to `node` if it matches this pragma.
   * @param {DeclarationStatementSyntaxNode} node
   * @returns {Annotation?} The annotation if matched, otherwise `null`
   */
  tryAnnotate(node) {
    if (!this.isMatch(node)) {
      return null
    }

    const annotation = this.createAnnotation(node)
    return node.annotations.push(annotation)
  }
}
exports.PragmaDeclarationStatementSyntaxNode = PragmaDeclarationStatementSyntaxNode

/**
 * `PRAGMA EXCEPTION_INIT`
 * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/EXCEPTION_INIT-pragma.html
 */
class ExceptionInitPragmaDeclarationStatementSyntaxNode extends PragmaDeclarationStatementSyntaxNode {
  /** @override */
  searchHint = 'previous'

  /**
   * @type {IdentifierSyntaxNode}
   * Name of a previously declared user-defined exception.
   */
  exception

  /**
   * @type {ExpressionSyntaxNode}
   * Error code to be associated with exception.
   * `errorCode` can be either 100 (the numeric code for "no data found" that "SQLCODE Function" returns)
   * or any negative integer greater than -1000000 except -1403 (another numeric code for "no data found").
   */
  errorCode

  /** @type {string} The error ID based on {@link errorCode} */
  errorId

  /**
   * @param {object} params
   * @param {SyntaxNode} params.keyword
   * @param {IdentifierSyntaxNode} params.name
   * @param {ParameterListExpressionSyntaxNode} params.parameters
   * @param {TerminatorSyntaxNode} terminator
   * @param {SearchHint} searchHint
   */
  constructor({ keyword, name, parameters, terminator }) {
    super({ keyword, name, parameters, terminator })

    console.assert(this.searchHint)

    // JSCRAP: I can decompose to variables but not members. Is that a real limitation or...?
    const [exception, errorCode] = parameters.parameters.map(p => p.value)
    this.exception = exception
    this.errorCode = errorCode
    this.errorId = ExceptionInitPragmaDeclarationStatementSyntaxNode.#toErrorId(errorCode)
  }

  /** @type {string} Gets an appropriate error code ID. */
  static #toErrorId(value) {
    switch (value) {
      case 100:
        return '(no data found)'
    }

    if (value >= 0) {
      return null
    }

    return `ORA-${(-1 * value).toString().padStart(5, '0')}`
  }

  /**
   * @override
   * @param {DeclarationStatementSyntaxNode} node
   * @returns {boolean}
   */
  isMatch(node) {
    return this.exception.value === node.name.value
  }

  /**
   * @override
   * @param {DeclarationStatementSyntaxNode} target
   * @returns {Annotation}
   */
  createAnnotation(target) {
    const { name, exception, errorCode, errorId } = this
    return new Annotation({ name, exception, errorCode, errorId, target })
  }
}
exports.ExceptionInitPragmaDeclarationStatementSyntaxNode = ExceptionInitPragmaDeclarationStatementSyntaxNode


////////////////////

class ParameterExpressionSyntaxNode extends ExpressionSyntaxNode {

  /** @type {IdentifierSyntaxNode?} */ name
  /** @type {ExpressionSyntaxNode} */ value

  /**
   * @param {object} params
   * @param {SyntaxNode?} params.defaultExpression The `default` keyword or symbol (`:=`)
   */
  constructor({ name, value }) {
    super(name, value)
    this.name = name
    this.value = value
    console.assert(value instanceof ExpressionSyntaxNode)
  }
}
exports.ParameterExpressionSyntaxNode = ParameterExpressionSyntaxNode

class ParameterListExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {ParameterExpressionSyntaxNode[]} */ parameters

  constructor(lparen, parametersWithCommas, rparen) {
    super(lparen, ...parametersWithCommas, rparen)
    this.parameters = parametersWithCommas.filter(x => x instanceof ParameterExpressionSyntaxNode)
  }
}
exports.ParameterListExpressionSyntaxNode = ParameterListExpressionSyntaxNode

/**
 * Top-level SQL*Plus statement.
 */
class SqlPlusStatementSyntaxNode extends StatementSyntaxNode {
}
exports.SqlPlusStatementSyntaxNode = SqlStatementSyntaxNode

class UnaryExpressionSyntaxNode extends ExpressionSyntaxNode {
  constructor(operator, expression) {
    super(operator, expression)
    this.operator = operator
    this.expression = expression
  }
}
exports.UnaryExpressionSyntaxNode = UnaryExpressionSyntaxNode

class BinaryExpressionSyntaxNode extends ExpressionSyntaxNode {
  /**
   *
   * @param {ExpressionSyntaxNode} left
   * @param {SyntaxNode} operator
   * @param {ExpressionSyntaxNode} right
   */
  constructor(left, operator, right) {
    super(left, operator, right)
    this.left = left
    this.operator = operator
    this.right = right
  }
}
exports.BinaryExpressionSyntaxNode = BinaryExpressionSyntaxNode

class ParenthesizedExpressionSyntaxNode extends ExpressionSyntaxNode {
  /**
   *
   * @param {SyntaxNode} left
   * @param {ExpressionSyntaxNode} expression
   * @param {SyntaxNode} right
   */
  constructor(left, expression, right) {
    super(left, operator, right)
    this.left = left
    this.expression = expression
    this.right = right
  }
}
exports.ParenthesizedExpressionSyntaxNode = ParenthesizedExpressionSyntaxNode
