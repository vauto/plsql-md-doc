const console = require('../debug').child(__filename)
const { mustBeNonEmptyArray, mustBeInstanceOf, InvalidNumberOfArgumentsError, mustBeArray, mustBeObject } = require('../guards')
const {
  Annotation,
  AnyExpressionSyntaxNode,
  ExpressionSyntaxNode,
  IdentifierSyntaxNode,
  LiteralSyntaxNode,
  StatementSyntaxNode,
  SyntaxNode,
  SyntaxNodeOrToken,
  SyntaxNodeOrTokenLike,
  SyntaxNodeReader,
  StructuredTriviaSyntaxNode
} = require('../syntax')
const {
  Token,
  TokenLike,
  TokenPattern,
  TokenSyntaxError,
  mustBeTokenLike
} = require('../token')

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
  static OPEN_PAREN = Patterns.operator('(')
  static CLOSE_PAREN = Patterns.operator(')')
  static ASTERISK = Patterns.operator('*')
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

  static ARROW = Patterns.operator('=>')
  static PLUS = Patterns.operator('+')
  static MINUS = Patterns.operator('-')
  static SEMICOLON = Patterns.operator(';')
  static SLASH = Patterns.operator('/')

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
    Patterns.PLUS, Patterns.MINUS, '*', '/',
    '<', '=', '>', '<=', '>=', '<>', '!=',
    Patterns.ARROW,
    '||'
  ]
  static NUMERIC_UNARY_OPERATOR = [Patterns.PLUS, Patterns.MINUS]
  static UNARY_OPERATOR = [...Patterns.NUMERIC_UNARY_OPERATOR]


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
 * @typedef {SyntaxNodeOrToken | SyntaxNodeOrToken[]} NodeParamValue
 * @typedef {[key: string]: NodeParamValue} NamedNodeParams
 *
 */

class PlsqlNodeReader extends SyntaxNodeReader {

  // ---------------

  /**
   * Reads a sequence of tokens through the end of the current line.
   * @returns {Generator<TokenLike>}
   * @yields {TokenLike}
   */
  *#readThroughEndOfLine() {
    for (const token of this.iterator) {
      yield token
      if (token.type === 'whitespace' && token.value.indexOf('\n') >= 0) {
        break
      }
    }
  }

  // ---------------

  /**
   * Tries reading the next item as a doc comment.
   * @returns {DocumentCommentSyntaxNode?}
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
        return new DocumentCommentSyntaxNode(...tokens)
      }
    }

    return null
  }

  // ---------------

  /**
   * Reads starting with the given token as a simple or compound identifier.
   * @param {TokenLike} token
   * @param {...TokenPattern} secondary Secondary delimiters
   * @returns {IdentifierSyntaxNode}
   */
  #readAsIdentifier(token, ...secondary) {
    const tokens = [token]
    const delimiters = secondary.length ? [Patterns.PERIOD, ...secondary] : Patterns.PERIOD
    let /** @type {TokenLike[]?} */ nextTokens
    while (nextTokens = this.tryReadNextTokens(delimiters, Patterns.ANY_IDENTIFIER)) {
      tokens.push(...nextTokens)
    }

    return new IdentifierSyntaxNode(...tokens)
  }

  /**
   * Tries reading the next item as a simple or compound identifier.
   * @returns {IdentifierSyntaxNode?}
   */
  #tryReadNextAsIdentifier() {
    const token = this.tryReadNextToken(Patterns.ANY_IDENTIFIER)
    return token ? this.#readAsIdentifier(token) : null
  }

  /**
   * Reads the next item as an identifier.
   * @param {TokenLike} token
   * @returns {IdentifierSyntaxNode}
   */
  #readNextAsIdentifier() {
    const token = this.readNextToken(Patterns.ANY_IDENTIFIER)
    return this.#readAsIdentifier(token)
  }

  // ---------------

  /**
   * Tries reading the next item as a string literal.
   * @returns {LiteralSyntaxNode?}
   */
  #tryReadNextAsStringLiteral() {
    return SyntaxNode.asSyntaxNode(this.tryReadNextToken(Patterns.STRING_LITERAL))
  }

  /**
   * Reads the next item as a string literal.
   * @returns {LiteralSyntaxNode}
   */
  #readNextAsStringLiteral() {
    return SyntaxNode.asSyntaxNode(this.readNextToken(Patterns.STRING_LITERAL))
  }

  // ---------------

  /**
   * Tries reading the next token as an open parenthesis (`(`).
   * @returns {TokenLike?}
   */
  #tryReadNextAsOpenParenToken() {
    return this.tryReadNextToken(Patterns.OPEN_PAREN)
  }

  /**
   * Reads the next token as an open parenthesis (`(`).
   * @returns {TokenLike}
   */
  #readNextAsOpenParenToken() {
    return this.readNextToken(Patterns.OPEN_PAREN)
  }

  /**
   * Reads the next token as a close parenthesis (`)`).
   * @returns {TokenLike}
   */
  #readNextAsCloseParenToken() {
    return this.readNextToken(Patterns.CLOSE_PAREN)
  }

  /**
   * Reads the next item as an asterisk (`*`).
   * @returns {SyntaxNode?}
   */
  #readNextAsAsterisk() {
    return SyntaxNode.asSyntaxNode(this.readNextToken(Patterns.ASTERISK))
  }

  /**
   * Tries reading the next item as a comma (`,`).
   * @returns {SyntaxNode?}
   */
  #tryReadNextAsComma() {
    return SyntaxNode.asSyntaxNode(this.tryReadNextToken(Patterns.COMMA))
  }

  // -----------------------------------
  // SQL and PL/SQL unit common
  // -----------------------------------

  /**
   * Reads starting with the given token as a `CREATE` DDL statement.
   * ```text
   * CREATE [OR REPLACE]? <editionable_clause>? <unit-type> <if_not_exists_clause>? ...
   * ```
   * @param {TokenLike} createKeyword
   * @returns {SyntaxNode}
   */
  #readAsCreateStatement(createKeyword) {
    // CREATE
    this.verify({ type: 'reserved', value: 'CREATE' }, createKeyword)

    // OR REPLACE
    const createNode = new SyntaxNode(
      createKeyword,
      this.tryReadNextTokens('OR', 'REPLACE')
    )

    const editionable = this.#tryReadNextAsEditionableClause()
    const unitType = this.#readNextAsUnitType()
    const ifNotExists = this.#tryReadNextAsIfNotExists()

    switch (unitType.name) {
      case 'FUNCTION':
        return this.#readRestOfStandaloneFunction(createNode, editionable, unitType, ifNotExists)
      case 'PROCEDURE':
        return this.#readRestOfStandaloneProcedure(createNode, editionable, unitType, ifNotExists)
      case 'PACKAGE':
        return this.#readRestOfPackageSpec(createNode, editionable, unitType, ifNotExists)
      case 'TYPE':
        return this.#readRestOfTypeSpec(createNode, editionable, unitType, ifNotExists)
      default:
        console.warnOnce(unitType.name, false, `${createNode.textSpan} Unit type '${unitType.name}' is not implemented`)
        return this.#readNextAsOpaqueSqlStatement(createNode, editionable, unitType, ifNotExists)
    }
  }

  /**
   * Tries reading the next item as an `EDITIONABLE` clause.
   * @returns {SyntaxNode?}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/CREATE-TYPE-statement.html
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/CREATE-VIEW.html
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

  /**
   * Tries reading the next item as an `IF NOT EXISTS` clause.
   * @returns {SyntaxNode?}
   */
  #tryReadNextAsIfNotExists() {
    return SyntaxNode.asSyntaxNode(this.tryReadNextTokens('IF', 'NOT', 'EXISTS'))
  }

  // ---------------

  /**
   * Reads the next item as the SQL or PL/SQL unit type (e.g. `TABLE`, `PROCEDURE`).
   * @returns {UnitTypeSyntaxNode}
   */
  #readNextAsUnitType() {
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

  // -----------------------------------
  // SQL unit common
  // -----------------------------------

  /**
   * Reads starting with the given token as an opaque SQL statement.
   * NOTE: will not work for multi-semicolon units like PL/SQL units.
   * @param {...SyntaxNodeOrToken} params
   * @returns {StatementSyntaxNode}
   */
  #readAsOpaqueSqlStatement(token, ...params) {
    return new SqlStatementSyntaxNode(token, ...params, ...this.readNextTokensUntil(Patterns.END_OF_SQL_STATEMENT))
  }

  /**
   * Reads the next item as an opaque SQL statement, up to the terminator.  NOTE: will not work for multi-semicolon units like PL/SQL units.
   * @param {[key: string]: SyntaxNode} params Named nodes, if any
   * @returns {StatementSyntaxNode}
   */
  #readNextAsOpaqueSqlStatement(...params) {
    return new SqlStatementSyntaxNode(...params, ...this.readNextTokensUntil(Patterns.END_OF_SQL_STATEMENT))
  }

  /**
   * Tries reading the next token as the slash token (`/`).
   * @returns {TokenLike?} `/` or null
   */
  #tryReadNextAsSlashToken() {
    return this.tryReadNextToken(Patterns.SLASH)
  }

  // -----------------------------------
  // PL/SQL unit common
  // -----------------------------------

  /**
   * Reads starting with the given token as an opaque PL/SQL statement.
   * @param {TokenLike} token
   * @returns {SyntaxNode} A syntax node containing an opaque statement.
   */
  #readAsOpaquePlsqlStatement(token) {
    return SyntaxNode.asSyntaxNode([token, ...this.readNextTokensUntil(Patterns.SEMICOLON)])
  }

  /**
   * Reads the next item as an opaque SQL statement.
   * @returns {SyntaxNode?} A syntax node containing an opaque statement, or `null` if there are no more tokens.
   */
  #readNextAsOpaquePlsqlStatement() {
    return SyntaxNode.asSyntaxNode([...this.readNextTokensUntil(Patterns.SEMICOLON)])
  }

  /**
   * Tries reading the next item as a PL/SQL statement terminator (`;`).
   * @returns {TokenLike?} The terminating semicolon, if any.
   */
  #tryReadNextAsSemicolonToken() {
    return this.tryReadNextToken(Patterns.SEMICOLON)
  }

  // ---------------

  /**
   * Tries reading the next item as the unit kind from an `ACCESSIBLE BY` accessor declaration.
   * @returns {UnitTypeSyntaxNode?}
   * @see #tryReadNextAsAccessor
   */
  #tryReadNextAsAccessorUnitKind() {
    const token = this.tryReadNextToken(Patterns.PLSQL_UNIT_KIND)
    return token ? new UnitTypeSyntaxNode([token]) : null
  }

  /**
   * Tries reading the next item as single `ACCESSIBLE BY (...)` accessor declaration.
   * ```text
   * <unit-kind>? <identifier>
   * ```
   * @returns {AccessorExpressionSyntaxNode?}
   */
  #tryReadNextAsAccessor() {
    const unitType = this.#tryReadNextAsAccessorUnitKind()
    const name = this.#tryReadNextAsIdentifier()

    return name ? new AccessorExpressionSyntaxNode(unitType, name) : null
  }

  /**
   * Reads a sequence of zero or more accessors and separating commas within an `ACCESSIBLE BY` clause.
   * @returns {Generator<SyntaxNode>}
   * @yields {SyntaxNode}
   */
  *#readNextAsAccessorsWithCommas() {
    let accessor = this.#tryReadNextAsAccessor()
    if (!accessor) {
      return
    }

    yield accessor

    let comma
    while (accessor && (comma = this.#tryReadNextAsComma())) {
      yield comma
      yield accessor = this.#tryReadNextAsAccessor()
    }
  }

  /**
   * Tries reading the next item as the list portion of an `ACCESSIBLE BY (...)` clause.
   * ```text
   * ACCESSIBLE BY (<accessor>, ...)
   *               ^^^^^^^^^^^^^^^^^
   * ```
   * @returns {AccessorListExpressionSyntaxNode?}
   */
  #tryReadNextAsAccessorList() {
    const openParenToken = this.#tryReadNextAsOpenParenToken()
    if (!openParenToken) {
      return null
    }

    return new AccessorListExpressionSyntaxNode(
      openParenToken,
      [...this.#readNextAsAccessorsWithCommas()],
      this.#readNextAsCloseParenToken()
    )
  }

  /**
   * Tries reading the next item as an `ACCESSIBLE BY (...)` clause.
   * ```text
   * ACCESSIBLE BY (<accessor>, ...)
   * ```
   * @returns {AccessibleByExpressionSyntaxNode?}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/21/lnpls/ACCESSIBLE-BY-clause.html
   */
  #tryReadNextAsAccessibleByClause() {
    let accessibleBy = SyntaxNode.asSyntaxNode(this.tryReadNextTokens('ACCESSIBLE', 'BY'))
    return accessibleBy
      ? new AccessibleByExpressionSyntaxNode(accessibleBy, this.#tryReadNextAsAccessorList())
      : null
  }

  /**
   * Tries reading the next item as a `DEFAULT COLLATION` clause from a declaration modifier.
   * @returns {SyntaxNode?}
   * ```text
   * DEFAULT COLLATION [USING_NLS_COMP]
   * ```
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/DEFAULT-COLLATION-clause.html
   */
  #tryReadNextAsDefaultCollationClause() {
    return SyntaxNode.asSyntaxNode(this.tryReadNextTokens('DEFAULT', 'COLLATION', 'USING_NLS_COMP'))
  }

  /**
   * Tries reading the next item as a `DETERMINISTIC` clause from a declaration modifier.
   * ```text
   * DETERMINSTIC
   * ```
   * @returns {SyntaxNode?}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/DETERMINISTIC-clause.html
   */
  #tryReadNextAsDeterministicClause() {
    return SyntaxNode.asSyntaxNode(this.tryReadNextToken('DETERMINISTIC'))
  }

  /**
   * Tries reading the next item as an invoker right's and definer right's clause (aka an `AUTHID` clause).
   * ```text
   * AUTHID [DEFINER|CURRENT_USER]
   * ```
   * @returns {SyntaxNode?}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/invokers_rights_clause.html
   */
  #tryReadNextAsInvokerRightsClause() {
    let tokens = this.tryReadNextTokens('AUTHID', Patterns.KEYWORD)
    return tokens ? new SyntaxNode(tokens) : null
  }

  /**
   * Tries reading the next item as a `PARALLEL_ENABLE` clause from a declaration modifier.
   * ```text
   * PARALLEL_ENABLE [partition-by-clause]?
   * ```
   * @returns {ExpressionSyntaxNode?}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/PARALLEL_ENABLE-clause.html
   */
  #tryReadNextAsParallelEnableClause() {
    const parallelEnable = this.tryReadNextToken('PARALLEL_ENABLE')
    if (!parallelEnable) {
      return null
    }

    const openParenToken = this.#tryReadNextAsOpenParenToken()
    if (openParenToken) {
      // LATER
      throw this.notImplemented('PARTITION BY clause not implemented')
    }

    return new ExpressionSyntaxNode(parallelEnable)
  }

  /**
   * Tries reading the next item as a `PIPELINED` clause from a declaration modifier.
   * @returns {ExpressionSyntaxNode?}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/PIPELINED-clause.html
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
      return new ExpressionSyntaxNode(pipelined, polymorphic, using, this.#readNextAsIdentifier())
    } else {
      return new ExpressionSyntaxNode(pipelined, polymorphic)
    }
  }

  /**
   * Tries reading the next item as a `SHARING` clause from a declaration modifier.
   * @returns {SyntaxNode?}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/SHARING-clause.html
   */
  #tryReadNextAsSharingClause() {
    return SyntaxNode.asSyntaxNode(this.tryReadNextTokens('SHARING', '=', ['METADATA', 'NONE']))
  }

  /**
   * Tries reading the next item as a `RESULT_CACHE` clause from a return declaration modifier.
   * @returns {ExpressionSyntaxNode?}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/RESULT_CACHE-clause.html
   */
  #tryReadNextAsResultCacheClause() {
    const keyword = SyntaxNode.asSyntaxNode(this.tryReadNextToken('RESULT_CACHE'))
    if (!keyword) {
      return null
    }

    // RESULT_CACHE [RELIES_ON ([data_source, ...]?)]?
    const reliesOn = this.tryReadNextToken('RELIES_ON')
    if (reliesOn) {
      // RELIES_ON clause is found, but it is deprecated.
      // Eat and move on.
      return new ExpressionSyntaxNode(keyword, reliesOn, this.#readNextAsOpenParenToken(), this.readNextTokensUntil(Patterns.CLOSE_PAREN))
    }

    return new ExpressionSyntaxNode(keyword)
  }

  /**
   * Tries reading the next item as a declaration modifier for a top-level unit.
   * @returns {SyntaxNode?}
   * <p>
   * NOTE: not all clauses may apply to an object, we are just parsing them as if they are to make the code slightly less complicated.
   */
  #tryReadNextAsUnitDeclarationModifier() {
    return this.#tryReadNextAsSharingClause()
      ?? this.#tryReadNextAsInvokerRightsClause()
      ?? this.#tryReadNextAsAccessibleByClause()
      ?? this.#tryReadNextAsDefaultCollationClause()
      ?? this.#tryReadNextAsDeterministicClause()
      // LATER: shard_enable_clause
      ?? this.#tryReadNextAsParallelEnableClause()
      ?? this.#tryReadNextAsResultCacheClause()
      // LATER: aggregate_clause
      ?? this.#tryReadNextAsPipelinedClause()
    // LATER: sql_macro_clause
    // LATER: body
    // LATER: call_spec
    // LATER: datatype
    // LATER: declare_section
    // LATER: parameter_declaration
  }

  /**
   * Reads a sequence of zero or more unit declaration modifiers.
   * @returns {Generator<SyntaxNode>}
   * @yields {SyntaxNode}
   * <p>
   * NOTE: not all clauses may apply to an object, we are just parsing them as if they are to make the code slightly less complicated.
   */
  *#readNextAsUnitDeclarationModifiers() {
    let modifier
    while (modifier = this.#tryReadNextAsUnitDeclarationModifier()) {
      yield modifier
    }
  }

  // ---------------

  /**
   * Tries reading the next item as a single parameter from an invocation.
   * @returns {InvocationParameterExpressionSyntaxNode?}
   */
  #tryReadNextAsInvocationParameter() {
    // ParameterName => Value
    const nameAndArrow = this.tryReadNextTokens(Patterns.ANY_IDENTIFIER, Patterns.ARROW)
    if (nameAndArrow) {
        const [name, arrowToken] = nameAndArrow
        return new InvocationParameterExpressionSyntaxNode(new IdentifierSyntaxNode(name), arrowToken, this.#readNextAsValueExpression())
    }

    // Try just value.
    const value = this.#tryReadNextAsValueExpression()
    if (value) {
      return new InvocationParameterExpressionSyntaxNode(value)
    }

    // None at all
    return null
  }

  /**
   * Reads the next item as a single parameter from an invocation.
   * @returns {InvocationParameterExpressionSyntaxNode}
   */
  #readNextAsInvocationParameter() {
    const param = this.#tryReadNextAsInvocationParameter()
    if (param) {
      return param
    }

    this.syntaxError('Expected invocation parameter')
  }

  /**
   * Reads a sequence of zero or more parameters and separating commas from an invocation.
   * @returns {Generator<SyntaxNode>}
   * @yields {SyntaxNode}
   */
  *#readNextAsInvocationParametersWithCommas() {
    let param = this.#tryReadNextAsInvocationParameter()
    if (!param) {
      return
    }

    yield param

    let comma
    while (param && (comma = this.#tryReadNextAsComma())) {
      yield comma
      yield param = this.#readNextAsInvocationParameter()
    }
  }

  /**
   * Tries reading the next item as a parameter list from a declaration.
   * @returns {InvocationParameterListExpressionSyntaxNode?}
   */
  #tryReadNextAsInvocationParameterList() {
    const openParenToken = this.#tryReadNextAsOpenParenToken()
    if (!openParenToken) {
      return null
    }

    return new InvocationParameterListExpressionSyntaxNode(
      openParenToken,
      [...this.#readNextAsInvocationParametersWithCommas()],
      this.#readNextAsCloseParenToken()
    )
  }

  /**
   * Reads starting with the given token as an identifier used as an invocation
   * of a procedure, function, cursor, method, pseudofunction, or similar.
   * @param {TokenLike} token The first token in the identifier.
   * @returns {InvocationExpressionSyntaxNode}
   */
  #readAsInvocation(token) {
    const identifier = this.#readAsIdentifier(token)
    return new InvocationExpressionSyntaxNode(identifier, this.#tryReadNextAsInvocationParameterList())
  }

  /**
   * Tries reading the next item as an identifier used as an invocation
   * of a procedure, function, cursor, method, pseudofunction, or similar.
   * @returns {InvocationExpressionSyntaxNode?}
   */
  #tryReadNextAsInvocation() {
    const identifier = this.#tryReadNextAsIdentifier()
    return identifier ? new InvocationExpressionSyntaxNode(identifier, this.#tryReadNextAsInvocationParameterList()) : null
  }

  /**
   * Reads starting with the given token as an identifier optionally used as an invocation
   * of a procedure, function, cursor, method, pseudofunction, or similar.
   * @param {TokenLike} token The first token in the identifier.
   * @returns {InvocationExpressionSyntaxNode | IdentifierSyntaxNode}
   * <p>
   * Note we currently don't have a good way to distinguish between a function invoked without parentheses and a standalone identifier.
   */
  #readAsIdentifierOrInvocation(token) {
    const identifier = this.#readAsIdentifier(token)
    const parameterList = this.#tryReadNextAsInvocationParameterList()
    return parameterList ? new InvocationExpressionSyntaxNode(identifier, parameterList) : identifier
  }

  // -----------------------------------
  // PL/SQL block unit common
  // -----------------------------------

  #tryReadAsNonPlsqlProcedureOrFunctionBody() {
    // Look for LANGUAGE keyword, followed by a language name.
    const keyword = this.tryReadNextToken('LANGUAGE')
    if (!keyword) {
      return null
    }

    // This isn't the full definition, but what I know of:
    // LANGUAGE [C|JAVA] NAME <string-literal>
    return new ExpressionSyntaxNode(
      keyword,
      this.#readNextAsIdentifier(),
      this.readNextToken('NAME'),
      this.#readNextAsStringLiteral()
    )
  }

  /**
   * Try reading the next item as a function body.
   * @returns {SyntaxNode?}
   */
  #tryReadNextAsProcedureOrFunctionBody() {
    const isOrAsKeyword = this.tryReadNextToken(Patterns.IS_OR_AS)
    if (!isOrAsKeyword) {
      return null
    }

    const body = this.#tryReadAsNonPlsqlProcedureOrFunctionBody()
    if (body) {
      return new ExpressionSyntaxNode(isOrAsKeyword, body)
    }

    throw this.notImplemented("Function body")
  }

  /**
   * Reads starting with the given token as a `FUNCTION` declaration within a PL/SQL declaration block.
   * @param {TokenLike} methodKeyword
   * @returns {FunctionDeclarationStatementSyntaxNode}
   */
  #readAsFunctionDeclaration(methodKeyword) {
    this.verify(Patterns.FUNCTION, methodKeyword)

    return new FunctionDeclarationStatementSyntaxNode(
      methodKeyword,
      this.#readNextAsIdentifier(),
      this.#tryReadNextAsParameterListDeclaration(),
      this.#tryReadNextAsReturnDeclaration(),
      [...this.#readNextAsUnitDeclarationModifiers()],
      this.#tryReadNextAsProcedureOrFunctionBody(),
      this.#tryReadNextAsSemicolonToken()
    )
  }

  // ---------------

  /**
   * Reads starting with the given token as a `PROCEDURE` declaration within a PL/SQL declaration block.
   * @param {TokenLike} methodKeyword
   * @returns {ProcedureDeclarationStatementSyntaxNode}
   */
  #readAsProcedureDeclaration(methodKeyword) {
    this.verify(Patterns.PROCEDURE, methodKeyword)

    return new ProcedureDeclarationStatementSyntaxNode(
      methodKeyword,
      this.#readNextAsIdentifier(),
      this.#tryReadNextAsParameterListDeclaration(),
      [...this.#readNextAsUnitDeclarationModifiers()],
      this.#tryReadNextAsProcedureOrFunctionBody(),
      this.#tryReadNextAsSemicolonToken()
    )
  }

  // ---------------

  /**
   * Reads starting with the given token as a pragma declaration.
   * @param {TokenLike} pragmaKeyword
   * @returns {PragmaDeclarationStatementSyntaxNode}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/plsql-language-fundamentals.html#GUID-D6EFD7E8-39DF-4430-B625-B6D37E49F6F4
   */
  #readAsPragmaDeclaration(pragmaKeyword) {
    this.verify(Patterns.PRAGMA, pragmaKeyword)

    const name = this.#tryReadNextAsIdentifier() // probably a keyword to be safe

    const openParenToken = this.#tryReadNextAsOpenParenToken()
    const parameterList = openParenToken
      ? new InvocationParameterListExpressionSyntaxNode(openParenToken, [...this.#readNextAsInvocationParametersWithCommas()], this.#readNextAsCloseParenToken())
      : null

    return PragmaDeclarationStatementSyntaxNode.create(pragmaKeyword, name, parameterList, this.#tryReadNextAsSemicolonToken())
  }

  // ---------------

  /**
   * Reads starting with the given token as a subtype declaration.
   * @param {TokenLike} keyword
   * @returns {SubtypeDeclarationStatementSyntaxNode}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/plsql-data-types.html#GUID-0E03C20F-2960-4ED9-8692-D4DCBF1F9670
   */
  #readAsSubtypeDeclaration(keyword) {
    this.verify({ value: 'SUBTYPE' }, keyword)

    return new SubtypeDeclarationStatementSyntaxNode(
      keyword,
      this.#readNextAsIdentifier(),
      this.readNextToken(Patterns.IS),
      this.#readNextAsTypeExpression(),
      this.#tryReadNextAsSemicolonToken()
    )
  }

  /**
   * Reads starting with the given token as a type declaration.
   * @param {TokenLike} typeKeyword
   * @returns {TypeDeclarationStatementSyntaxNodeBase}
   */
  #readAsTypeDeclaration(typeKeyword) {
    this.verify({ value: 'TYPE' }, typeKeyword)

    const name = this.#readNextAsIdentifier()
    const isKeyword = this.readNextToken(Patterns.IS)

    const recordKeyword = this.tryReadNextToken('RECORD')
    if (recordKeyword) {
      return new RecordTypeDeclarationStatementSyntaxNode(
        typeKeyword,
        name,
        isKeyword,
        recordKeyword,
        this.#readNextAsParameterListDeclaration(),
        this.#tryReadNextAsSemicolonToken()
      )
    }

    // Any other TYPE
    return new TypeDeclarationStatementSyntaxNode(typeKeyword, name, isKeyword, this.#readNextAsTypeExpression(), this.#tryReadNextAsSemicolonToken())
  }

  // ---------------

  /**
   * Reads starting with the given token as a variable, constant, or exception declaration.
   * @param {TokenLike} keyword
   * @returns {ExceptionDeclarationStatementSyntaxNode | VariableDeclarationStatementSyntaxNode}
   */
  #readAsVariableDeclaration(token) {
    const name = this.#readAsIdentifier(token)

    const exception = this.tryReadNextToken(Patterns.EXCEPTION)
    if (exception) {
      // <identifier> EXCEPTION;
      return new ExceptionDeclarationStatementSyntaxNode(name, exception, this.#tryReadNextAsSemicolonToken())
    }

    const constant = this.tryReadNextToken(Patterns.CONSTANT)
    const type = this.#readNextAsTypeExpression()

    const defaultExpression = this.#tryReadNextAsAnyDefault()
    const defaultValue = defaultExpression ? this.#readNextAsValueExpression() : null

    return new VariableDeclarationStatementSyntaxNode(
      name,
      constant,
      type,
      defaultExpression,
      defaultValue,
      this.#tryReadNextAsSemicolonToken()
    )
  }

  // -----------------------------------
  // PL/SQL Procedure unit
  // -----------------------------------

  /**
   * Reads the rest of the `CREATE FUNCTION` statement.
   * @param {SyntaxNode} create
   * @param {SyntaxNode} editionable
   * @param {UnitTypeSyntaxNode} unitType
   * @param {SyntaxNode?} ifNotExists
   * @returns {CreateFunctionStatementSyntaxNode}
   */
  #readRestOfStandaloneFunction(create, editionable, unitType, ifNotExists) {
    throw this.notImplemented('CREATE FUNCTION')
  }

  // -----------------------------------
  // PL/SQL Function unit
  // -----------------------------------

  /**
   * Reads the rest of the `CREATE PROCEDURE` statement.
   * @param {SyntaxNode} create
   * @param {SyntaxNode} editionable
   * @param {UnitTypeSyntaxNode} unitType
   * @param {SyntaxNode?} ifNotExists
   * @returns {CreateProcedureStatementSyntaxNode}
   */
  #readRestOfStandaloneProcedure(create, editionable, unitType, ifNotExists) {
    throw this.notImplemented('CREATE PROCEDURE')
  }

  // -----------------------------------
  // PL/SQL Package unit (spec)
  // -----------------------------------

  /**
   * Reads a sequence of zero or more declarations within a package spec.
   * @returns {Generator<SyntaxNode>}
   * @yields {SyntaxNode}
   */
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
              yield this.#readAsTypeDeclaration(token)
              continue
            case 'PROCEDURE':
              yield this.#readAsProcedureDeclaration(token)
              continue
            case 'FUNCTION':
              yield this.#readAsFunctionDeclaration(token)
              continue
            case 'PRAGMA':
              yield this.#readAsPragmaDeclaration(token)
              continue
            case 'END':
              yield this.#readAsEndOfBlock(token)
              return
          }
          break
      }

      // At this point we MAY have an identifier or a keyword being used as an identifier.
      if (token.type === 'reserved') {
        console.assert(false, `${token.textSpan} unexpected reserved word in package spec`, token)
        yield this.#readAsOpaquePlsqlStatement(token)
        continue
      }

      // Just treat this as an identifier, it's probably a constant or variable
      yield this.#readAsVariableDeclaration(token)
    }
  }

  /**
   * Reads the rest of the `CREATE PACKAGE` spec statement.
   * @param {SyntaxNode} create `CREATE [OR REPLACE]`
   * @param {SyntaxNode} editionable `EDITIONABLE` clause
   * @param {UnitTypeSyntaxNode} unitType `PACKAGE`
   * @param {SyntaxNode} ifNotExists `IF NOT EXISTS`
   * @returns {CreatePackageStatementSyntaxNode}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/CREATE-PACKAGE-statement.html#GUID-03A70A54-90FF-4293-B6B8-F0B35E184AC5
   */
  #readRestOfPackageSpec(create, editionable, unitType, ifNotExists) {
    // <identifier>
    const name = this.#readNextAsIdentifier()

    // sharing_clause? -> {default_collation_clause, invoker_rights_clause, accessible_by_clause}*
    const unitModifiers = [...this.#readNextAsUnitDeclarationModifiers()]

    const header = new CreatePackageHeaderExpressionSyntaxNode(create, editionable, unitType, ifNotExists, name, unitModifiers)

    return new CreatePackageStatementSyntaxNode(
      header,
      this.readNextToken(Patterns.IS_OR_AS),
      // It is (our) standard practice to put the PACKAGE doc comment right after the IS.
      // This is because Oracle understandably doesn't recognize comments before the CREATE statement as part of the package and it throws off line numbers, etc.
      this.#tryReadNextAsDocComment(),
      [...this.#readNextAsPackageSpecContent()],
      this.#tryReadNextAsSemicolonToken(),
      this.#tryReadNextAsSlashToken()
    );
  }

  #readAsEndOfBlock(end) {
    this.verify('END', end)
    return new ExpressionSyntaxNode(end, this.tryReadNextToken(Patterns.ANY_IDENTIFIER));
  }

  // -----------------------------------
  // PL/SQL Type unit
  // -----------------------------------

  /**
   * Tries reading the next item as an `OID '<oid-value>'` expression.
   * @returns {ExpressionSyntaxNode?}
   */
  #tryReadNextAsTypeOid() {
    const oid = this.tryReadNextToken('OID')
    return oid ? new ExpressionSyntaxNode(oid, this.#readNextAsStringLiteral()) : null
  }

  // -----------------------------------
  // PL/SQL Object type unit
  // -----------------------------------

  /**
   * Tries reading the next item as an inheritance flag (e.g. `FINAL`, `NOT INSTANTIABLE`).
   * @returns {InheritanceFlagSyntaxNode?}
   */
  #tryReadNextAsInheritanceFlag() {
    const inheritancePatterns = ['FINAL', 'INSTANTIABLE', 'OVERRIDING', 'PERSISTABLE']

    let tokens = this.tryReadNextTokens('NOT', inheritancePatterns) ?? this.tryReadNextTokens(inheritancePatterns)
    return tokens ? new InheritanceFlagSyntaxNode(...tokens) : null
  }

  /**
   * Reads a sequence of zero or more inheritance flags (e.g. `FINAL`, `NOT INSTANTIABLE`).
   * @returns {Generator<InheritanceFlagSyntaxNode>}
   * @generator
   * @yields {InheritanceFlagSyntaxNode}
   */
  *#readNextAsInheritanceFlags() {
    let inheritance
    while (inheritance = this.#tryReadNextAsInheritanceFlag()) {
      yield inheritance
    }
  }

  // ---------------

  /**
   * Tries reading the next item as a single object type attribute (field/property).
   * @param {InheritanceFlagSyntaxNode[]} inheritance
   * @returns {ObjectAttributeDeclarationExpressionSyntaxNode?}
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

  // ---------------

  /**
   * Reads the next item as a constructor return declaration.
   * @returns {ConstructorReturnDeclarationExpressionSyntaxNode}
   */
  #tryReadNextAsReturnSelfAsResult() {
    const tokens = this.tryReadNextTokens(Patterns.RETURN, 'SELF', 'AS', 'RESULT')
    return tokens ? new ConstructorReturnDeclarationExpressionSyntaxNode(tokens) : null
  }

  /**
   * Tries reading the next item as the rest of an object type constructor.
   * @param {InheritanceFlagSyntaxNode[]} inheritance
   * @returns {ConstructorDeclarationStatementSyntaxNode?}
   */
  #tryReadNextAsRestOfObjectConstructorMethod(inheritance) {
    // constructor is always function
    const tokens = this.tryReadNextTokens('CONSTRUCTOR', Patterns.FUNCTION)
    if (!tokens) {
      return null
    }


    const [constructorKeyword, methodKeyword] = tokens
    return new ConstructorDeclarationStatementSyntaxNode(
      inheritance,
      constructorKeyword,
      methodKeyword,
      this.#readNextAsIdentifier(),
      this.#tryReadNextAsParameterListDeclaration(),
      this.#tryReadNextAsReturnSelfAsResult(),
      [...this.#readNextAsUnitDeclarationModifiers()]
    )
  }

  // ---------------

  /**
   * Tries reading the next item as the rest of an object type method (member or static),
   * including `MAP` and `ORDER` methods.
   * ```text
   * [MAP|ORDER]? [MEMBER|STATIC] [PROCEDURE|FUNCTION] <identifier>...
   * ```
   * @param {InheritanceFlagSyntaxNode[]} inheritance
   * @returns {ObjectMethodDeclarationStatementSyntaxNode?}
   */
  #tryReadNextAsRestOfObjectMemberOrStaticMethod(inheritance) {
    const requiredPatterns = [['MEMBER', 'STATIC'], [Patterns.PROCEDURE, Patterns.FUNCTION]]
    const tokens = this.tryReadNextTokens(['MAP', 'ORDER'], ...requiredPatterns)
      ?? this.tryReadNextTokens(...requiredPatterns)
    if (!tokens) {
      return null
    }

    const [mapOrOrder, memberOrStatic, methodKeyword] = tokens.length === 3 ? tokens : [null, ...tokens]

    return new ObjectMethodDeclarationStatementSyntaxNode(
      inheritance,
      mapOrOrder, memberOrStatic, methodKeyword,
      this.#readNextAsIdentifier(),
      this.#tryReadNextAsParameterListDeclaration(),
      this.#tryReadNextAsReturnDeclaration(),
      [...this.#readNextAsUnitDeclarationModifiers()]
    )
  }

  /**
   * Tries reading the next item as an object member declaration (e.g., method, attribute, constructor).
   * @returns {ObjectMemberDeclarationExpressionSyntaxNode?}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/element-specification.html#GUID-20D95D8A-5C17-4C89-9AAB-1852CDB57CE2
   */
  #tryReadNextAsObjectMemberDeclaration() {
    const inheritance = [...this.#readNextAsInheritanceFlags()]

    // subprogram_spec
    // map_order_function_spec
    // (we don't care about the distinction, Oracle does)
    let method = this.#tryReadNextAsRestOfObjectMemberOrStaticMethod(inheritance)
    if (method) {
      return method
    }

    // constructor_spec (always a function)
    if (method = this.#tryReadNextAsRestOfObjectConstructorMethod(inheritance)) {
      return method
    }

    // attribute
    return this.#tryReadNextAsObjectAttributeDeclaration(inheritance)
  }

  /**
   * Reads the next item as an object member declaration (e.g., method, attribute, constructor).
   * @returns {ObjectMemberDeclarationExpressionSyntaxNode}
   */
  #readNextAsObjectMemberDeclaration() {
    const param = this.#tryReadNextAsObjectMemberDeclaration()
    if (param) {
      console.assert(param instanceof ObjectMethodDeclarationStatementSyntaxNodeBase || param instanceof ObjectAttributeDeclarationExpressionSyntaxNode, `${param.textSpan}: must be method or attribute`)
      return param
    }
    throw this.syntaxError('Expected: object member')
  }

  /**
   * Reads a sequence of zero or more object member declarations and separating commas from an object type declaration.
   * @returns {Generator<SyntaxNode>}
   * @yields {SyntaxNode}
   */
  *#readNextAsObjectMemberDeclarationsWithCommas() {
    let param = this.#tryReadNextAsObjectMemberDeclaration()
    if (!param) {
      return
    }

    console.assert(param instanceof SyntaxNode, `${param.textSpan}: not a SyntaxNode`, param)
    yield param

    let comma
    while (param && (comma = this.#tryReadNextAsComma())) {
      yield comma
      yield param = this.#readNextAsObjectMemberDeclaration()
      console.assert(param instanceof SyntaxNode || !param, `${param.textSpan}: not a SyntaxNode or null`, param)
    }
  }

  /**
   * Tries reading the next item as a list of object member declarations.
   * @returns {ObjectMemberListDeclarationExpressionSyntaxNode?}
   */
  #tryReadNextAsObjectMemberListDeclaration() {
    const openParenToken = this.#tryReadNextAsOpenParenToken()
    if (!openParenToken) {
      return null
    }

    return new ObjectMemberListDeclarationExpressionSyntaxNode(
      openParenToken,
      // It is (our) standard practice to put the OBJECT TYPE doc comment right after the opening parenthesis.
      // This is because Oracle understandably doesn't recognize comments before the CREATE statement as part of the package and it throws off line numbers, etc.
      this.#tryReadNextAsDocComment(),
      [...this.#readNextAsObjectMemberDeclarationsWithCommas()],
      this.#readNextAsCloseParenToken()
    )
  }

  // ---------------

  /**
   * Tries reading the next item as a type modifier.
   * @returns {SyntaxNode?}
   * <p>
   * LATER: Consider folding this in with inheritance flags
   */
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

  /**
   * Reads a sequence of zero or more type modifiers.
   * @returns {Generator<SyntaxNode>}
   * @yields {SyntaxNode}
   */
  *#readNextAsTypeModifiers() {
    let modifier
    while (modifier = this.#tryReadNextAsTypeModifier()) {
      yield modifier
    }
  }

  /**
   * Reads the rest of the `CREATE TYPE` statement.
   * ```text
   * <identifier> [FORCE]? [OID '<oid>']? <sharing-clause>? <default-collation-clause>? { invoker_rights_clause, accessible_by_clause}*
   * ```
   * @param {SyntaxNode} create
   * @param {SyntaxNode} editionable
   * @param {UnitTypeSyntaxNode} unitType
   * @param {SyntaxNode?} ifNotExists
   * @returns {CreateTypeStatementSyntaxNode}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/CREATE-TYPE-statement.html#GUID-389D603D-FBD0-452A-8414-240BBBC57034
   */
  #readRestOfTypeSpec(create, editionable, unitType, ifNotExists) {
    const name = this.#readNextAsIdentifier()
    const force = SyntaxNode.asSyntaxNode(this.tryReadNextToken('FORCE'))
    const oid = this.#tryReadNextAsTypeOid()

    // Just read all the unit declaration modifiers into one bucket.
    const unitModifiers = [...this.#readNextAsUnitDeclarationModifiers()]

    const header = new CreateTypeHeaderExpressionSyntaxNode(create, editionable, unitType, ifNotExists, name, force, oid, unitModifiers)

    // Next see if it is a base type or a subtype.
    const underKeyword = this.tryReadNextToken('UNDER')
    if (underKeyword) {
      // object subtype definition (UNDER keyword).
      // **NOTE:** there is no `IS` keyword here.
      return new CreateInheritedObjectTypeStatementSyntaxNode(
        header,
        underKeyword,
        this.#readNextAsIdentifier(),
        this.#tryReadNextAsObjectMemberListDeclaration(),
        [...this.#readNextAsTypeModifiers()],
        this.#tryReadNextAsSemicolonToken(),
        this.#tryReadNextAsSlashToken()
      )
    }

    // The other 3 require IS
    //  - object base type definition
    //  - nested table
    //  - varray
    const isOrAsKeyword = this.readNextToken(Patterns.IS_OR_AS)

    const objectKeyword = this.tryReadNextToken('OBJECT')
    if (objectKeyword) {
      return new CreateBaseObjectTypeStatementSyntaxNode(
        header,
        isOrAsKeyword,
        objectKeyword,
        this.#tryReadNextAsObjectMemberListDeclaration(),
        [...this.#readNextAsTypeModifiers()],
        this.#tryReadNextAsSemicolonToken(),
        this.#tryReadNextAsSlashToken()
      )
    }

    const varrayKeyword = this.tryReadNextToken('VARRAY') //, 'VARRAY', 'TABLE'])
    if (varrayKeyword) {
      throw this.notImplemented('IS VARRAY')
    }

    const tableKeyword = this.tryReadNextToken('TABLE')
    if (tableKeyword) {
      return new CreateNestedTableTypeStatementSyntaxNode(
        header,
        isOrAsKeyword,
        this.#tryReadNextAsDocComment(),
        this.#readAsTypeExpression(tableKeyword), // should be unrestricted but we don't care.
        [...this.#readNextAsTypeModifiers()],
        this.#tryReadNextAsSemicolonToken(),
        this.#tryReadNextAsSlashToken()
      )
    }

    throw this.notImplemented(this.iterator.value ?? isOrAsKeyword.lastToken, 'unknown TYPE type')
  }

  // -----------------------------------
  // More PL/SQL common
  // -----------------------------------

  /**
   * Reads starting with the given token as an identifier (with optional `%` operator) as a variable or parameter type.
   * @param {TokenLike} token
   * @returns {TypeExpressionSyntaxNode}
   */
  #readAsTypeIdentifier(token) {
    return new TypeExpressionSyntaxNode(
      this.#readAsIdentifier(token, '@', '%'),
      this.#tryReadNextAsNullabilityTypeRestriction()
    )
  }

  // ---------------

  /**
   * Tries reading the next item as a length restriction.
   * @returns {LengthTypeRestrictionExpressionSyntaxNode?}
   */
  #tryReadNextAsLengthTypeRestriction() {
    const openParenToken = this.#tryReadNextAsOpenParenToken()
    if (openParenToken) {
      return new LengthTypeRestrictionExpressionSyntaxNode(
        openParenToken,
        this.#readNextAsNumberExpression(),
        SyntaxNode.asSyntaxNode(this.tryReadNextToken(['BYTE', 'CHAR'])),
        this.#readNextAsCloseParenToken()
      )
    }

    return null
  }

  /**
   * Tries reading the next item as a length restriction.
   * @returns {NullabilityTypeRestrictionExpressionSyntaxNode?}
   */
  #tryReadNextAsNullabilityTypeRestriction() {
    const nullability = this.tryReadNextTokens('NOT', 'NULL') ?? this.tryReadNextToken('NULL')
    return nullability ? new NullabilityTypeRestrictionExpressionSyntaxNode(...nullability) : null
  }

  /**
   * Tries reading the next item as a precision restriction, with enclosing parentheses.
   * @returns {PrecisionTypeRestrictionExpressionSyntaxNode?}
   * @see {@link #tryReadNextAsPrecisionAndScaleTypeRestriction} for the numeric version
   */
  #tryReadNextAsPrecisionTypeRestriction() {
    const openParenToken = this.#tryReadNextAsOpenParenToken()
    if (openParenToken) {
      return new PrecisionTypeRestrictionExpressionSyntaxNode(
        openParenToken,
        this.#readNextAsNumberExpression(),
        this.#readNextAsCloseParenToken()
      )
    }

    return null
  }

  /**
   * Tries reading the next item as a precision-and-scale restriction.
   * @returns {PrecisionAndScaleTypeRestrictionExpressionSyntaxNode?}
   */
  #tryReadNextAsPrecisionAndScaleTypeRestriction() {
    const openParenToken = this.#tryReadNextAsOpenParenToken()
    if (openParenToken) {
      return new PrecisionAndScaleTypeRestrictionExpressionSyntaxNode(
        openParenToken,
        this.#tryReadNextAsNumberExpression() ?? this.#readNextAsAsterisk(),
        this.#tryReadNextAsComma(),
        this.#tryReadNextAsNumberExpression(),
        this.#readNextAsCloseParenToken()
      )
    }

    return null
  }

  /**
   * Tries reading the next item as a range restriction.
   * @returns {RangeTypeRestrictionExpressionSyntaxNode?}
   */
  #tryReadNextAsRangeRestriction() {
    const keyword = this.tryReadNextToken('RANGE')
    if (!keyword) {
      return null
    }

    return new RangeTypeRestrictionExpressionSyntaxNode(
      keyword,
      this.#readNextAsNumberExpression(),
      this.readNextToken(Patterns.DOTDOT),
      this.#readNextAsNumberExpression()
    )
  }

  // ---------------

  /**
   * Reads starting with the given token as an interval type expression.
   * ```text
   * INTERVAL DAY [(<precision>)]? TO SECOND [(<precision>)]?
   * INTERVAL YEAR [(<precision>)]? TO MONTH
   * ```
   * @param {TokenLike} name
   * @returns {TypeExpressionSyntaxNode}
   */
  #readAsIntervalTypeExpression(name) {
    this.verify(Patterns.INTERVAL, name)

    const day = this.tryReadNextToken('DAY')
    if (day) {
      return new TypeExpressionSyntaxNode(
        name,
        day,
        this.#tryReadNextAsPrecisionTypeRestriction(),
        this.readNextToken('TO'),
        this.readNextToken('SECOND'),
        this.#tryReadNextAsPrecisionTypeRestriction(),
        this.#tryReadNextAsNullabilityTypeRestriction()
      )
    }

    const year = this.tryReadNextToken('YEAR')
    if (year) {
      return new TypeExpressionSyntaxNode(
        name,
        year,
        this.#tryReadNextAsPrecisionTypeRestriction(),
        this.readNextToken('TO'),
        this.readNextToken('MONTH'),
        this.#tryReadNextAsNullabilityTypeRestriction()
      )
    }

    throw new TokenSyntaxError(name, "INTERVAL type found, but not DAY or YEAR")
  }

  // ---------------

  /**
   * Reads starting with the given token as a ref cursor type expression.
   * ```text
   * REF CURSOR [RETURN <type>]?
   * ```
   * @param {TokenLike} name
   * @returns {ExpressionSyntaxNode}
   */
  #readAsRefCursorTypeExpression(ref, cursor) {
    const returnKeyword = this.tryReadNextToken(Patterns.RETURN)
    const type = returnKeyword ? this.#readNextAsTypeExpression() : null
    return new TypeExpressionSyntaxNode(ref, cursor, returnKeyword, type)
  }

  // ---------------

  /**
   * Reads starting with the given token as a ref object type expression.
   * ```text
   * REF <type>
   * ```
   * @param {TokenLike} name
   * @returns {ExpressionSyntaxNode}
   */
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

  // ---------------

  /**
   * Reads starting with the given token as a `TABLE OF` type expression.
   * ```text
   * TABLE OF <type> [INDEX BY <type>]?
   * ```
   * @param {TokenLike} name
   * @returns {TypeExpressionSyntaxNode}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/collection-variable.html
   */
  #readAsTableOfTypeExpression(table) {
    // nested table (`TABLE OF <type-expr>`)
    // @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/CREATE-TYPE-statement.html#GUID-389D603D-FBD0-452A-8414-240BBBC57034__NESTED_TABLE_TYPE_DEF-DC078C6A
    const tableOf = new SyntaxNode(table, this.readNextToken(Patterns.OF))
    const itemType = this.#readNextAsTypeExpression()

    // Check for `INDEX BY` to see if this is an associative array or a nested table type (array)
    const indexBy = this.tryReadNextTokens('INDEX', 'BY')
    if (indexBy) {
      const keyType = this.#readNextAsTypeExpression()
      return new AssociativeArrayTypeExpressionSyntaxNode(tableOf, itemType, indexBy, keyType)
    } else {
      return new NestedTableTypeExpressionSyntaxNode(tableOf, itemType, this.#tryReadNextAsNullabilityTypeRestriction())
    }
  }

  // ---------------

  /**
   * Reads starting with the given token as a type expression.
   * @param {TokenLike} name The initial name token for the type
   * @returns {TypeExpressionSyntaxNode | IdentifierSyntaxNode}
   */
  #readAsTypeExpression(name) {
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
      case 'XMLTYPE':
      case 'ROWID':
      case 'UROWID':
      case 'YMINTERVAL_UNCONSTRAINED': // alias for INTERVAL YEAR (9) TO MONTH
      case 'DSINTERVAL_UNCONSTRAINED': // alias for INTERVAL DAY (9) TO SECOND (9)
      case 'TIMESTAMP_UNCONSTRAINED': // alias for TIMESTAMP(9)
      case 'TIMESTAMP_LTZ_UNCONSTRAINED': // alias for TIMESTAMP(9) WITH LOCAL TIME ZONE
      case 'TIMESTAMP_TZ_UNCONSTRAINED': // alias for TIMESTAMP(9) WITH TIME ZONE
        return new TypeExpressionSyntaxNode(
          name,
          this.#tryReadNextAsNullabilityTypeRestriction()
        )
      case 'BINARY_INTEGER':
      case 'NATURAL':
      case 'NATURALN':
      case 'PLS_INTEGER':
      case 'POSITIVE':
      case 'POSITIVEN':
      case 'SIMPLE_INTEGER':
        return new IntegerTypeExpressionSyntaxNode(
          new IdentifierSyntaxNode(name),
          this.#tryReadNextAsRangeRestriction(),
          this.#tryReadNextAsNullabilityTypeRestriction()
        )
      case 'INTERVAL':
        return this.#readAsIntervalTypeExpression(name)
      case 'TIMESTAMP':
        return new TypeExpressionSyntaxNode(
          name,
          this.#tryReadNextAsPrecisionTypeRestriction(),
          this.tryReadNextTokens('WITH', 'LOCAL', 'TIME', 'ZONE') ?? this.tryReadNextTokens('WITH', 'TIME', 'ZONE'),
          this.#tryReadNextAsNullabilityTypeRestriction()
        )
      case 'CHAR':
      case 'RAW':
      case 'VARCHAR':
      case 'VARCHAR2': {
        return new CharacterTypeExpressionSyntaxNode(
          name,
          this.#tryReadNextAsLengthTypeRestriction(),
          this.#tryReadNextAsNullabilityTypeRestriction()
        )
      }
      case 'DECIMAL':
      case 'INT': // alias of INTEGER (see below)
      case 'INTEGER': // nonrangeable, can specify precision/scale
      case 'NUMBER':
        return new DecimalTypeExpressionSyntaxNode(
          name,
          this.#tryReadNextAsPrecisionAndScaleTypeRestriction(),
          this.#tryReadNextAsNullabilityTypeRestriction()
        )

      case 'REF':
        return this.#readAsRefTypeExpression(name)
      case 'TABLE':
        return this.#readAsTableOfTypeExpression(name)
      case 'LONG':
        // oh boy, the ancient LONG/LONG RAW types
        return new TypeExpressionSyntaxNode(
          long,
          this.tryReadNextToken('RAW'),
          this.#tryReadNextAsNullabilityTypeRestriction()
        )

      case 'EXCEPTION':
      case 'RECORD':
        // Special cases: these are handled elsewhere.
        throw this.syntaxError(`${name.value} not expected here`)

      default:
        if (name.type !== 'identifier') {
          // These are possibly other reserved words we should handle.
          console.infoOnce(name.value, `${name.textSpan}: unhandled type keyword`, name.value)
          // }
        }
        return this.#readAsTypeIdentifier(name)
    }
  }

  /**
   * Reads the next item as a type expression.
   * @returns {ExpressionSyntaxNode}
   */
  #readNextAsTypeExpression() {
    let token = this.readNextToken([Patterns.RESERVED, Patterns.KEYWORD, Patterns.IDENTIFIER])
    return this.#readAsTypeExpression(token)
  }

  /**
   * Tries reading the next item as a number expression.
   * @returns {LiteralSyntaxNode?}
   */
  #tryReadNextAsNumberLiteral() {
    const tokens = this.tryReadNextTokens(Patterns.NUMBER_LITERAL) ?? this.tryReadNextTokens(Patterns.NUMERIC_UNARY_OPERATOR, Patterns.NUMBER_LITERAL)
    return tokens ? new LiteralSyntaxNode(...tokens) : null
  }

  /**
   * Reads the next item as a number literal expression.
   * @returns {LiteralSyntaxNode}
   */
  #readNextAsNumberLiteral() {
    const tokens = this.tryReadNextTokens(Patterns.NUMBER_LITERAL) ?? this.readNextTokens(Patterns.NUMERIC_UNARY_OPERATOR, Patterns.NUMBER_LITERAL)
    return new LiteralSyntaxNode(...tokens)
  }


  /**
   * Tries reading the next item as a number expression.
   * @returns {ExpressionSyntaxNode? | LiteralSyntaxNode?}
   */
  #tryReadNextAsNumberExpression() {
    // LATER: Oracle allows references in a lot of places now as of 19c? 21c?.
    // For now just read a number literal
    return this.#tryReadNextAsNumberLiteral()
  }

  /**
   * Reads the next item as a number expression.
   * @returns {ExpressionSyntaxNode | LiteralSyntaxNode}
   */
  #readNextAsNumberExpression() {
    // LATER: Oracle allows references in a lot of places now as of 19c? 21c?.
    // For now just read a number literal
    return this.#readNextAsNumberLiteral()
  }

  // ---------------

  /**
   * Reads starting with the given token as an interval literal expression.
   * ```text
   * INTERVAL <string> DAY [(<precision>)]? TO SECOND [(<precision>)]?
   * INTERVAL <string> YEAR [(<precision>)]? TO MONTH
   * ```
   * @param {TokenLike} keyword
   * @returns {ExpressionSyntaxNode}
   *
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/Literals.html#GUID-DC8D1DAD-7D04-45EA-9546-82810CD09A1B
   */
  #readAsIntervalLiteralExpression(keyword) {
    this.verify(Patterns.INTERVAL, keyword)

    const literal = this.#readNextAsStringLiteral()

    const field = this.readNextToken(['DAY', 'HOUR', 'MINUTE', 'SECOND', 'YEAR', 'MONTH'])
    switch (field.value) {
      case 'DAY':
      case 'HOUR':
      case 'MINUTE':
      case 'SECOND':
        return new DSIntervalLiteralExpressionSyntaxNode(
          keyword,
          literal,
          this.#readAsDSIntervalLeadingTypeRestrictionExpression(field),
          this.#tryReadNextAsDSIntervalTrailingTypeRestrictionExpression()
        )
      case 'YEAR':
      case 'MONTH':
        return new YMIntervalLiteralExpressionSyntaxNode(
          keyword,
          literal,
          this.#readAsYMIntervalLeadingTypeRestrictionExpression(field),
          this.#tryReadNextAsYMIntervalTrailingTypeRestrictionExpression()
        )
    }

    throw new TokenSyntaxError(keyword, "INTERVAL literal found, but not DAY or YEAR")
  }

  /**
   * Tries reading the next tokens as a `[DAY (precision)?|HOUR (precision)?|MINUTE (precision)?|SECOND (precision(, fractional_seconds)?))?]` expression.
   * @returns {IntervalLeadingTypeRestrictionExpressionSyntaxNode?}
   */
  #readAsDSIntervalLeadingTypeRestrictionExpression(field) {
    switch (field.value) {
      case 'DAY':
      case 'HOUR':
      case 'MINUTE':
        return new IntervalLeadingTypeRestrictionExpressionSyntaxNode(field, this.#tryReadNextAsPrecisionTypeRestriction())
      case 'SECOND':
      default: // likely malformed
        return new IntervalLeadingTypeRestrictionExpressionSyntaxNode(field, this.#tryReadNextAsPrecisionAndScaleTypeRestriction()) // LATER: dedicated leading/fractional restriction
    }
  }

  /**
   * Tries reading the next tokens as a `TO [DAY|HOUR|MINUTE|SECOND (precision)?]` expression.
   * @returns {IntervalTrailingTypeRestrictionExpressionSyntaxNode?}
   */
  #tryReadNextAsDSIntervalTrailingTypeRestrictionExpression() {
    let tokens = this.tryReadNextTokens('TO', ['DAY', 'HOUR', 'MINUTE', 'SECOND'])
    if (!tokens) {
      return null
    }

    const [toKeyword, field] = tokens
    switch (field.value) {
      case 'DAY':
      case 'HOUR':
      case 'MINUTE':
        return new IntervalTrailingTypeRestrictionExpressionSyntaxNode(toKeyword, field)
      case 'SECOND':
      default: // likely malformed
        return new IntervalTrailingTypeRestrictionExpressionSyntaxNode(toKeyword, field, this.#tryReadNextAsPrecisionTypeRestriction())
    }
  }

  /**
   * Tries reading the next tokens as a `[YEAR (precision)?|HOUR (precision)?|MINUTE (precision)?|SECOND (precision(, fractional_seconds)?))?]` expression.
   * @returns {IntervalLeadingTypeRestrictionExpressionSyntaxNode?}
   */
  #readAsYMIntervalLeadingTypeRestrictionExpression(field) {
    return new IntervalLeadingTypeRestrictionExpressionSyntaxNode(field, this.#tryReadNextAsPrecisionTypeRestriction())
  }

  /**
   * Tries reading the next tokens as a `TO [YEAR|MONTH]` expression.
   * @returns {IntervalTrailingTypeRestrictionExpressionSyntaxNode?}
   */
  #tryReadNextAsYMIntervalTrailingTypeRestrictionExpression() {
    let tokens = this.tryReadNextTokens('TO', ['YEAR', 'MONTH'])
    if (!tokens) {
      return null
    }
    const [toKeyword, field] = tokens
    return new IntervalTrailingTypeRestrictionExpressionSyntaxNode(toKeyword, field)
  }




  // ---------------

  /**
   * Reads starting with the given token as a timestamp literal expression.
   * ```text
   * TIMESTAMP <string> [(<length>)]? [WITH [LOCAL]? TIME ZONE]
   * ```
   * @param {TokenLike} keyword
   * @returns {ExpressionSyntaxNode}
   */
  #readAsTimestampLiteralExpression(keyword) {
    this.verify(Patterns.TIMESTAMP, keyword)

    const literal = this.#readNextAsStringLiteral()

    const precision = this.#tryReadNextAsPrecisionTypeRestriction()

    const withKeyword = this.tryReadNextToken('WITH')
    const timezoneSpecifier = withKeyword ? [
      withKeyword,
      this.tryReadNextToken('LOCAL'),
      ...this.readNextTokens('TIME', 'ZONE')
    ].filter(x => x) : null

    return new TimestampLiteralExpressionSyntaxNode(
      keyword,
      literal,
      precision,
      SyntaxNode.asSyntaxNode(timezoneSpecifier)
    )
  }

  // ---------------


  /**
   * Tries reading the next item as a single value expression.
   * @returns {AnyExpressionSyntaxNode?}
   */
  #tryReadNextAsSingleValueExpression() {
    const literal = this.#tryReadNextAsStringLiteral() ?? this.#tryReadNextAsNumberLiteral()
    if (literal) {
      return literal
    }

    const openParenToken = this.#tryReadNextAsOpenParenToken()
    if (openParenToken) {
      return new ParenthesizedExpressionSyntaxNode(openParenToken, this.#readNextAsValueExpression(), this.#readNextAsCloseParenToken())
    }

    const unaryOperator = this.tryReadNextToken(Patterns.UNARY_OPERATOR)
    if (unaryOperator) {
      // See if the next is a number literal; if it is, fold the two tokens together as a number.
      const number = this.tryReadNextToken(Patterns.NUMBER_LITERAL)
      console.assert(!number, `${unaryOperator.textSpan} number should have eaten this`)
      return number ? new LiteralSyntaxNode(unaryOperator, number) :

        // Some other value expression...
        new UnaryExpressionSyntaxNode(unaryOperator, this.#readNextAsValueExpression())
    }

    const token = this.tryReadNextToken(Patterns.ANY_IDENTIFIER)
    if (token) {
      switch (token.type) {
        case 'reserved':
        case 'keyword':
          switch (token.value) {
            // well-known literals
            case 'NULL':
            case 'TRUE':
            case 'FALSE':
              return new ExpressionSyntaxNode(token)
            case 'INTERVAL':
              return this.#readAsIntervalLiteralExpression(token)
            case 'TIMESTAMP':
              return this.#readAsTimestampLiteralExpression(token)
            case 'DATE':
              return new DateLiteralExpressionSyntaxNode(
                keyword,
                this.#readNextAsStringLiteral()
              )

            case 'NEW':
              // new object constructor invocation
              return new ExpressionSyntaxNode(token, this.#tryReadNextAsInvocation())

            // Keywords representing function calls.
            case 'CURRENT_DATE':
            case 'CURRENT_TIMESTAMP':
            case 'HEXTORAW':
            case 'LOCALTIMESTAMP':
            case 'RAWTOHEX':
            case 'SYSDATE':
            case 'SYSTIMESTAMP':
            case 'SYS_GUID':
            case 'TO_CHAR':
            case 'TO_DATE':
            case 'TO_NUMBER':
              return this.#readAsInvocation(token)
            default:
              // Unsure if standalone identifier or invocation, try guessing
              return this.#readAsIdentifierOrInvocation(token)
          }

        case 'identifier':
          // Unsure if standalone identifier or invocation, try guessing
          return this.#readAsIdentifierOrInvocation(token)
      }
    }

    // This isn't part of an invocation from what we can tell...
    return null
  }

  /**
   * Reads the next item as a single value expression.
   * @returns {ExpressionSyntaxNode}
   */
  #readNextAsSingleValueExpression() {
    const result = this.#tryReadNextAsSingleValueExpression()
    if (!result) {
      throw this.syntaxError("Expected single value expression")
    }
    return result
  }

  // ---------------

  /**
   * Tries reading the next item as a value expression.
   * @returns {ExpressionSyntaxNode?}
   */
  #tryReadNextAsValueExpression() {
    const expression = this.#tryReadNextAsSingleValueExpression()
    if (!expression) {
      return null
    }

    // See if there is an operator
    const operator = SyntaxNode.asSyntaxNode(this.tryReadNextToken(Patterns.BINARY_OPERATOR))
    if (operator) {
      // Binary/ternary operator
      return new BinaryExpressionSyntaxNode(expression, operator, this.#readNextAsValueExpression())
    }

    return expression
  }

  /**
   * Reads the next item as a value expression.
   * @returns {ExpressionSyntaxNode}
   */
  #readNextAsValueExpression() {
    const expression = this.#readNextAsSingleValueExpression()
    // See if there is an operator
    const operator = this.tryReadNextToken(Patterns.BINARY_OPERATOR)
    if (operator) {
      // Binary/ternary operator
      return new BinaryExpressionSyntaxNode(expression, operator, this.#readNextAsValueExpression())
    }

    return expression
  }

  // ---------------

  /**
   * Tries reading the next item as a `RETURN` declaration.
   * @returns {ReturnDeclarationExpressionSyntaxNode?}
   */
  #tryReadNextAsReturnDeclaration() {
    const keyword = SyntaxNode.asSyntaxNode(this.tryReadNextToken(Patterns.RETURN))
    if (!keyword) {
      return null
    }

    return new ReturnDeclarationExpressionSyntaxNode(keyword, this.#readNextAsTypeExpression()) // yeah this means we eat `varchar2(x)` but who cares.
  }

  /**
   * Tries reading the next item as the `IN` parameter declaration mode keyword, along with additional parameter modifiers.
   * @returns {SyntaxNode?}
   */
  #tryReadNextAsInMode() {
    return SyntaxNode.asSyntaxNode(this.tryReadNextToken('IN'))
  }

  /**
   * Tries reading the next item as the `OUT` parameter declaration mode keyword, along with additional parameter modifiers.
   * @returns {SyntaxNode?}
   */
  #tryReadNextAsOutMode() {
    let outMode = this.tryReadNextToken('OUT')
    if (!outMode) {
      return null
    }

    const nocopy = this.tryReadNextToken('NOCOPY')
    return new SyntaxNode(outMode, nocopy)
  }

  /**
   * Tries reading the next item as the `DEFAULT` keyword or an assignment symbol (`:=`).
   * @returns {SyntaxNode?} A node of `:=`, `DEFAULT`, or null.
   */
  #tryReadNextAsAnyDefault() {
    return SyntaxNode.asSyntaxNode(this.tryReadNextToken(Patterns.ANY_DEFAULT))
  }

  /**
   * Tries reading the next item as a single parameter from a declaration.
   * @returns {DeclarationParameterExpressionSyntaxNode?}
   */
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

    return new DeclarationParameterExpressionSyntaxNode(name, mode, type, defaultExpression, defaultValue)
  }

  /**
   * Reads the next item as a single parameter from a declaration.
   * @returns {DeclarationParameterExpressionSyntaxNode?}
   */
  #readNextAsParameterDeclaration() {
    const param = this.#tryReadNextAsParameterDeclaration()
    if (param) {
      return param
    }
    throw this.syntaxError(`Expected: parameter`)
  }

  /**
   * Reads a sequence of zero or more parameters and separating commas from a declaration.
   * @returns {Generator<SyntaxNode>}
   * @yields {SyntaxNode}
   */
  * #readNextAsParameterDeclarationsWithCommas() {
    let param = this.#tryReadNextAsParameterDeclaration()
    if (!param) {
      return
    }

    yield param

    let comma
    while (param && (comma = this.#tryReadNextAsComma())) {
      yield comma
      yield param = this.#tryReadNextAsParameterDeclaration()
    }
  }

  /**
   * Tries reading the next item as a parameter list from a declaration.
   * @returns {DeclarationParameterExpressionSyntaxNode?}
   */
  #tryReadNextAsParameterListDeclaration() {
    const openParenToken = this.#tryReadNextAsOpenParenToken()
    if (!openParenToken) {
      return null
    }

    return new DeclarationParameterListExpressionSyntaxNode(
      openParenToken,
      [...this.#readNextAsParameterDeclarationsWithCommas()],
      this.#readNextAsCloseParenToken()
    )
  }

  /**
   * Reads the next item as a parameter list from a declaration.
   * @returns {DeclarationParameterExpressionSyntaxNode}
   */
  #readNextAsParameterListDeclaration() {
    return new DeclarationParameterListExpressionSyntaxNode(
      this.#readNextAsOpenParenToken(),
      [...this.#readNextAsParameterDeclarationsWithCommas()],
      this.#readNextAsCloseParenToken()
    )
  }

  /**
   * Reads starting with the given token as a preprocessor directive.
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

  // -----------------------------------
  // SQL*Plus expressions and statements
  // -----------------------------------

  /**
   * Reads starting with the given token as an opaque SQL*Plus command, up to the end of line.
   * @param {[key: string]: SyntaxNode} params Named nodes, if any
   * @returns {SqlPlusStatementSyntaxNode}
   */
  #readAsSqlPlusCommandStatement(token) {
    return new SqlPlusStatementSyntaxNode(token, ...this.#readThroughEndOfLine())
  }

  /**
   * Reads starting with the given token as a SQL*Plus script invocation, up to the end of line.
   * @param {TokenLike} token
   * @returns {SqlPlusStatementSyntaxNode}
   */
  #readAsSqlPlusScriptStatement(token) {
    return new SqlPlusStatementSyntaxNode(token, ...this.#readThroughEndOfLine())
  }

  // -----------------------------------
  // Main reader
  // -----------------------------------

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
            case 'ALTER':
            case 'DROP':
            case 'GRANT':
              return this.#readAsOpaqueSqlStatement(token)
          }
          break;

        case 'keyword':
          switch (token.value) {
            case 'SHOW':
            case 'EXEC':
              // SQL*Plus command SHOW (e.g., ERRORS)
              return this.#readAsSqlPlusCommandStatement(token)
            case 'CALL':
              // CALL SQL command
              return this.#readNextAsOpaqueSqlStatement(token, this.#tryReadNextAsInvocation())
            default:
              console.assert(false, `${token.textSpan} unexpected keyword`, token.value)
              return this.#readAsOpaqueSqlStatement(token)
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

      // Fallthrough logic, read as an opaque SQL statement.
      console.assert(false, `${token.textSpan} unrecognized token`, token)
      return this.#readAsOpaqueSqlStatement(token)
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
  /** @type {Token?} The terminating semicolon */ semicolonToken

  /**
   * @param {...SyntaxNodeOrTokenLike} params
   */
  constructor(...params) {
    super(...params)
    this.name = this.children.find(c => c instanceof IdentifierSyntaxNode)
    this.memberKind = this.kind.replace(/DeclarationStatement$/, '')
    if (this.lastNontrivialToken.value === ';') {
      this.semicolonToken = this.lastNontrivialToken
    }

    this.assertTokenContinuity()
    this.assertChildrenContinuity()
  }
}
exports.DeclarationStatementSyntaxNode = DeclarationStatementSyntaxNode

/**
 * @abstract
 * Represents a member declaration.
 *
 * Temporary placeholder because I have this confusing distinction.
 */
class DeclarationExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {IdentifierSyntaxNode} The name of the declaration. */ name
  /** @type {string} The friendly name of the kind of member (e.g., `Procedure`). */ memberKind
  /** @type {Annotation[]} Annotations for this statement. */ annotations = []

  /**
   * @param {...SyntaxNodeOrToken} params
   */
  constructor(...params) {
    super(...params)
    this.name = this.children.find(c => c instanceof IdentifierSyntaxNode)
    this.memberKind = this.kind.replace(/DeclarationExpression$/, '')
  }
}
exports.DeclarationExpressionSyntaxNode = DeclarationExpressionSyntaxNode

/**
 * @typedef {DeclarationStatementSyntaxNode | DeclarationExpressionSyntaxNode} DeclarationSyntaxNode
 * @exports DeclarationSyntaxNode
 */


/**
 * Top-level SQL statement.
 */
class SqlStatementSyntaxNode extends DeclarationStatementSyntaxNode {
  /** @type {Token?} The optional terminating slash (`/`). */ slashToken

  /**
   * @param  {...SyntaxNodeOrTokenLike} params
   */
  constructor(...params) {
    super(params)

    // Ensure that, if we have a trailing slash, that we assign the terminators.
    // (Superclass handles the case where a semicolon is the final token.)
    if (this.lastNontrivialToken.value === '/') {
      // found a trailing slash.  Consume it and try associating the terminating semicolon if the previous nontrivial token is a semicolon.
      console.assert(this.tokens.at(-1) === this.lastNontrivialToken, 'not the last nontrivial')
      this.slashToken = this.lastNontrivialToken
      if (this.tokens.length >= 2) {
        const maybeSemicolonToken  = this.tokens.at(-2)
        if (maybeSemicolonToken.value === ';') {
          this.semicolonToken = maybeSemicolonToken
        }
      }
    }
  }
}
exports.SqlStatementSyntaxNode = SqlStatementSyntaxNode

/**
 * The part of the PL/SQL unit before the `IS/AS/UNDER` keyword.
 * @example `CREATE OR REPLACE PACKAGE FOO AUTHID CURRENT_USER
 * @see CreatePlsqlUnitStatementSyntaxNode
 */
class CreatePlsqlUnitHeaderExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {UnitTypeSyntaxNode} The unit type (e.g., `PACKAGE`, `TYPE BODY`). */ unitType
  /** @type {IdentifierSyntaxNode} The name of the unit. */ name

  /**
   * @param {SyntaxNode} create
   * @param {SyntaxNode?} editionable
   * @param {UnitTypeSyntaxNode} unitType
   * @param {SyntaxNode?} ifNotExists
   * @param {IdentifierSyntaxNode} name
   * @param {...any} params Additional header members
   */
  constructor(create, editionable, unitType, ifNotExists, name, ...params) {
    super(create, editionable, unitType, ifNotExists, name, ...params)
    this.unitType = unitType
    this.name = name
  }
}

/**
 * `CREATE` PL/SQL unit statement.
 */
class CreatePlsqlUnitStatementSyntaxNode extends SqlStatementSyntaxNode {
  /** @property {CreatePlsqlUnitHeaderExpressionSyntaxNode} */ header

  /**
   * @param {CreatePlsqlUnitHeaderExpressionSyntaxNode} header
   * @param {...SyntaxNodeOrTokenLike} params
   */
  constructor(header, ...params) {
    super(header, ...params)
    this.header = header
    this.name = header.name
  }

  /** @type {UnitTypeSyntaxNode} The unit type (e.g., `PACKAGE`, `TYPE BODY`). */
  get unitType() {
    return this.header.unitType
  }

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
    const siblingPragmas = declarations.filter(d => d instanceof PragmaDeclarationStatementSyntaxNode && d.searchHints.indexOf('siblings') >= 0)

    /** @type {PragmaDeclarationStatementSyntaxNode[]} 'next' pragmas encountered, to be consumed as we encounter them */
    let nextPragmas = []

    /**
     *
     * @param {number} index
     * @returns
     */
    const pragmaIsMatch = (pragma, index) => {
      for (const searchHint of pragma.searchHints) {
        switch (searchHint) {
          case 'parent':
            if (pragma.tryAnnotate(this)) {
              // Pragma applies to this object.
              return true
            }
            break

          case 'previous':
            // Search backward to find our target
            for (let i = index - 1; i >= 0; i--) {
              if (pragma.tryAnnotate(declarations[i])) {
                return true;
              }
            }
            break
          case 'next':

            // Applies to upcoming member.
            nextPragmas.push(pragma)
            return true
          case 'siblings':
            // We already grabbed these, just ignore them here.
            return true
          default:
            console.warnOnce(searchHint, 'Unimplemented pragma search hint', pragma)
            break
        }
      }

      // Pragma did not match anything.
      return false
    }

    declarations.forEach((declaration, index) => {
      // We need to know if this is a pragma or not.
      const pragma = declaration instanceof PragmaDeclarationStatementSyntaxNode ? declaration : null
      if (pragma) {
        if (!pragmaIsMatch(pragma, index)) {
          console.warn(`${pragma.textSpan} failed to match anything`, pragma, this)
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
    })

    // At this point we should have no "next" pragmas remaining. (Siblings are OK because they're explicitly named.)
    if (nextPragmas.length) {
      console.warn(`${nextPragmas[0].textSpan} ${this}: Unmatched pragmas`, ...nextPragmas)
    }
  }
}
exports.CreatePlsqlUnitStatementSyntaxNode = CreatePlsqlUnitStatementSyntaxNode

// -----------------

class CreatePackageHeaderExpressionSyntaxNode extends CreatePlsqlUnitHeaderExpressionSyntaxNode {
  /**
   * @param {SyntaxNode} create
   * @param {SyntaxNode?} editionable
   * @param {UnitTypeSyntaxNode} unitType
   * @param {SyntaxNode?} ifNotExists
   * @param {IdentifierSyntaxNode} name
   * @param {SyntaxNode[]} unitModifiers
   */
  constructor(create, editionable, unitType, ifNotExists, name, unitModifiers) {
    super(create, editionable, unitType, ifNotExists, name, unitModifiers)
  }
}

/**
 * `CREATE [OR REPLACE] PACKAGE` spec.
 */
class CreatePackageStatementSyntaxNode extends CreatePlsqlUnitStatementSyntaxNode {
  /** @type {TokenLike} The `IS` or `AS` keyword. */ isOrAsKeyword
  /** @type {DocumentCommentSyntaxNode?} */ docComment
  /** @type {SyntaxNode[]} */ content
  /** @type {DeclarationSyntaxNode[]} */ members

  /**
   * @param {CreatePackageHeaderExpressionSyntaxNode} header
   * @param {TokenLike} isOrAsKeyword The `IS` or `AS` keyword.
   * @param {DocumentCommentSyntaxNode?} docComment
   * @param {SyntaxNode[]} content
   * @param {TokenLike?} semicolonToken The terminating semicolon (`;`), if any.
   * @param {TokenLike?} slashToken The terminating slash (`/`), if any.
   */
  constructor(header, isOrAsKeyword, docComment, content, semicolonToken, slashToken) {
    mustBeInstanceOf(header, CreatePackageHeaderExpressionSyntaxNode, 'header')
    mustBeTokenLike(isOrAsKeyword, 'isOrAsKeyword')
    if (docComment) mustBeInstanceOf(docComment, DocumentCommentSyntaxNode, 'docComment')
    mustBeArray(content, 'content')
    content.forEach((m, i) => mustBeInstanceOf(m, SyntaxNode, `content[${i}]`))
    if (semicolonToken) mustBeTokenLike(semicolonToken, 'semicolonToken')
    if (slashToken) mustBeTokenLike(slashToken, 'slashToken')

    super(header, isOrAsKeyword, docComment, content, semicolonToken, slashToken)

    this.isOrAsKeyword = this.resolveToken(isOrAsKeyword)
    this.docComment = docComment
    this.content = content

    this.members = this.content.filter(x => x instanceof DeclarationStatementSyntaxNode || x instanceof DeclarationExpressionSyntaxNode)
    this.processPragmas(this.members)
  }
}

// -----------------

class CreateTypeHeaderExpressionSyntaxNode extends CreatePlsqlUnitHeaderExpressionSyntaxNode {
  /**
   * @param {SyntaxNode} create
   * @param {SyntaxNode?} editionable
   * @param {UnitTypeSyntaxNode} unitType
   * @param {SyntaxNode} name
   * @param {SyntaxNode} force
   * @param {SyntaxNode} oid
   * @param {SyntaxNode[]} unitModifiers
   */
  constructor(create, editionable, unitType, ifNotExists, name, force, oid, unitModifiers) {
    super(create, editionable, unitType, ifNotExists, name, force, oid, unitModifiers)
  }
}

/**
 * `CREATE TYPE`
 */
class CreateTypeStatementSyntaxNode extends CreatePlsqlUnitStatementSyntaxNode {
  /** @type {SyntaxNode[]} */ typeModifiers
}
exports.CreateTypeStatementSyntaxNode = CreateTypeStatementSyntaxNode

/** @abstract */
class CreateObjectTypeStatementSyntaxNode extends CreateTypeStatementSyntaxNode {
  /** @type {IdentifierSyntaxNode?} The base type (null means there is no base type) */ baseType
  /** @type {ObjectMemberListDeclarationExpressionSyntaxNode} */ #memberList

  /**
   * @param {CreateTypeHeaderExpressionSyntaxNode} header
   * @param {SyntaxNode} isOrUnderKeyword `IS`, `AS`, or `UNDER`
   * @param {TokenLike | IdentifierSyntaxNode} keywordOrBaseType
   * @param {ObjectMemberListDeclarationExpressionSyntaxNode} memberList
   * @param {SyntaxNode[]} typeModifiers
   * @param {TokenLike?} semicolonToken The terminating semicolon (`;`), if any.
   * @param {TokenLike?} slashToken The terminating slash (`/`), if any.
   */
  constructor(header, isOrUnderKeyword, keywordOrBaseType, memberList, typeModifiers, semicolonToken, slashToken) {
    mustBeInstanceOf(header, CreateTypeHeaderExpressionSyntaxNode, 'header')
    mustBeTokenLike(isOrUnderKeyword, 'isOrUnderKeyword')
    mustBeObject(keywordOrBaseType, 'keywordOrBaseType')
    mustBeInstanceOf(memberList, ObjectMemberListDeclarationExpressionSyntaxNode, 'memberList')
    mustBeArray(typeModifiers, 'typeModifiers')
    typeModifiers.forEach((m, i) => mustBeInstanceOf(m, SyntaxNode, `typeModifiers[${i}]`))
    if (semicolonToken) mustBeTokenLike(semicolonToken, 'semicolonToken')
    if (slashToken) mustBeTokenLike(slashToken, 'slashToken')

    super(header, isOrUnderKeyword, keywordOrBaseType, memberList, typeModifiers, semicolonToken, slashToken)

    this.baseType = keywordOrBaseType instanceof IdentifierSyntaxNode ? keywordOrBaseType : null
    this.#memberList = memberList
    this.typeModifiers = typeModifiers

    // Doc comment comes from members
    this.docComment = memberList.docComment

    this.processPragmas(this.members)

    // SPECIAL: set the return type for constructors to our type.
    for (const constructor of this.constructors) {
      constructor.returnClause.type ??= this.name
    }

    console.assert(semicolonToken ? this.semicolonToken?.start === semicolonToken.start : !this.semicolonToken, 'oops;')
    console.assert(slashToken ? this.slashToken?.start === slashToken.start : !this.slashToken, 'oops/')
  }

  /** @type {ConstructorDeclarationStatementSyntaxNode[]} */
  get constructors() {
    return this.methods.filter(m => m instanceof ConstructorDeclarationStatementSyntaxNode)
  }

  get members() { return this.#memberList.members }
  get attributes() { return this.#memberList.attributes }
  get methods() { return this.#memberList.methods }
}
exports.CreateObjectTypeStatementSyntaxNode = CreateObjectTypeStatementSyntaxNode

/**
 * SQL statement for a base object type.
 */
class CreateBaseObjectTypeStatementSyntaxNode extends CreateObjectTypeStatementSyntaxNode {
  /** @type {Token} `IS` or `AS` */ isOrAsKeyword
  /** @type {Token} `OBJECT` */ objectKeyword

  /**
   * @param {CreateTypeHeaderExpressionSyntaxNode} header
   * @param {SyntaxNode} isOrAsKeyword
   * @param {SyntaxNode} objectKeyword
   * @param {ObjectMemberListDeclarationExpressionSyntaxNode} memberList
   * @param {SyntaxNode[]} typeModifiers
   * @param {TokenLike?} semicolonToken The terminating semicolon (`;`), if any.
   * @param {TokenLike?} slashToken The terminating slash (`/`), if any.
   */
  constructor(header, isOrAsKeyword, objectKeyword, memberList, typeModifiers, semicolonToken, slashToken) {
    mustBeInstanceOf(header, CreateTypeHeaderExpressionSyntaxNode, 'header')
    mustBeTokenLike(isOrAsKeyword, 'isOrAsKeyword')
    mustBeTokenLike(objectKeyword, 'objectKeyword')
    mustBeInstanceOf(memberList, ObjectMemberListDeclarationExpressionSyntaxNode, 'memberList')
    mustBeArray(typeModifiers, 'typeModifiers')
    typeModifiers.forEach((m, i) => mustBeInstanceOf(m, SyntaxNode, `typeModifiers[${i}]`))
    if (semicolonToken) mustBeTokenLike(semicolonToken, 'semicolonToken')
    if (slashToken) mustBeTokenLike(slashToken, 'slashToken')

    super(header, isOrAsKeyword, objectKeyword, memberList, typeModifiers, semicolonToken, slashToken)

    this.isOrAsKeyword = this.resolveToken(isOrAsKeyword)
    this.objectKeyword = this.resolveToken(objectKeyword)
  }
}

/**
 * SQL statement for an inherited object type.
 */
class CreateInheritedObjectTypeStatementSyntaxNode extends CreateObjectTypeStatementSyntaxNode {
  /** @type {Token} `UNDER` */ underKeyword

  /**
   * @param {CreateTypeHeaderExpressionSyntaxNode} header
   * @param {SyntaxNode} underKeyword `UNDER` keyword (as opposed to `IS`)
   * @param {IdentifierSyntaxNode} baseType
   * @param {ObjectMemberListDeclarationExpressionSyntaxNode} memberList
   * @param {SyntaxNode[]} typeModifiers
   * @param {TokenLike?} semicolonToken The terminating semicolon (`;`), if any.
   * @param {TokenLike?} slashToken The terminating slash (`/`), if any.
   */
  constructor(header, underKeyword, baseType, memberList, typeModifiers, semicolonToken, slashToken) {
    mustBeInstanceOf(header, CreateTypeHeaderExpressionSyntaxNode, 'header')
    mustBeTokenLike(underKeyword, 'underKeyword')
    mustBeInstanceOf(baseType, IdentifierSyntaxNode, 'baseType')
    mustBeInstanceOf(memberList, ObjectMemberListDeclarationExpressionSyntaxNode, 'memberList')
    mustBeArray(typeModifiers, 'typeModifiers')
    typeModifiers.forEach((m, i) => mustBeInstanceOf(m, SyntaxNode, `typeModifiers[${i}]`))
    if (semicolonToken) mustBeTokenLike(semicolonToken, 'semicolonToken')
    if (slashToken) mustBeTokenLike(slashToken, 'slashToken')

    super(header, underKeyword, baseType, memberList, typeModifiers, semicolonToken, slashToken)

    this.underKeyword = this.resolveToken(underKeyword)
  }
}

class CreateNestedTableTypeStatementSyntaxNode extends CreateTypeStatementSyntaxNode {
  /** @type {Token} `IS` or `AS` */ isOrAsKeyword
  /** @type {TypeExpressionSyntaxNode} The base type on which this is derived. */ baseType

  /**
   * @param {CreateTypeHeaderExpressionSyntaxNode} header
   * @param {TokenLike} isOrAsKeyword
   * @param {DocumentCommentSyntaxNode?} docComment
   * @param {TypeExpressionSyntaxNode} baseType
   * @param {SyntaxNode[]} typeModifiers
   * @param {TokenLike?} semicolonToken The terminating semicolon (`;`), if any.
   * @param {TokenLike?} slashToken The terminating slash (`/`), if any.
   */
  constructor(header, isOrAsKeyword, docComment, baseType, typeModifiers, semicolonToken, slashToken) {
    mustBeInstanceOf(header, CreateTypeHeaderExpressionSyntaxNode, 'header')
    mustBeTokenLike(isOrAsKeyword, 'isOrAsKeyword')
    if (docComment) mustBeInstanceOf(docComment, DocumentCommentSyntaxNode, 'docComment')
    mustBeInstanceOf(baseType, TypeExpressionSyntaxNode, 'baseType')
    if (semicolonToken) mustBeTokenLike(semicolonToken, 'semicolonToken')
    if (slashToken) mustBeTokenLike(slashToken, 'slashToken')

    super(header, isOrAsKeyword, docComment, baseType, typeModifiers, semicolonToken, slashToken)

    this.isOrAsKeyword = this.resolveToken(isOrAsKeyword)
    this.docComment = docComment
    this.baseType = baseType
    this.typeModifiers = typeModifiers

    console.assert(semicolonToken ? this.semicolonToken?.start === semicolonToken.start : !this.semicolonToken, 'oops;')
    console.assert(slashToken ? this.slashToken?.start === slashToken.start : !this.slashToken, 'oops/')
  }
}
exports.CreateNestedTableTypeStatementSyntaxNode = CreateNestedTableTypeStatementSyntaxNode

// -----------------------------------
// PL/SQL block unit common
// -----------------------------------

class ExceptionDeclarationStatementSyntaxNode extends DeclarationStatementSyntaxNode {
  /** @type {Token} */ exceptionKeyword

  /**
   * @param {IdentifierSyntaxNode} name
   * @param {TokenLike} exceptionKeyword
   * @param {SyntaxNode} semicolonToken
   */
  constructor(name, exceptionKeyword, semicolonToken) {
    super(name, exceptionKeyword, semicolonToken)
    this.exceptionKeyword = this.resolveToken(exceptionKeyword)

    console.assert(this.name === name)
    console.assert(semicolonToken ? this.semicolonToken?.start === semicolonToken.start : !this.semicolonToken, 'oops;')
  }
}
exports.ExceptionDeclarationStatementSyntaxNode = ExceptionDeclarationStatementSyntaxNode


class VariableDeclarationStatementSyntaxNode extends DeclarationStatementSyntaxNode {
  /** @type {SyntaxNode} */ constant
  /** @type {SyntaxNode} */ type
  /** @type {SyntaxNode?} The `default` keyword or symbol (`:=`) */ defaultExpression
  /** @type {SyntaxNode?} */ defaultValue

  /**
   * @param {IdentifierSyntaxNode} name
   * @param {SyntaxNode} constant
   * @param {SyntaxNode} type
   * @param {SyntaxNode?} defaultExpression The `default` keyword or symbol (`:=`)
   * @param {SyntaxNode?} defaultValue
   * @param {TokenLike} semicolonToken
   */
  constructor(name, constant, type, defaultExpression, defaultValue, semicolonToken) {
    super(name, constant, type, defaultExpression, defaultValue, semicolonToken)

    this.constant = constant
    this.type = type
    this.defaultExpression = defaultExpression
    this.defaultValue = defaultValue

    console.assert(this.name === name)
    console.assert(semicolonToken ? this.semicolonToken?.start === semicolonToken.start : !this.semicolonToken, 'oops;')
  }

  get isConstant() {
    return !!this.constant
  }
}
exports.VariableDeclarationStatementSyntaxNode = VariableDeclarationStatementSyntaxNode

/**
 * Base class for all `TYPE` and `SUBTYPE` declaration statements.
 */
class TypeDeclarationStatementSyntaxNodeBase extends DeclarationStatementSyntaxNode {
  /** @type {TokenLike} The `IS` keyword.*/ isKeyword

  /**
   * @param {TokenLike} typeOrSubtypeKeyword The initial keyword (typically `TYPE` or `SUBTYPE`).
   * @param {IdentifierSyntaxNode} name The identifier.
   * @param {TokenLike} isKeyword The `IS` keyword.
   * @param {...SyntaxNodeOrToken} params
   */
  constructor(typeOrSubtypeKeyword, name, isKeyword, ...params) {
    mustBeTokenLike(typeOrSubtypeKeyword, 'typeOrSubtypeKeyword')
    mustBeInstanceOf(name, IdentifierSyntaxNode, 'name')
    mustBeTokenLike(isKeyword, 'isKeyword')
    mustBeArray(params, 'params')

    super(typeOrSubtypeKeyword, name, isKeyword, ...params)

    this.isKeyword = this.resolveToken(isKeyword)

    console.assert(this.name === name, 'name is good')
  }

}
/**
 * `SUBTYPE` declaration.
 */
class SubtypeDeclarationStatementSyntaxNode extends TypeDeclarationStatementSyntaxNodeBase {
  /** @type {Token} The `SUBTYPE` keyword. */ subtypeKeyword
  /** @type {TypeExpressionSyntaxNode} */ baseType

  /**
   * @param {TokenLike} subtypeKeyword The `SUBTYPE` keyword.
   * @param {IdentifierSyntaxNode} name The identifier.
   * @param {TokenLike} isKeyword The `IS` keyword.
   * @param {TypeExpressionSyntaxNode} baseType
   * @param {TokenLike?} semicolonToken
   */
  constructor(subtypeKeyword, name, isKeyword, baseType, semicolonToken) {
    mustBeTokenLike(subtypeKeyword, 'subtypeKeyword')
    mustBeInstanceOf(name, IdentifierSyntaxNode, 'name')
    mustBeTokenLike(isKeyword, 'isKeyword')
    mustBeInstanceOf(baseType, TypeExpressionSyntaxNode, 'baseType')
    if (semicolonToken) mustBeTokenLike(semicolonToken, 'semicolonToken')

    super(subtypeKeyword, name, isKeyword, baseType, semicolonToken)

    this.subtypeKeyword = this.resolveToken(subtypeKeyword)
    this.baseType = baseType

    console.assert(semicolonToken ? this.semicolonToken?.start === semicolonToken.start : !this.semicolonToken, 'oops;')
  }
}
exports.SubtypeDeclarationStatementSyntaxNode = SubtypeDeclarationStatementSyntaxNode

/**
 * `TYPE <identifier> IS RECORD [...]` declaration.
 */
class RecordTypeDeclarationStatementSyntaxNode extends TypeDeclarationStatementSyntaxNodeBase {
  /** @type {TokenLike} The `TYPE` keyword.*/ typeKeyword
  /** @type {TokenLike} The `RECORD` keyword.*/ recordKeyword
  /** @type {DeclarationParameterListExpressionSyntaxNode} */ #fieldList

  /**
   * @param {SyntaxNode} typeKeyword The `TYPE` keyword.
   * @param {IdentifierSyntaxNode} name The identifier.
   * @param {SyntaxNode} isKeyword The `IS` keyword.
   * @param {SyntaxNode} recordKeyword The `RECORD` keyword.
   * @param {DeclarationParameterListExpressionSyntaxNode} fieldList The field collection (with punctuation).
   * @param {TokenLike} semicolonToken
   * @param {...SyntaxNodeOrToken} params
   */
  constructor(typeKeyword, name, isKeyword, recordKeyword, fieldList, semicolonToken) {
    mustBeTokenLike(typeKeyword, 'typeKeyword')
    mustBeInstanceOf(name, IdentifierSyntaxNode, 'name')
    mustBeTokenLike(isKeyword, 'isKeyword')
    mustBeTokenLike(recordKeyword, 'recordKeyword')
    mustBeInstanceOf(fieldList, DeclarationParameterListExpressionSyntaxNode, 'fieldList')
    if (semicolonToken) mustBeTokenLike(semicolonToken, 'semicolonToken')

    super(typeKeyword, name, isKeyword, recordKeyword, fieldList, semicolonToken)

    this.#fieldList = fieldList

    this.typeKeyword = this.resolveToken(typeKeyword)
    this.recordKeyword = this.resolveToken(recordKeyword)

    console.assert(this.typeKeyword && this.name && this.isKeyword && this.recordKeyword && this.#fieldList, 'type x is record?')
    console.assert(semicolonToken ? this.semicolonToken?.start === semicolonToken.start : !this.semicolonToken, 'oops;')
  }

  get openParenToken() {
    return this.#fieldList.openParenToken
  }
  get closeParenToken() {
    return this.#fieldList.closeParenToken
  }
  get fields() {
    return this.#fieldList.parameters
  }
}
exports.RecordTypeDeclarationStatementSyntaxNode = RecordTypeDeclarationStatementSyntaxNode

/**
 * `TYPE <identifier> IS <other>` declaration.
 */
class TypeDeclarationStatementSyntaxNode extends TypeDeclarationStatementSyntaxNodeBase {
  /** @type {Token} The `TYPE` keyword. */ typeKeyword
  /** @type {TypeExpressionSyntaxNode} */ baseType

  /**
   * @param {TokenLike} typeKeyword The `TYPE` keyword.
   * @param {IdentifierSyntaxNode} name The identifier.
   * @param {TokenLike} isKeyword The `IS` keyword.
   * @param {TypeExpressionSyntaxNode} baseType
   * @param {TokenLike} semicolonToken
   */
  constructor(typeKeyword, name, isKeyword, baseType, semicolonToken) {
    mustBeTokenLike(typeKeyword, 'typeKeyword')
    mustBeInstanceOf(name, IdentifierSyntaxNode, 'name')
    mustBeTokenLike(isKeyword, 'isKeyword')
    mustBeInstanceOf(baseType, TypeExpressionSyntaxNode, 'baseType')
    if (semicolonToken) mustBeTokenLike(semicolonToken, 'semicolonToken')

    super(typeKeyword, name, isKeyword, baseType, semicolonToken)

    this.typeKeyword = this.resolveToken(typeKeyword)
    this.baseType = baseType

    console.assert(this.typeKeyword && this.name && this.isKeyword && this.baseType, 'type x is y?')
    console.assert(semicolonToken ? this.semicolonToken?.start === semicolonToken.start : !this.semicolonToken, 'oops;')
  }
}
exports.TypeDeclarationStatementSyntaxNode = TypeDeclarationStatementSyntaxNode

/**
 * Base class of any method declaration.
 * @see ConstructorDeclarationStatementSyntaxNode
 * @see FunctionDeclarationStatementSyntaxNode
 * @see ObjectMethodDeclarationStatementSyntaxNodeBase
 * @see ObjectMethodDeclarationStatementSyntaxNode
 * @see ProcedureDeclarationStatementSyntaxNode
 */
class MethodDeclarationStatementSyntaxNodeBase extends DeclarationStatementSyntaxNode {
  /** @type {Token} The method keyword (either `PROCEDURE` or `FUNCTION`) */ methodKeyword
  /** @type {string} A unique ID for this procedure within context. */ id
  /** @type {DeclarationParameterListExpressionSyntaxNode?} */ parameterList
  /** @type {SyntaxNode[]} Various clauses applying to this method (e.g., invoker_rights_clause, deterministic_clause). */ unitModifiers

  get parameters() { return this.parameterList?.parameters ?? [] }
  get openParenToken() { return this.parameterList?.openParenToken }
  get closeParenToken() { return this.parameterList?.closeParenToken }
}
exports.MethodDeclarationStatementSyntaxNodeBase = MethodDeclarationStatementSyntaxNodeBase

/**
 * Represents a PL/SQL function within the context of a declaration block (including PL/SQL package specs).
 */
class FunctionDeclarationStatementSyntaxNode extends MethodDeclarationStatementSyntaxNodeBase {
  /** @type {ReturnDeclarationExpressionSyntaxNode} */ returnClause

  /**
   * @param {TokenLike} methodKeyword `FUNCTION`
   * @param {IdentifierSyntaxNode} name
   * @param {DeclarationParameterListExpressionSyntaxNode?} parameterList
   * @param {ReturnDeclarationExpressionSyntaxNode} returnClause
   * @param {SyntaxNode[]} unitModifiers
   * @param {ExpressionSyntaxNode?} body An optional body.
   * @param {TokenLike?} semicolonToken The terminating semicolon (`;`), if any.
   */
  constructor(methodKeyword, name, parameterList, returnClause, unitModifiers, body, semicolonToken) {
    super(methodKeyword, name, parameterList, returnClause, unitModifiers, body, semicolonToken)
    // Must resolve the canonical tokens.
    this.methodKeyword = this.resolveToken(methodKeyword)
    this.name = name
    this.parameterList = parameterList
    this.returnClause = returnClause
    this.unitModifiers = unitModifiers
    this.body = body

    console.assert(semicolonToken ? this.semicolonToken?.start === semicolonToken.start : !this.semicolonToken, 'oops;')
  }
}
exports.FunctionDeclarationStatementSyntaxNode = FunctionDeclarationStatementSyntaxNode

/**
 * Represents a PL/SQL procedure within the context of a declaration block (including PL/SQL package specs).
 */
class ProcedureDeclarationStatementSyntaxNode extends MethodDeclarationStatementSyntaxNodeBase {
  /**
   * @param {SyntaxNode} methodKeyword  The initial token (`PROCEDURE`)
   * @param {IdentifierSyntaxNode} name
   * @param {DeclarationParameterListExpressionSyntaxNode?} parameterList
   * @param {SyntaxNode[]} unitModifiers
   * @param {ExpressionSyntaxNode?} body An optional body.
   * @param {TokenLike?} semicolonToken The terminating semicolon (`;`), if any.
   */
  constructor(methodKeyword, name, parameterList, unitModifiers, body, semicolonToken) {
    super(methodKeyword, name, parameterList, unitModifiers, body, semicolonToken)
    // Must resolve the canonical tokens.
    this.methodKeyword = this.resolveToken(methodKeyword)
    this.name = name
    this.parameterList = parameterList
    this.unitModifiers = unitModifiers
    this.body = body

    console.assert(semicolonToken ? this.semicolonToken?.start === semicolonToken.start : !this.semicolonToken, 'oops;')
  }
}
exports.ProcedureDeclarationStatementSyntaxNode = ProcedureDeclarationStatementSyntaxNode


// -----------------------------------
// PL/SQL Object type unit
// -----------------------------------

/**
 * Base class of any object method declaration.
 * @see {ObjectMethodDeclarationStatementSyntaxNode}
 * @see {ConstructorDeclarationStatementSyntaxNode}
 */
class ObjectMethodDeclarationStatementSyntaxNodeBase extends MethodDeclarationStatementSyntaxNodeBase {
  /** @type {boolean} */ isStatic
}
exports.ObjectMethodDeclarationStatementSyntaxNodeBase = ObjectMethodDeclarationStatementSyntaxNodeBase

/**
 * @implements {ObjectMemberDeclarationExpressionSyntaxNode}
 */
class ObjectMethodDeclarationStatementSyntaxNode extends ObjectMethodDeclarationStatementSyntaxNodeBase {
  /** @override */
  memberKind = 'Method'

  /** @type {InheritanceFlagSyntaxNode[]} */ inheritance
  /** @type {Token} */ memberOrStaticToken
  /** @type {Token?} */ mapOrOrderToken
  /** @type {Token?} */ methodKeyword

  /**
   * @param {InheritanceFlagSyntaxNode[]} inheritance
   * @param {TokenLike} mapOrOrder
   * @param {TokenLike} memberOrStatic
   * @param {TokenLike} methodKeyword
   * @param {IdentifierSyntaxNode} name
   * @param {DeclarationParameterListExpressionSyntaxNode?} parameterList
   * @param {ReturnDeclarationExpressionSyntaxNode?} returnClause
   * @param {SyntaxNode[]} unitModifiers
   */
  constructor(inheritance, mapOrOrder, memberOrStatic, methodKeyword, name, parameterList, returnClause, unitModifiers) {
    super(inheritance, mapOrOrder, memberOrStatic, methodKeyword, name, parameterList, returnClause, unitModifiers)

    this.inheritance = inheritance
    // Must resolve the canonical tokens.
    this.mapOrOrderToken = this.resolveToken(mapOrOrder)
    this.memberOrStaticToken = this.resolveToken(memberOrStatic)
    this.methodKeyword = this.resolveToken(methodKeyword)
    this.name = name
    this.parameterList = parameterList
    this.returnClause = returnClause
    this.unitModifiers = unitModifiers

    this.isStatic = memberOrStatic.value === 'STATIC'
  }
}
exports.ObjectMethodDeclarationStatementSyntaxNode = ObjectMethodDeclarationStatementSyntaxNode

/**
 * Represents an object type constructor.
 */
class ConstructorDeclarationStatementSyntaxNode extends ObjectMethodDeclarationStatementSyntaxNodeBase {
  /**
   * @param {InheritanceFlagSyntaxNode[]} inheritance
   * @param {TokenLike} constructorKeyword `CONSTRUCTOR`
   * @param {TokenLike} methodKeyword `FUNCTION`
   * @param {IdentifierSyntaxNode} name
   * @param {DeclarationParameterListExpressionSyntaxNode?} parameterList
   * @param {ReturnDeclarationExpressionSyntaxNode?} returnClause
   * @param {SyntaxNode[]} unitModifiers
   */
  constructor(inheritance, constructorKeyword, methodKeyword, name, parameterList, returnClause, unitModifiers) {
    super(inheritance, constructorKeyword, methodKeyword, name, parameterList, returnClause, unitModifiers)
    this.constructorKeyword = this.resolveToken(constructorKeyword)
    this.methodKeyword = this.resolveToken(methodKeyword)
    this.name = name
    this.inheritance = inheritance
    this.parameterList = parameterList
    this.returnClause = returnClause
    this.unitModifiers = unitModifiers

    this.isStatic = false
  }
}
exports.ConstructorDeclarationStatementSyntaxNode = ConstructorDeclarationStatementSyntaxNode

// -------------------------------------

/**
 * Node representing the Oracle SQL or PL/SQL unit type.
 */
class UnitTypeSyntaxNode extends SyntaxNode {
  /** @type {string} The canonical name of the type; e.g., `SYNONYM`. */ name

  /**
   * @param {TokenLike | TokenLike[]} tokens
   * @param {object} params
   * @param {string?} params.name How Oracle refers to this.  Oracle has compound keywords like `PUBLIC SYNONYM` and `PACKAGE BODY`, but in those the primary ones are `SYNONYM` and `PACKAGE BODY` respectively.
   */
  constructor(tokens, { name } = {}) {
    super(...tokens)

    this.name = name?.toString() ?? tokens[0].value
  }
}

class DeclarationParameterExpressionSyntaxNode extends ExpressionSyntaxNode {

  /** @type {IdentifierSyntaxNode} */ name
  /** @type {ExpressionSyntaxNode?} */ mode
  /** @type {TypeExpressionSyntaxNode} */ type
  /** @type {SyntaxNode?} The `default` keyword or symbol (`:=`) */ defaultExpression
  /** @type {AnyExpressionSyntaxNode?} */ defaultValue

  /**
   * @param {IdentifierSyntaxNode} name
   * @param {ExpressionSyntaxNode?} mode
   * @param {TypeExpressionSyntaxNode} type
   * @param {SyntaxNode?} defaultExpression The `default` keyword or symbol (`:=`)
   * @param {AnyExpressionSyntaxNode?} defaultValue
   */
  constructor(name, mode, type, defaultExpression, defaultValue) {
    super(name, mode, type, defaultExpression, defaultValue)
    this.name = name
    this.mode = mode
    this.type = type
    this.defaultExpression = defaultExpression
    this.defaultValue = defaultValue
  }
}
exports.DeclarationParameterExpressionSyntaxNode = DeclarationParameterExpressionSyntaxNode

class DeclarationParameterListExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {DeclarationParameterExpressionSyntaxNode[]} */ parameters
  /** @type {Token} */ openParenToken
  /** @type {Token} */ closeParenToken

  /**
   *
   * @param {TokenLike} openParenToken
   * @param {(DeclarationParameterExpressionSyntaxNode | SyntaxNode)?[]} parametersWithCommas
   * @param {TokenLike} closeParenToken
   */
  constructor(openParenToken, parametersWithCommas, closeParenToken) {
    super(openParenToken, ...parametersWithCommas, closeParenToken)
    this.parameters = parametersWithCommas.filter(x => x instanceof DeclarationParameterExpressionSyntaxNode)

    // Must resolve the canonical tokens.
    this.openParenToken = this.resolveToken(openParenToken)
    this.closeParenToken = this.resolveToken(closeParenToken)
  }
}
exports.DeclarationParameterListExpressionSyntaxNode = DeclarationParameterListExpressionSyntaxNode

class ReturnDeclarationExpressionSyntaxNodeBase extends ExpressionSyntaxNode {

  /**
   *
   * @param {TokenLike | TokenLike[]} keyword
   * @param  {...SyntaxNodeOrTokenLike} params
   */
  constructor(keyword, ...params) {
    super(keyword, ...params)
  }

  /** @type {SyntaxNode} The keyword node. */
  get keyword() { return this.children[0] }
}
exports.ReturnDeclarationExpressionSyntaxNodeBase = ReturnDeclarationExpressionSyntaxNodeBase

class ReturnDeclarationExpressionSyntaxNode extends ReturnDeclarationExpressionSyntaxNodeBase {

  /**
   * @param {TokenLike} keyword The `RETURN` keyword.
   * @param {TypeExpressionSyntaxNode} type The return type.
   */
  constructor(keyword, type) {
    super(keyword, type)
  }

  /** @type {TypeExpressionSyntaxNode} The return type. */
  get type() {
    return this.children[1]
  }
}
exports.ReturnDeclarationExpressionSyntaxNode = ReturnDeclarationExpressionSyntaxNode

class ConstructorReturnDeclarationExpressionSyntaxNode extends ReturnDeclarationExpressionSyntaxNodeBase {

  /**
   * @param {...TokenLike} keywords
   */
  constructor(...keywords) {
    super(keywords)
  }
}
exports.ConstructorReturnDeclarationExpressionSyntaxNode = ConstructorReturnDeclarationExpressionSyntaxNode

// ---------

/**
 * Represents a single `ACCESSIBLE BY (...)` accessor declaration.
 * ```text
 * <unit-type>? <identifier>
 * ```
 */
class AccessorExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {UnitTypeSyntaxNode?} */ unitType
  /** @type {IdentifierSyntaxNode} */ name

  /**
   * @param {UnitTypeSyntaxNode?} unitType
   * @param {IdentifierSyntaxNode} name
   */
  constructor(unitType, name) {
    super(unitType, name)
    this.unitType = unitType
    this.name = name
  }
}
exports.AccessorExpressionSyntaxNode = AccessorExpressionSyntaxNode

/**
 * Represents the list portion of an `ACCESSIBLE BY (...)` clause.
 * ```text
 * ACCESSIBLE BY (<accessor>, ...)
 *               ^^^^^^^^^^^^^^^^^
 * ```
 */
class AccessorListExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {AccessorExpressionSyntaxNode[]} */ accessors
  /** @type {Token} */ openParenToken
  /** @type {Token} */ closeParenToken

  /**
   * @param {TokenLike} openParenToken
   * @param {SyntaxNode[]} accessorsWithCommas
   * @param {TokenLike} closeParenToken
   */
  constructor(openParenToken, accessorsWithCommas, closeParenToken) {
    super(openParenToken, ...accessorsWithCommas, closeParenToken)
    this.accessors = accessorsWithCommas.filter(x => x instanceof AccessorExpressionSyntaxNode)
    // Must resolve the canonical tokens.
    this.openParenToken = this.resolveToken(openParenToken)
    this.closeParenToken = this.resolveToken(closeParenToken)
  }
}
exports.AccessorListExpressionSyntaxNode = AccessorListExpressionSyntaxNode

/**
 * Represents a single `ACCESSIBLE BY (...)` accessor declaration.
 * ```text
 * ACCESSIBLE BY (<accessor>, ...)
 * ```
 * @see https://docs.oracle.com/en/database/oracle/oracle-database/21/lnpls/ACCESSIBLE-BY-clause.html#GUID-9720619C-9862-4123-96E7-3E85F240FF36
 */
class AccessibleByExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {SyntaxNode} */ accessibleBy
  /** @type {AccessorListExpressionSyntaxNode} */ accessors

  /**
   *
   * @param {SyntaxNode} accessibleBy
   * @param {AccessorListExpressionSyntaxNode} accessors
   * @param  {...SyntaxNodeOrTokenLike} params
   */
  constructor(accessibleBy, accessors, ...params) {
    super(accessibleBy, accessors, ...params)
    this.accessibleBy = accessibleBy
    this.accessors = accessors
  }
}

// ---------

class ObjectAttributeDeclarationExpressionSyntaxNode extends DeclarationExpressionSyntaxNode {

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
}
exports.ObjectAttributeDeclarationExpressionSyntaxNode = ObjectAttributeDeclarationExpressionSyntaxNode


/**
 * @typedef {ObjectMethodDeclarationStatementSyntaxNodeBase | ObjectAttributeDeclarationExpressionSyntaxNode} ObjectMemberDeclarationExpressionSyntaxNode
 * Interface for object members.
 */

class ObjectMemberListDeclarationExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {DocumentCommentSyntaxNode?} The type's doc comment */ docComment
  /** @type {ObjectAttributeDeclarationExpressionSyntaxNode[]} */ attributes
  /** @type {ObjectMethodDeclarationStatementSyntaxNodeBase[]} */ methods
  /** @type {Token} */ openParenToken
  /** @type {Token} */ closeParenToken

  /**
   * @param {TokenLike} openParenToken
   * @param {DocumentCommentSyntaxNode?} docComment
   * @param {SyntaxNode[]} membersWithCommas
   * @param {TokenLike} closeParenToken
   */
  constructor(openParenToken, docComment, membersWithCommas, closeParenToken) {
    super(openParenToken, docComment, ...membersWithCommas, closeParenToken)
    this.docComment = docComment
    this.attributes = membersWithCommas.filter(x => x instanceof ObjectAttributeDeclarationExpressionSyntaxNode)
    this.methods = membersWithCommas.filter(x => x instanceof ObjectMethodDeclarationStatementSyntaxNodeBase)
    console.assert(membersWithCommas.length === this.members.length + membersWithCommas.filter(x => x.toString('V') === ',').length, 'oops')
    // Must resolve the canonical tokens.
    this.openParenToken = this.resolveToken(openParenToken)
    this.closeParenToken = this.resolveToken(closeParenToken)
  }

  /** @type {ObjectMemberDeclarationExpressionSyntaxNode[]} */
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

  /** @type {Token} */ pragmaKeyword
  /** @type {IdentifierSyntaxNode} */ name
  /** @type {InvocationParameterListExpressionSyntaxNode?} */ #parameterList

  /**
   * @typedef {'parent' | 'previous' | 'next' | 'siblings'} SearchHint
   * @type {SearchHint[]}
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
  searchHints

  /**
   * @param {TokenLike} pragmaKeyword The `PRAGMA` keyword.
   * @param {IdentifierSyntaxNode} name The pragma name.
   * @param {InvocationParameterListExpressionSyntaxNode?} parameterList The parameters to the pragma, if any.
   * @param {TokenLike?} semicolonToken The terminating semicolon (`;`), if any.
   * @returns {PragmaDeclarationStatementSyntaxNode} the created node
   */
  static create(pragmaKeyword, name, parameterList, semicolonToken) {
    switch (name.value) {
      /** @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/AUTONOMOUS_TRANSACTION-pragma.html */
      case 'AUTONOMOUS_TRANSACTION':
        return new PragmaDeclarationStatementSyntaxNode(pragmaKeyword, name, parameterList, semicolonToken, PragmaDeclarationStatementSyntaxNode.#searchHintsByName[name.value])
      /** @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/COVERAGE-pragma.html */
      case 'COVERAGE':
        return new PragmaDeclarationStatementSyntaxNode(pragmaKeyword, name, parameterList, semicolonToken, PragmaDeclarationStatementSyntaxNode.#searchHintsByName[name.value])
      /**
       * Named, but applies to previous or parent declaration.
       * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/DEPRECATE-pragma.html
       */
      case 'DEPRECATE':
        return new DeprecatePragmaDeclarationStatementSyntaxNode(pragmaKeyword, name, parameterList, semicolonToken)
      case 'EXCEPTION_INIT':
        return new ExceptionInitPragmaDeclarationStatementSyntaxNode(pragmaKeyword, name, parameterList, semicolonToken)
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
        return new PragmaDeclarationStatementSyntaxNode(pragmaKeyword, name, parameterList, semicolonToken, PragmaDeclarationStatementSyntaxNode.#searchHintsByName[name.value])
      default:
        console.warn(`${pragmaKeyword.textSpan} Unknown pragma '${name}'`, ...arguments)
        return new PragmaDeclarationStatementSyntaxNode(pragmaKeyword, name, parameterList, semicolonToken, PragmaDeclarationStatementSyntaxNode.#searchHintsByName[name.value])
    }
  }

  /** @type {[key: string]: SearchHint[]} */
  static #searchHintsByName = {
    /** @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/AUTONOMOUS_TRANSACTION-pragma.html */
    'AUTONOMOUS_TRANSACTION': ['parent'],
    /** @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/COVERAGE-pragma.html */
    'COVERAGE': ['next'],
    // 'DEPRECATE': has its own class
    // 'EXCEPTION_INIT': has its own class
    /**
     * Applies to all overloads with the given name.
     * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/EXCEPTION_INIT-pragma.html
     */
    'INLINE': ['siblings'],
    /**
     * Nearest previous declaration.
     * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/RESTRICT_REFERENCES-pragma.html
     */
    'RESTRICT_REFERENCES': ['previous'],
    /** @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/SERIALLY_REUSABLE-pragma.html */
    'SERIALLY_REUSABLE': ['parent'],
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
   * @param {InvocationParameterListExpressionSyntaxNode} params.parameterList
   * @param {TokenLike} semicolonToken
   * @param {SearchHint[]} searchHints
   */
  constructor(pragmaKeyword, name, parameterList, semicolonToken, searchHints) {
    super(pragmaKeyword, name, parameterList, semicolonToken)
    this.pragmaKeyword = this.resolveToken(pragmaKeyword)
    this.name = name
    this.#parameterList = parameterList
    this.searchHints = searchHints

    console.assert(semicolonToken ? this.semicolonToken?.start === semicolonToken.start : !this.semicolonToken, 'oops;')
  }

  get openParenToken() {
    return this.#parameterList?.openParenToken
  }
  get closeParenToken() {
    return this.#parameterList?.closeParenToken
  }
  get parameters() {
    return this.#parameterList?.parameters ?? []
  }

  /**
   * @param {DeclarationStatementSyntaxNode} target The target node.
   * @returns {Annotation}
   */
  createAnnotation(target) {
    const { name } = this
    return new Annotation(name.value, target)
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
 * `PRAGMA DEPRECATE`
 * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/DEPRECATE-pragma.html
 */
class DeprecatePragmaDeclarationStatementSyntaxNode extends PragmaDeclarationStatementSyntaxNode {
  /** @override */
  searchHints = ['previous', 'parent']

  /**
   * @type {IdentifierSyntaxNode}
   * Identifier of the PL/SQL element being deprecated.
   */
  elementName

  /**
   * @type {ExpressionSyntaxNode?}
   * An optional compile-time warning message.
   */
  message

  /**
   * @param {SyntaxNode} pragmaKeyword
   * @param {IdentifierSyntaxNode} name
   * @param {InvocationParameterListExpressionSyntaxNode} parameterList
   * @param {TokenLike?} semicolonToken The terminating semicolon (`;`), if any.
   */
  constructor(pragmaKeyword, name, parameterList, semicolonToken) {
    super(pragmaKeyword, name, parameterList, semicolonToken)

    // JSCRAP: I can decompose to variables but not members. Is that a real limitation or...?
    const [elementName, message] = this.parameters.map(p => p.value)
    this.elementName = elementName
    this.message = message

    console.assert(semicolonToken ? this.semicolonToken?.start === semicolonToken.start : !this.semicolonToken, 'oops;')
  }

  /**
   * @override
   * @param {DeclarationStatementSyntaxNode} node
   * @returns {boolean}
   */
  isMatch(node) {
    mustBeInstanceOf(node, DeclarationStatementSyntaxNode)
    // ASSUMPTION: node.name is (more) fully qualified, whereas our name may not be.
    const offset = node.name.parts.length - this.elementName.parts.length
    if (offset < 0) {
      console.assert(false, 'longer?', this.elementName, node.name)
      return false
    }
    if (offset === 0) {
      // Just do it the easy way.
      return this.elementName.value === node.name.value
    }

    // Name is partial (e.g. BAR when node is FOO.BAR)
    return this.elementName.parts.every((value, index) => {
      const otherValue = node.name.parts[index + offset]
      return value.value === otherValue.value
    })
  }

  /**
   * @override
   * @param {DeclarationStatementSyntaxNode} target
   * @returns {Annotation}
   */
  createAnnotation(target) {
    // DEPRECATE, really?
    return new Annotation('deprecated', target, this.message)
  }
}
exports.DeprecatePragmaDeclarationStatementSyntaxNode = DeprecatePragmaDeclarationStatementSyntaxNode

/**
 * `PRAGMA EXCEPTION_INIT`
 * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/EXCEPTION_INIT-pragma.html
 */
class ExceptionInitPragmaDeclarationStatementSyntaxNode extends PragmaDeclarationStatementSyntaxNode {
  /** @override */
  searchHints = ['previous']

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
   * @param {SyntaxNode} pragmaKeyword
   * @param {IdentifierSyntaxNode} name
   * @param {InvocationParameterListExpressionSyntaxNode} parameterList
   * @param {TokenLike} semicolonToken
   */
  constructor(pragmaKeyword, name, parameterList, semicolonToken) {
    super(pragmaKeyword, name, parameterList, semicolonToken)

    // JSCRAP: I can decompose to variables but not members. Is that a real limitation or...?
    const [exception, errorCode] = this.parameters.map(p => p.value)
    this.exception = exception
    this.errorCode = errorCode
    this.errorId = ExceptionInitPragmaDeclarationStatementSyntaxNode.#toErrorId(errorCode)

    console.assert(semicolonToken ? this.semicolonToken?.start === semicolonToken.start : !this.semicolonToken, 'oops;')
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
    mustBeInstanceOf(node, DeclarationStatementSyntaxNode)
    return this.exception.value === node.name.value
  }

  /**
   * @override
   * @param {DeclarationStatementSyntaxNode} target
   * @returns {Annotation}
   */
  createAnnotation(target) {
    const { name, exception, errorCode, errorId } = this
    return new Annotation(name.value, target, null, { exception, errorCode, errorId })
  }
}
exports.ExceptionInitPragmaDeclarationStatementSyntaxNode = ExceptionInitPragmaDeclarationStatementSyntaxNode

////////////////////

/**
 * Represents a parameter in an invocation.
 */
class InvocationParameterExpressionSyntaxNode extends ExpressionSyntaxNode {

  /** @type {IdentifierSyntaxNode?}  The parameter name in the invocation (optional). */ name
  /** @type {Token?} The parameter arrow in the invocation (optional). */ arrowToken
  /** @type {AnyExpressionSyntaxNode} The parameter value expression */ value

  /**
   * @overload Just the value.
   * @param {AnyExpressionSyntaxNode} value  The parameter value expression (required).
   * @overload Name and value.
   * @param {IdentifierSyntaxNode} name The name of the parameter.
   * @param {TokenLike} arrowToken The parameter arrow in the invocation (optional).
   * @param {AnyExpressionSyntaxNode} value  The parameter value expression (required).
   */
  constructor(...params) {
    super(...params)
    switch (params.length) {
      case 1:
        [this.value] = params
        break
      case 3:
        const [name, arrow, value] = params
        this.name = name
        this.value = value
        this.arrowToken = this.resolveToken(arrow)
        break
      default:
        throw new InvalidNumberOfArgumentsError(params)
    }

    console.assert(this.value instanceof ExpressionSyntaxNode || this.value instanceof IdentifierSyntaxNode || this.value instanceof LiteralSyntaxNode, `${this.value.textSpan}: must not be base class or Statement`)
  }
}
exports.InvocationParameterExpressionSyntaxNode = InvocationParameterExpressionSyntaxNode

/**
 * Represents a parameter list in an invocation.
 */
class InvocationParameterListExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {InvocationParameterExpressionSyntaxNode[]} */ parameters
  /** @type {Token} */ openParenToken
  /** @type {Token} */ closeParenToken

  /**
   * @param {TokenLike} openParenToken
   * @param {SyntaxNode[]} parametersWithCommas
   * @param {TokenLike} closeParenToken
   */
  constructor(openParenToken, parametersWithCommas, closeParenToken) {
    super(openParenToken, ...parametersWithCommas, closeParenToken)
    this.parameters = parametersWithCommas.filter(x => x instanceof InvocationParameterExpressionSyntaxNode)
    // Must resolve the canonical tokens.
    this.openParenToken = this.resolveToken(openParenToken)
    this.closeParenToken = this.resolveToken(closeParenToken)
  }
}
exports.InvocationParameterListExpressionSyntaxNode = InvocationParameterListExpressionSyntaxNode

/**
 * Represents an invocation of a function, procedure, or similar.
 */
class InvocationExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {IdentifierSyntaxNode} */ name
  /** @type {InvocationParameterListExpressionSyntaxNode} */ #parameterList

  /**
   * @param {IdentifierSyntaxNode} name
   * @param {InvocationParameterListExpressionSyntaxNode?} parameterList
   */
  constructor(name, parameterList) {
    super(name, parameterList)
    this.name = name
    this.#parameterList = parameterList
  }

  get parameters() {
    return this.#parameterList?.parameters ?? []
  }
}

/**
 * Top-level SQL*Plus statement.
 */
class SqlPlusStatementSyntaxNode extends StatementSyntaxNode {
}
exports.SqlPlusStatementSyntaxNode = SqlPlusStatementSyntaxNode

class UnaryExpressionSyntaxNode extends ExpressionSyntaxNode {
  /**
   * @param {SyntaxNodeOrTokenLike} operator
   * @param {AnyExpressionSyntaxNode} expression
   */
  constructor(operator, expression) {
    super(operator, expression)
  }

  /** @type {SyntaxNode} */
  get operator() {
    return this.children[0]
  }
  /** @type {AnyExpressionSyntaxNode} */
  get expression() {
    return this.children[1]
  }
}
exports.UnaryExpressionSyntaxNode = UnaryExpressionSyntaxNode

class BinaryExpressionSyntaxNode extends ExpressionSyntaxNode {
  /**
   * @param {AnyExpressionSyntaxNode} left
   * @param {SyntaxNode} operator
   * @param {AnyExpressionSyntaxNode} right
   */
  constructor(left, operator, right) {
    super(left, operator, right)
  }

  /** @type {AnyExpressionSyntaxNode} */
  get left() { return this.children[0] }
  /** @type {SyntaxNode} */
  get operator() { return this.children[1] }
  /** @type {AnyExpressionSyntaxNode} */
  get right() { return this.children[2] }

  /**
   * Always separates the immediate children with whitespace.
   * @override
   * @param {TokenFormat} format
   * @return {string}
   */
  toString(format = null) {
    return this.children.map(c => c.toString(format)).join(' ')
  }

  /**
   * Always separates the immediate children with whitespace.
   * @override
   * @param {TokenFormat} format
   * @return {string}
   */
  toStructuredString(format = null) {
    return this.children.map(c => c.toStructuredString(format)).join(' ')
  }

  /**
   * Always separates the immediate children with whitespace.
   * @override
   * @param {TokenFormat} format
   * @return {string}
   */
  toFullString(format = null) {
    return this.children.map(c => c.toFullString(format)).join(' ')
  }
}
exports.BinaryExpressionSyntaxNode = BinaryExpressionSyntaxNode

class ParenthesizedExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {ExpressionSyntaxNode} */ expression
  /** @type {Token} */ openParenToken
  /** @type {Token} */ closeParenToken

  /**
   * @param {TokenLike} openParenToken
   * @param {ExpressionSyntaxNode} expression
   * @param {TokenLike} closeParenToken
   */
  constructor(openParenToken, expression, closeParenToken) {
    super(openParenToken, operator, closeParenToken)
    this.expression = expression
    // Must resolve the canonical tokens.
    this.openParenToken = this.resolveToken(openParenToken)
    this.closeParenToken = this.resolveToken(closeParenToken)
  }
}
exports.ParenthesizedExpressionSyntaxNode = ParenthesizedExpressionSyntaxNode

class LiteralExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {LiteralSyntaxNode} The literal string value in the compound literal. */ literal

  /**
   * @param {TokenLike} keyword
   * @param {LiteralSyntaxNode} literal
   * @param {...SyntaxNodeOrTokenLike[]} params
   */
  constructor(keyword, literal, ...params) {
    super(keyword, literal, params)
    this.literal = literal
  }
}
exports.LiteralExpressionSyntaxNode = LiteralExpressionSyntaxNode

/**
 * `INTERVAL 'literal' <expr> <to_expr>?`
 *
 * expr:
 *
 * - `[DAY|HOUR|MINUTE] [(leading_precision)]?`
 * - `[SECOND] [(leading_precision[, fractional_seconds_precision?])]?`
 *
 * to_expr:
 *  - `[DAY|HOUR|MINUTE|SECOND[(fractional_seconds_precision)?]]`
 */
class DSIntervalLiteralExpressionSyntaxNode extends LiteralExpressionSyntaxNode {

  /**
   * @param {SyntaxNode} keyword `INTERVAL`
   * @param {LiteralSyntaxNode} literal
   * @param {IntervalLeadingTypeRestrictionExpressionSyntaxNode} leadingRestriction
   * @param {IntervalTrailingTypeRestrictionExpressionSyntaxNode?} trailingRestriction
   */
  constructor(keyword, literal, leadingRestriction, trailingRestriction) {
    super(keyword, literal, leadingRestriction, trailingRestriction)

    this.leadingRestriction = this.leadingRestriction
    this.trailingRestriction = this.trailingRestriction
  }
}
exports.DSIntervalLiteralExpressionSyntaxNode = DSIntervalLiteralExpressionSyntaxNode

/**
 * `INTERVAL 'literal' [YEAR|MONTH] [(precision)]? [TO [YEAR|MONTH]]?`
 */
class YMIntervalLiteralExpressionSyntaxNode extends LiteralExpressionSyntaxNode {
  /** @type {SyntaxNode} */ leadingRestriction
  /** @type {IntervalLeadingTypeRestrictionExpressionSyntaxNode} */ leadingRestriction
  /** @type {IntervalTrailingTypeRestrictionExpressionSyntaxNode?} */ trailingRestriction

  /**
   * @param {SyntaxNode} keyword `INTERVAL`
   * @param {LiteralSyntaxNode} literal
   * @param {IntervalLeadingTypeRestrictionExpressionSyntaxNode?} leadingRestriction
   * @param {IntervalTrailingTypeRestrictionExpressionSyntaxNode?} trailingRestriction
   */
  constructor(keyword, literal, leadingRestriction, trailingRestriction) {
    super(keyword, literal, leadingRestriction, trailingRestriction)

    this.leadingRestriction = this.leadingRestriction
    this.trailingRestriction = this.trailingRestriction
  }

}
exports.YMIntervalLiteralExpressionSyntaxNode = YMIntervalLiteralExpressionSyntaxNode

class DateLiteralExpressionSyntaxNode extends LiteralExpressionSyntaxNode {
  /**
   * @param {TokenLike} dateKeyword
   * @param {LiteralSyntaxNode} literal
   */
  constructor(dateKeyword, literal) {
    super(dateKeyword, literal)
  }
}
exports.DateLiteralExpressionSyntaxNode = DateLiteralExpressionSyntaxNode


class TimestampLiteralExpressionSyntaxNode extends LiteralExpressionSyntaxNode {
  /** @type {PrecisionTypeRestrictionExpressionSyntaxNode?} */ precision
  /** @type {SyntaxNode?} */ timezoneSpecifier

  /**
   * @param {TokenLike} timestampKeyword
   * @param {LiteralSyntaxNode} literal
   * @param {PrecisionTypeRestrictionExpressionSyntaxNode?} precision
   * @param {SyntaxNode} timezoneSpecifier
   */
  constructor(timestampKeyword, literal, yearKeyword, precision, timezoneSpecifier) {
    super(timestampKeyword, literal, yearKeyword, precision, timezoneSpecifier)
    this.precision = precision
    this.timezoneSpecifier = timezoneSpecifier
  }
}
exports.TimestampLiteralExpressionSyntaxNode = TimestampLiteralExpressionSyntaxNode

// -----------------------------------
// PL/SQL type restriction expressions
// -----------------------------------

class TypeRestrictionExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {string} */ restrictionKind
}
exports.TypeRestrictionExpressionSyntaxNode = TypeRestrictionExpressionSyntaxNode

/**
 * `LENGTH` restriction type.
 */
class LengthTypeRestrictionExpressionSyntaxNode extends TypeRestrictionExpressionSyntaxNode {
  /** @override */
  restrictionKind = 'length'

  /** @type {ExpressionSyntaxNode} The numeric portion */ value
  /** @type {ExpressionSyntaxNode?} `byte` or `char`, if present */ qualifier
  /** @type {Token} */ openParenToken
  /** @type {Token} */ closeParenToken

  /**
   * @param {TokenLike} openParenToken
   * @param {ExpressionSyntaxNode} value
   * @param {SyntaxNode?} qualifier
   * @param {TokenLike} closeParenToken
   */
  constructor(openParenToken, value, qualifier, closeParenToken) {
    super(openParenToken, value, qualifier, closeParenToken)
    this.value = value
    this.qualifier = qualifier
    // Must resolve the canonical tokens.
    this.openParenToken = this.resolveToken(openParenToken)
    this.closeParenToken = this.resolveToken(closeParenToken)
  }
}

/**
 * `NULL` / `NOT NULL` restriction type.
 */
class NullabilityTypeRestrictionExpressionSyntaxNode extends TypeRestrictionExpressionSyntaxNode {
  /** @override */
  restrictionKind = 'nullability'

  /** @type {boolean} */
  isNotNull

  /**
   * @param {...TokenLike} tokens
   */
  constructor(...tokens) {
    super(...tokens)
    this.isNotNull = tokens[0].value === 'NOT'
  }
}
exports.NullabilityTypeRestrictionExpressionSyntaxNode = NullabilityTypeRestrictionExpressionSyntaxNode

/**
 * `PRECISION` restriction type.
 */
class PrecisionTypeRestrictionExpressionSyntaxNode extends TypeRestrictionExpressionSyntaxNode {
  /** @override */
  restrictionKind = 'precision'

  /** @type {Token} */ openParenToken
  /** @type {Token} */ closeParenToken
  /** @type {ExpressionSyntaxNode} */ value

  /**
   * @param {TokenLike} openParenToken
   * @param {ExpressionSyntaxNode} value
   * @param {TokenLike} closeParenToken
   */
  constructor(openParenToken, value, closeParenToken) {
    super(openParenToken, value, closeParenToken)
    this.value = value
    // Must resolve the canonical tokens.
    this.openParenToken = this.resolveToken(openParenToken)
    this.closeParenToken = this.resolveToken(closeParenToken)
  }
}
exports.PrecisionTypeRestrictionExpressionSyntaxNode = PrecisionTypeRestrictionExpressionSyntaxNode

/**
 * Precision-and-scale restriction type.
 */
class PrecisionAndScaleTypeRestrictionExpressionSyntaxNode extends TypeRestrictionExpressionSyntaxNode {
  /** @override */
  restrictionKind = 'precision-and-scale'

  /** @type {ExpressionSyntaxNode} */ precision
  /** @type {ExpressionSyntaxNode?} */ scale
  /** @type {Token} */ openParenToken
  /** @type {Token} */ closeParenToken

  /**
   * @param {TokenLike} openParenToken
   * @param {ExpressionSyntaxNode} precision
   * @param {SyntaxNode?} comma
   * @param {ExpressionSyntaxNode?} scale
   * @param {TokenLike} closeParenToken
   */
  constructor(openParenToken, precision, comma, scale, closeParenToken) {
    super(openParenToken, precision, comma, scale, closeParenToken)
    this.precision = precision
    this.scale = scale
    // Must resolve the canonical tokens.
    this.openParenToken = this.resolveToken(openParenToken)
    this.closeParenToken = this.resolveToken(closeParenToken)
  }
}
exports.PrecisionAndScaleTypeRestrictionExpressionSyntaxNode = PrecisionAndScaleTypeRestrictionExpressionSyntaxNode

class RangeTypeRestrictionExpressionSyntaxNode extends TypeRestrictionExpressionSyntaxNode {
  /** @override */
  restrictionKind = 'range'
  /** @type {ExpressionSyntaxNode} */ lower
  /** @type {ExpressionSyntaxNode} */ upper

  /**
   *
   * @param {SyntaxNode} keyword
   * @param {ExpressionSyntaxNode} lower
   * @param {SyntaxNode} dotdot
   * @param {ExpressionSyntaxNode} upper
   */
  constructor(keyword, lower, dotdot, upper) {
    super(keyword, lower, dotdot, upper)
    this.lower = lower
    this.upper = upper
  }
}


class IntervalTypeRestrictionExpressionSyntaxNode extends TypeRestrictionExpressionSyntaxNode {
  /** @type {SyntaxNode} */ field
}
exports.IntervalTypeRestrictionExpressionSyntaxNode = IntervalTypeRestrictionExpressionSyntaxNode

class IntervalLeadingTypeRestrictionExpressionSyntaxNode extends IntervalTypeRestrictionExpressionSyntaxNode {
  /**
   * @param {TokenLike} field `DAY` | `HOUR` | `MINUTE` | `SECOND`
   * @param {(PrecisionTypeRestrictionExpressionSyntaxNode | PrecisionAndScaleTypeRestrictionExpressionSyntaxNode)?} precision
   */
  constructor(field, restriction) {
    super(field, restriction)
    this.field = this.children[0]
  }
}
exports.IntervalLeadingTypeRestrictionExpressionSyntaxNode = IntervalLeadingTypeRestrictionExpressionSyntaxNode

class IntervalTrailingTypeRestrictionExpressionSyntaxNode extends IntervalTypeRestrictionExpressionSyntaxNode {
  /**
   * @param {TokenLike} toKeyword `TO`
   * @param {TokenLike} field `DAY` | `HOUR` | `MINUTE` | `SECOND`
   * @param {TypeRestrictionExpressionSyntaxNode?} restriction
   */
  constructor(toKeyword, field, restriction) {
    super(toKeyword, field, restriction)
    this.field = this.children[1]
  }
}
exports.IntervalTrailingTypeRestrictionExpressionSyntaxNode = IntervalTrailingTypeRestrictionExpressionSyntaxNode

//--------------------------------------
// Type expressions
//--------------------------------------

/**
 * Represents a type expression.
 */
class TypeExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {SyntaxNode} The name of the type expression */ name
  /** @type {TypeRestrictionExpressionSyntaxNode[]} The restrictions. */ restrictions

  /**
   * @param {SyntaxNode} name
   * @param  {...SyntaxNodeOrToken} params
   */
  constructor(name, ...params) {
    name = SyntaxNode.asSyntaxNode(name)
    super(name, ...params)
    this.name = name
    this.restrictions = params.filter(p => p instanceof TypeRestrictionExpressionSyntaxNode)
  }

  /**
   * @protected
   * @param {string} kind
   * @returns {TypeRestrictionExpressionSyntaxNode?}
   */
  getFirstRestrictionByKind(kind) {
    return this.restrictions.find(r => r.restrictionKind === kind)
  }

  /**
   * @template {TypeRestrictionExpressionSyntaxNode} TRestriction
   * @param {Type<TRestriction>} type
   * @returns {TRestriction?}
   */
  getFirstRestrictionByType(type) {
    return this.restrictions.find(r => r instanceof type)
  }

  /** @type {NullabilityTypeRestrictionExpressionSyntaxNode?} The `NULL`/`NOT NULL` restriction. */
  get nullability() {
    return this.getFirstRestrictionByType(NullabilityTypeRestrictionExpressionSyntaxNode)
  }
}
exports.TypeExpressionSyntaxNode = TypeExpressionSyntaxNode

/**
 * Represents an integer type, with optional restrictions.
 */
class IntegerTypeExpressionSyntaxNode extends TypeExpressionSyntaxNode {

  /** @type {RangeTypeRestrictionExpressionSyntaxNode?} The `RANGE` restriction. */
  get range() {
    return this.getFirstRestrictionByType(RangeTypeRestrictionExpressionSyntaxNode)
  }
}
exports.IntegerTypeExpressionSyntaxNode = IntegerTypeExpressionSyntaxNode

/**
 * Character type expression with optional length.
 * @example `VARCHAR2`
 * @example `VARCHAR2(4000)`
 */
class CharacterTypeExpressionSyntaxNode extends TypeExpressionSyntaxNode {

  /** @type {LengthTypeRestrictionExpressionSyntaxNode?} */
  get length() {
    return this.getFirstRestrictionByType(LengthTypeRestrictionExpressionSyntaxNode)
  }
}
exports.CharacterTypeExpressionSyntaxNode = CharacterTypeExpressionSyntaxNode

/**
 * Decimal type expression with optional precision and scale.
 * @example `NUMBER`
 * @example `NUMBER(5)`
 * @example `NUMBER(*, 0)`
 * @example `NUMBER(5, 2)`
 */
class DecimalTypeExpressionSyntaxNode extends TypeExpressionSyntaxNode {

  /** @type {PrecisionAndScaleTypeRestrictionExpressionSyntaxNode?} */
  get precisionAndScale() {
    return this.getFirstRestrictionByType(PrecisionAndScaleTypeRestrictionExpressionSyntaxNode)
  }
}
exports.DecimalTypeExpressionSyntaxNode = DecimalTypeExpressionSyntaxNode

/**
 * `RECORD` type.
 */
class RecordTypeExpressionSyntaxNode extends TypeExpressionSyntaxNode {
  /** @type {DeclarationParameterExpressionSyntaxNode[]} */

  /**
   *
   * @param {SyntaxNodeOrToken} name
   * @param {DeclarationParameterListExpressionSyntaxNode} parameters
   */
  constructor(name, parameters) {
    super(name, parameters)
    this.name = name
    this.parameters = parameters.parameters
  }
}

exports.RecordTypeExpressionSyntaxNode = RecordTypeExpressionSyntaxNode

/**
 * Nested table type.
 */
class NestedTableTypeExpressionSyntaxNode extends TypeExpressionSyntaxNode {
  /** @type {TypeExpressionSyntaxNode} */ itemType

  /**
   *
   * @param {SyntaxNode} tableOf `TABLE OF`
   * @param {TypeExpressionSyntaxNode} itemType
   * @param {...TypeRestrictionExpressionSyntaxNode} restrictions
   */
  constructor(tableOf, itemType, ...restrictions) {
    super(tableOf, itemType, ...restrictions)
    this.itemType = itemType
  }
}
exports.NestedTableTypeExpressionSyntaxNode = NestedTableTypeExpressionSyntaxNode


/**
 * Associative array type.
 */
class AssociativeArrayTypeExpressionSyntaxNode extends TypeExpressionSyntaxNode {
  /** @type {TypeExpressionSyntaxNode} */ keyType
  /** @type {TypeExpressionSyntaxNode} */ valueType

  /**
   *
   * @param {SyntaxNode} tableOf `TABLE OF`
   * @param {TypeExpressionSyntaxNode} valueType
   * @param {SyntaxNode} indexBy `INDEX BY`
   * @param {TypeExpressionSyntaxNode} keyType
   */
  constructor(tableOf, valueType, indexBy, keyType, ...restrictions) {
    super(tableOf, valueType, indexBy, keyType, ...restrictions)
    this.valueType = valueType
    this.keyType = keyType
  }
}
exports.AssociativeArrayTypeExpressionSyntaxNode = AssociativeArrayTypeExpressionSyntaxNode

/**
 * Marker type for document comments.
 */
class DocumentCommentSyntaxNode extends StructuredTriviaSyntaxNode {
  constructor(...tokens) {
    super(...tokens)
  }
}
