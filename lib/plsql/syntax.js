const console = require('../debug').child(__filename)
const { mustBeNonEmptyArray } = require('../guards')
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
  SyntaxNodeReader
} = require('../syntax')
const {
  Token,
  TokenLike,
  TokenPattern,
  TokenSyntaxError
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
  static LPAREN = Patterns.operator('(')
  static RPAREN = Patterns.operator(')')
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
    '=>',
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
   * Reads starting with the given token as an identifier.
   * @param {TokenLike} token
   * @param {...TokenPattern} secondary Secondary delimiters
   * @returns {IdentifierSyntaxNode}
   */
  #readAsIdentifier(token, ...secondary) {
    const tokens = [token]
    const delimiters = secondary.length ? [Patterns.PERIOD, ...secondary] : Patterns.PERIOD
    let /** @type {Token[]?} */ nextTokens
    while (nextTokens = this.tryReadNextTokens(delimiters, Patterns.ANY_IDENTIFIER)) {
      tokens.push(...nextTokens)
    }

    return new IdentifierSyntaxNode(...tokens)
  }

  /**
   * Tries reading the next item as an identifier.
   * @param {TokenLike} token
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
   * Tries reading the next item as a left parenthesis (`(`).
   * @returns {SyntaxNode?}
   */
  #tryReadNextAsLeftParen() {
    return SyntaxNode.asSyntaxNode(this.tryReadNextToken(Patterns.LPAREN))
  }

  /**
   * Reads the next item as a left parenthesis (`)`).
   * @returns {SyntaxNode}
   */
  #readNextAsLeftParen() {
    return SyntaxNode.asSyntaxNode(this.readNextToken(Patterns.LPAREN))
  }

  /**
   * Reads the next item as a right parenthesis (`)`).
   * @returns {SyntaxNode}
   */
  #readNextAsRightParen() {
    return SyntaxNode.asSyntaxNode(this.readNextToken(Patterns.RPAREN))
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
   * @param {TokenLike} token
   * @returns {SyntaxNode}
   */
  #readAsCreateStatement(token) {
    // CREATE
    this.verify({ type: 'reserved', value: 'CREATE' }, token)
    const create = new SyntaxNode(token)

    let next = null

    // OR REPLACE
    if (next = this.tryReadNextTokens('OR', 'REPLACE')) {
      create.push(...next)
    }

    const editionable = this.#tryReadNextAsEditionableClause()
    const unitType = this.#readNextAsUnitType()
    const ifNotExists = this.#tryReadNextAsIfNotExists()

    switch (unitType.name) {
      case 'FUNCTION':
        return this.#readRestOfStandaloneFunction(create, editionable, unitType, ifNotExists)
      case 'PROCEDURE':
        return this.#readRestOfStandaloneProcedure(create, editionable, unitType, ifNotExists)
      case 'PACKAGE':
        return this.#readRestOfPackageSpec(create, editionable, unitType, ifNotExists)
      case 'TYPE':
        return this.#readRestOfTypeSpec(create, editionable, unitType, ifNotExists)
      default:
        console.assertOnce(unitType.name, false, `${create.textSpan} Unit type '${unitType.name}' is not implemented`)
        return this.#readNextAsOpaqueSqlStatement(create, editionable, unitType, ifNotExists)
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
   * Read the next items until a SQL statement terminator (`;`, `/`).
   * @returns {SyntaxNode}
   */
  #tryReadNextAsSqlTerminator() {
    const terminator = SyntaxNode.asSyntaxNode(this.tryReadNextToken(Patterns.END_OF_SQL_STATEMENT))
    if (terminator) {
      return terminator
    }

    const terminatorPlusOther = [...this.readNextTokensUntil(Patterns.END_OF_SQL_STATEMENT)]
    if (terminatorPlusOther.length) {
      console.assert(false, `${terminatorPlusOther.textSpan} Expected SEMICOLON or SLASH but found '${terminatorPlusOther}'`)
      return new SqlStatementSyntaxNode(terminatorPlusOther)
    }

    // EOF; this is fine.
    return null
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
   * Tries reading the next item as a statement terminator.
   * If the next character isn't a semicolon, it will warn, then read up to the next semicolon.
   * @returns {SyntaxNode?} The terminating semicolon
   * -OR- additional unhandled data plus a semicolon
   * -OR- null (if at EOF)
   */
  #tryReadNextAsPlsqlTerminator() {
    const terminator = SyntaxNode.asSyntaxNode(this.tryReadNextToken(Patterns.SEMICOLON))
    if (terminator) {
      return terminator
    }

    const terminatorPlusOther = this.#readNextAsOpaquePlsqlStatement()
    if (terminatorPlusOther) {
      console.assert(false, `${terminatorPlusOther.textSpan} Expected SEMICOLON but found '${terminatorPlusOther}'`)
      return terminatorPlusOther
    }

    // EOF; this is fine.
    return null
  }

  /**
   * Reads the next item as a statement terminator.
   * If the next character isn't a semicolon, it will warn, then read up to the next semicolon.
   * @returns {SyntaxNode} The terminating semicolon
   * -OR- additional unhandled data plus a semicolon
   * @throws {TokenSyntaxError} if at EOF
   */
  #readNextAsPlsqlTerminator() {
    const result = this.#tryReadNextAsPlsqlTerminator()
    if (result) {
      return result
    }

    throw this.endOfStreamError()
  }

  // ---------------

  /**
   * Tries reading the next item as single `ACCESSIBLE BY (...)` accessor declaration.
   * ```text
   * <unit-kind>? <identifier>
   * ```
   * @returns {AccessorExpressionSyntaxNode?}
   */
  #tryReadNextAsAccessor() {
    const unitKind = this.tryReadNextToken(Patterns.PLSQL_UNIT_KIND)
    const name = this.#tryReadNextAsIdentifier()

    return name ? new AccessorExpressionSyntaxNode({ unitKind, name }) : null
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
    const lparen = this.#tryReadNextAsLeftParen()
    if (!lparen) {
      return null
    }

    return new AccessorListExpressionSyntaxNode(
      lparen,
      [...this.#readNextAsAccessorsWithCommas()],
      this.#readNextAsRightParen()
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

    const lparen = this.#tryReadNextAsLeftParen()
    if (lparen) {
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
    const reliesOn = SyntaxNode.asSyntaxNode(this.tryReadNextTokens('RELIES_ON', Patterns.LPAREN))
    if (reliesOn) {
      // RELIES_ON clause is found, but it is deprecated.
      // Eat and move on.
      return new ExpressionSyntaxNode(keyword, ...reliesOn, this.readNextTokensUntil(Patterns.RPAREN))
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
    // LATER: worry about parameter names.
    const value = this.#tryReadNextAsValueExpression()
    return value ? new InvocationParameterExpressionSyntaxNode({ value }) : null
  }

  /**
   * Reads the next item as a single parameter from an invocation.
   * @returns {InvocationParameterExpressionSyntaxNode}
   */
  #readNextAsInvocationParameter() {
    // LATER: worry about parameter names.
    return new InvocationParameterExpressionSyntaxNode({ value: this.#readNextAsValueExpression() })
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
   * Tries reading the next item as a list of parameters from a declaration.
   * @returns {InvocationParameterListExpressionSyntaxNode?}
   */
  #tryReadNextAsInvocationParameterList() {
    const lparen = this.#tryReadNextAsLeftParen()
    if (!lparen) {
      return null
    }

    return new InvocationParameterListExpressionSyntaxNode(
      lparen,
      [...this.#readNextAsInvocationParametersWithCommas()],
      this.#readNextAsRightParen()
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
   * Note we currently don't have a good way to distinguish between a function invoked without parens and a standalone identifier.
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
    const is = this.tryReadNextToken(Patterns.IS_OR_AS)
    if (!is) {
      return null
    }

    const body = this.#tryReadAsNonPlsqlProcedureOrFunctionBody()
    if (body) {
      return new ExpressionSyntaxNode(is, body)
    }

    throw this.notImplemented("Function body")
  }

  /**
   * Reads starting with the given token as a `FUNCTION` declaration within a PL/SQL declaration block.
   * @param {TokenLike} token
   * @returns {FunctionDeclarationStatementSyntaxNode}
   */
  #readAsFunctionDeclaration(token) {
    this.verify(Patterns.FUNCTION, token)

    return new FunctionDeclarationStatementSyntaxNode({
      keyword: SyntaxNode.asSyntaxNode(token),
      name: this.#readNextAsIdentifier(),
      parameters: this.#tryReadNextAsParameterListDeclaration(),
      returnClause: this.#tryReadNextAsReturnDeclaration(),
      unitModifiers: [...this.#readNextAsUnitDeclarationModifiers()],
      body: this.#tryReadNextAsProcedureOrFunctionBody(),
      terminator: this.#readNextAsPlsqlTerminator()
    })
  }

  // ---------------

  /**
   * Reads starting with the given token as a `PROCEDURE` declaration within a PL/SQL declaration block.
   * @param {TokenLike} token
   * @returns {ProcedureDeclarationStatementSyntaxNode}
   */
  #readAsProcedureDeclaration(token) {
    this.verify(Patterns.PROCEDURE, token)

    return new ProcedureDeclarationStatementSyntaxNode({
      keyword: SyntaxNode.asSyntaxNode(token),
      name: this.#readNextAsIdentifier(),
      parameters: this.#tryReadNextAsParameterListDeclaration(),
      unitModifiers: [...this.#readNextAsUnitDeclarationModifiers()],
      body: this.#tryReadNextAsProcedureOrFunctionBody(),
      terminator: this.#readNextAsPlsqlTerminator()
    })
  }

  // ---------------

  /**
   * Reads starting with the given token as a pragma declaration.
   * @param {TokenLike} keyword
   * @returns {PragmaDeclarationStatementSyntaxNode}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/plsql-language-fundamentals.html#GUID-D6EFD7E8-39DF-4430-B625-B6D37E49F6F4
   */
  #readAsPragmaDeclaration(keyword) {
    this.verify(Patterns.PRAGMA, keyword)

    const name = this.#tryReadNextAsIdentifier() // probably a keyword to be safe

    const lparen = this.#tryReadNextAsLeftParen()
    const parameters = lparen ? new InvocationParameterListExpressionSyntaxNode(lparen, [...this.#readNextAsInvocationParametersWithCommas()], this.#readNextAsRightParen()) : null

    return PragmaDeclarationStatementSyntaxNode.create({ keyword, name, parameters, terminator: this.#readNextAsPlsqlTerminator() })
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
      this.#readNextAsPlsqlTerminator()
    )
  }

  /**
   * Reads starting with the given token as a type declaration.
   * @param {TokenLike} keyword
   * @returns {TypeDeclarationStatementSyntaxNodeBase}
   */
  #readAsTypeDeclaration(keyword) {
    this.verify({ value: 'TYPE' }, keyword)

    const name = this.#readNextAsIdentifier()
    const is = SyntaxNode.asSyntaxNode(this.readNextToken(Patterns.IS))

    const record = this.tryReadNextToken('RECORD')
    if (record) {
      return new RecordTypeDeclarationStatementSyntaxNode(
        keyword, name, is, record, this.#readNextAsParameterListDeclaration(), this.#readNextAsPlsqlTerminator()
      )
    }

    // Any other TYPE
    return new TypeDeclarationStatementSyntaxNode(keyword, name, is, this.#readNextAsTypeExpression(), this.#readNextAsPlsqlTerminator())
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
      return new ExceptionDeclarationStatementSyntaxNode({
        name,
        keyword: exception,
        terminator: this.#readNextAsPlsqlTerminator()
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
      terminator: this.#readNextAsPlsqlTerminator()
    })
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

    const is = this.readNextToken(Patterns.IS_OR_AS)

    return new CreatePackageStatementSyntaxNode({
      create, editionable, unitType, ifNotExists, name, unitModifiers,
      is,
      // It is (our) standard practice to put the PACKAGE doc comment right after the IS.
      // This is because Oracle understandably doesn't recognize comments before the CREATE statement as part of the package and it throws off line numbers, etc.
      docComment: this.#tryReadNextAsDocComment(),
      content: [...this.#readNextAsPackageSpecContent()]
    });
  }

  #readAsEndOfBlock(end) {
    this.verify('END', end)
    return new ExpressionSyntaxNode(
      end,
      this.tryReadNextToken(Patterns.ANY_IDENTIFIER),
      this.#tryReadNextAsSqlTerminator()
    );
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


    const [constructor, functionKeyword] = tokens
    return new ConstructorDeclarationStatementSyntaxNode({
      inheritance: inheritance,
      constructor,
      functionKeyword,
      name: this.#readNextAsIdentifier(),
      parameters: this.#tryReadNextAsParameterListDeclaration(),
      returnClause: new ConstructorReturnDeclarationExpressionSyntaxNode(...this.readNextTokens(Patterns.RETURN, 'SELF', 'AS', 'RESULT')),
      unitModifiers: [...this.#readNextAsUnitDeclarationModifiers()]
    })
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

    const [mapOrOrder, memberOrStatic, keyword] = tokens.length === 3 ? tokens : [null, ...tokens]

    return new ObjectMethodDeclarationStatementSyntaxNode({
      inheritance,
      mapOrOrder, memberOrStatic, keyword,
      name: this.#readNextAsIdentifier(),
      parameters: this.#tryReadNextAsParameterListDeclaration(),
      returnClause: this.#tryReadNextAsReturnDeclaration(),
      unitModifiers: [...this.#readNextAsUnitDeclarationModifiers()]
    })
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
    const lparen = this.#tryReadNextAsLeftParen()
    if (!lparen) {
      return null
    }

    return new ObjectMemberListDeclarationExpressionSyntaxNode({
      lparen,
      // It is (our) standard practice to put the OBJECT TYPE doc comment right after the opening parenthesis.
      // This is because Oracle understandably doesn't recognize comments before the CREATE statement as part of the package and it throws off line numbers, etc.
      docComment: this.#tryReadNextAsDocComment(),
      membersWithCommas: [...this.#readNextAsObjectMemberDeclarationsWithCommas()],
      rparen: this.#readNextAsRightParen()
    })
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
   * @param {SyntaxNode} create `CREATE [OR REPLACE]`
   * @param {SyntaxNode} editionable `EDITIONABLE` clause
   * @param {UnitTypeSyntaxNode} unitType `TYPE`
   * @param {SyntaxNode} ifNotExists `IF NOT EXISTS`
   * @returns {CreateTypeStatementSyntaxNode}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/CREATE-TYPE-statement.html#GUID-389D603D-FBD0-452A-8414-240BBBC57034
   */
  #readRestOfTypeSpec(create, editionable, unitType, ifNotExists) {
    const name = this.#readNextAsIdentifier()
    const force = SyntaxNode.asSyntaxNode(this.tryReadNextToken('FORCE'))
    const oid = this.#tryReadNextAsTypeOid()

    // Just read all the unit declaration modifiers into one bucket.
    const unitModifiers = [...this.#readNextAsUnitDeclarationModifiers()]

    // Next see if it is a base type or a subtype.

    const under = SyntaxNode.asSyntaxNode(this.tryReadNextToken('UNDER'))
    if (under) {
      // object subtype definition (UNDER keyword).
      // **NOTE:** there is no `IS` keyword here.
      return new CreateInheritedObjectTypeStatementSyntaxNode({
        create, editionable, unitType, ifNotExists, name, force, oid, unitModifiers,
        under,
        baseType: this.#readNextAsIdentifier(),
        members: this.#tryReadNextAsObjectMemberListDeclaration(),
        typeModifiers: [...this.#readNextAsTypeModifiers()],
        terminator: this.#tryReadNextAsSqlTerminator()
      })
    }

    // The other 3 require IS
    //  - object base type definition
    //  - nested table
    //  - varray
    const is = this.readNextToken(Patterns.IS_OR_AS)

    let keyword = this.tryReadNextToken('OBJECT')
    if (keyword) {
      return new CreateBaseObjectTypeStatementSyntaxNode({
        create, editionable, unitType, ifNotExists, name, force, oid, unitModifiers,
        is,
        keyword,
        members: this.#tryReadNextAsObjectMemberListDeclaration(),
        typeModifiers: [...this.#readNextAsTypeModifiers()],
        terminator: this.#tryReadNextAsSqlTerminator()
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
        unitModifiers,
        is,
        docComment: this.#tryReadNextAsDocComment(),
        baseType: this.#readAsTypeExpression(keyword), // should be unrestricted but we don't care.
        typeModifiers: [...this.#readNextAsTypeModifiers()],
        terminator: this.#tryReadNextAsSqlTerminator()
      })
    }

    throw this.notImplemented(this.iterator.value ?? is.lastToken, 'unknown TYPE type')
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
    const lparen = this.#tryReadNextAsLeftParen()
    if (lparen) {
      return new LengthTypeRestrictionExpressionSyntaxNode(
        lparen,
        this.#readNextAsNumberExpression(),
        SyntaxNode.asSyntaxNode(this.tryReadNextToken(['BYTE', 'CHAR'])),
        this.#readNextAsRightParen()
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
    const lparen = this.#tryReadNextAsLeftParen()
    if (lparen) {
      return new PrecisionTypeRestrictionExpressionSyntaxNode(
        lparen,
        this.#readNextAsNumberExpression(),
        this.#readNextAsRightParen()
      )
    }

    return null
  }

  /**
   * Tries reading the next item as a precision-and-scale restriction.
   * @returns {PrecisionAndScaleTypeRestrictionExpressionSyntaxNode?}
   */
  #tryReadNextAsPrecisionAndScaleTypeRestriction() {
    const lparen = this.#tryReadNextAsLeftParen()
    if (lparen) {
      return new PrecisionAndScaleTypeRestrictionExpressionSyntaxNode(
        lparen,
        this.#tryReadNextAsNumberExpression() ?? this.#readNextAsAsterisk(),
        this.#tryReadNextAsComma(),
        this.#tryReadNextAsNumberExpression(),
        this.#readNextAsRightParen()
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
   * @returns {ExpressionSyntaxNode}
   */
  #readAsIntervalTypeExpression(name) {
    this.verify(Patterns.INTERVAL, name)

    const day = this.tryReadNextToken('DAY')
    if (day) {
      return new ExpressionSyntaxNode(
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
      return new ExpressionSyntaxNode(
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

    const leftParen = this.#tryReadNextAsLeftParen()
    if (leftParen) {
      return new ParenthesizedExpressionSyntaxNode({
        left: leftParen,
        expression: this.#readNextAsValueExpression(),
        right: this.#readNextAsRightParen()
      })
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

    return new DeclarationParameterExpressionSyntaxNode({ name, mode, type, defaultExpression, defaultValue })
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
   * Tries reading the next item as a list of parameters from a declaration.
   * @returns {DeclarationParameterExpressionSyntaxNode?}
   */
  #tryReadNextAsParameterListDeclaration() {
    const leftParen = this.#tryReadNextAsLeftParen()
    if (!leftParen) {
      return null
    }

    return new DeclarationParameterListExpressionSyntaxNode(
      leftParen,
      [...this.#readNextAsParameterDeclarationsWithCommas()],
      this.#readNextAsRightParen()
    )
  }

  /**
   * Reads the next item as a list of parameters from a declaration.
   * @returns {DeclarationParameterExpressionSyntaxNode}
   */
  #readNextAsParameterListDeclaration() {
    return new DeclarationParameterListExpressionSyntaxNode(
      this.#readNextAsLeftParen(),
      [...this.#readNextAsParameterDeclarationsWithCommas()],
      this.#readNextAsRightParen()
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
   * @param {SyntaxNode[]} params.unitModifiers
   * @param {SyntaxNode} params.is
   * @param {TokenLike?} params.docComment
   * @param {SyntaxNode[]} params.content
   */
  constructor({ create, editionable, unitType, ifNotExists, name, unitModifiers, is, docComment, content }) {
    super(create, editionable, unitType, ifNotExists, name, unitModifiers, is, docComment, ...content)
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
  /** @type {SyntaxNode[]} */ typeModifiers
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
   * @param {SyntaxNode[]} params.unitModifiers
   * @param {SyntaxNode} params.is
   * @param {SyntaxNode} params.keyword
   * @param {ObjectMemberListDeclarationExpressionSyntaxNode} params.members
   * @param {SyntaxNode[]} params.typeModifiers
   * @param {SyntaxNode} params.terminator
   */
  constructor({ create, editionable, unitType, ifNotExists, name, force, oid, unitModifiers, is, keyword, members, typeModifiers, terminator }) {
    super(create, editionable, unitType, ifNotExists, name, force, oid, unitModifiers, is, keyword, members, typeModifiers, terminator)
    this.unitType = unitType
    this.name = name
    this.#members = members
    this.typeModifiers = typeModifiers

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

class CreateInheritedObjectTypeStatementSyntaxNode extends CreateTypeStatementSyntaxNode {
  /** @property {IdentifierSyntaxNode} */ name
  /** @property {SyntaxNode} */ type
  /** @property {SyntaxNode} */ under
  /** @property {IdentifierSyntaxNode} */ baseType

  /** @type {ObjectMemberListDeclarationExpressionSyntaxNode} */ #members

  /**
   * @param {object} params
   * @param {SyntaxNode} params.create
   * @param {SyntaxNode?} params.editionable
   * @param {UnitTypeSyntaxNode} params.unitType
   * @param {SyntaxNode} params.name
   * @param {SyntaxNode[]} params.unitModifiers
   * @param {SyntaxNode} params.is
   * @param {SyntaxNode} params.keyword
   * @param {ObjectMemberListDeclarationExpressionSyntaxNode} params.members
   * @param {SyntaxNode[]} params.typeModifiers
   * @param {SyntaxNode} params.terminator
   */
  constructor({ create, editionable, unitType, ifNotExists, name, force, oid, unitModifiers, under, baseType, members, typeModifiers, terminator }) {
    super(create, editionable, unitType, ifNotExists, name, force, oid, unitModifiers, under, baseType, members, typeModifiers, terminator)
    this.unitType = unitType
    this.name = name
    this.baseType = baseType
    this.#members = members
    this.typeModifiers = typeModifiers

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

class CreateNestedTableTypeStatementSyntaxNode extends CreateTypeStatementSyntaxNode {
  /** @type {SyntaxNode} */ is
  /** @type {TypeExpressionSyntaxNode} The base type on which this is derived. */ baseType

  /**
   * @param {object} params
   * @param {SyntaxNode} params.create
   * @param {SyntaxNode?} params.editionable
   * @param {UnitTypeSyntaxNode} params.unitType
   * @param {SyntaxNode} params.name
   * @param {SyntaxNode[]} params.unitModifiers
   * @param {SyntaxNode} params.is
   * @param {TokenLike?} params.docComment
   * @param {TypeExpressionSyntaxNode} params.baseType
   * @param {SyntaxNode[]} params.typeModifiers
   * @param {SyntaxNode} params.terminator
   */
  constructor({ create, editionable, unitType, ifNotExists, name, force, oid, unitModifiers, is, docComment, baseType, typeModifiers, terminator }) {
    super(create, editionable, unitType, ifNotExists, name, force, oid, unitModifiers, is, docComment, baseType, typeModifiers, terminator)
    this.unitType = unitType
    this.name = name
    this.docComment = docComment
    this.typeModifiers = typeModifiers
  }
}
exports.CreateBaseObjectTypeStatementSyntaxNode = CreateBaseObjectTypeStatementSyntaxNode

// -----------------------------------
// PL/SQL block unit common
// -----------------------------------

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

/**
 * Base class for all `TYPE` and `SUBTYPE` declaration statements.
 */
class TypeDeclarationStatementSyntaxNodeBase extends DeclarationStatementSyntaxNode {

  /**
   * @param {SyntaxNode} keyword The initial keyword (typically `TYPE` or `SUBTYPE`).
   * @param {IdentifierSyntaxNode} name The identifier.
   * @param {SyntaxNode} is `IS` keyword
   * @param {...SyntaxNodeOrToken} params
   */
  constructor(keyword, name, is, ...params) {
    super(keyword, name, is, ...params)
    console.assert(this.name === name, 'name is good')
  }

}
/**
 * `SUBTYPE` declaration.
 */
class SubtypeDeclarationStatementSyntaxNode extends TypeDeclarationStatementSyntaxNodeBase {
  /** @property {TypeExpressionSyntaxNode} */ baseType

  /**
   * @param {SyntaxNode} subtype The `SUBTYPE` keyword.
   * @param {IdentifierSyntaxNode} name The identifier.
   * @param {SyntaxNode} is `IS` keyword
   * @param {TypeExpressionSyntaxNode} baseType
   * @param {SyntaxNode} terminator
   */
  constructor(subtype, name, is, baseType, terminator) {
    super(subtype, name, is, baseType, terminator)

    this.baseType = baseType
  }
}
exports.SubtypeDeclarationStatementSyntaxNode = SubtypeDeclarationStatementSyntaxNode

/**
 * `TYPE <identifier> IS RECORD [...]` declaration.
 */
class RecordTypeDeclarationStatementSyntaxNode extends TypeDeclarationStatementSyntaxNodeBase {
  /** @property {DeclarationParameterExpressionSyntaxNode[]} */ fields

  /**
   * @param {SyntaxNode} type The `TYPE` keyword.
   * @param {IdentifierSyntaxNode} name The identifier.
   * @param {SyntaxNode} is `IS` keyword
   * @param {SyntaxNode} record The `RECORD` keyword.
   * @param {DeclarationParameterListExpressionSyntaxNode} fields The field collection (with punctuation).
   * @param {SyntaxNode} terminator
   * @param {...SyntaxNodeOrToken} params
   */
  constructor(type, name, is, record, fields, terminator) {
    super(type, name, is, record, fields, terminator)
    this.fields = fields.parameters
  }
}
exports.RecordTypeDeclarationStatementSyntaxNode = RecordTypeDeclarationStatementSyntaxNode

/**
 * `TYPE <identifier> IS <other>` declaration.
 */
class TypeDeclarationStatementSyntaxNode extends TypeDeclarationStatementSyntaxNodeBase {
  /** @property {TypeExpressionSyntaxNode} */ baseType

  /**
   * @param {SyntaxNode} type The `TYPE` keyword.
   * @param {IdentifierSyntaxNode} name The identifier.
   * @param {SyntaxNode} is `IS` keyword
   * @param {TypeExpressionSyntaxNode} baseType
   * @param {SyntaxNode} terminator
   */
  constructor(type, name, is, baseType, terminator) {
    super(type, name, is, baseType, terminator)
    this.baseType = baseType
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
  /** @type {SyntaxNode} [procedure|function] */ keyword
  /** @type {string} A unique ID for this procedure within context. */ id
  /** @type {DeclarationParameterListExpressionSyntaxNode?} */ parameters
  /** @type {SyntaxNode[]} Various clauses applying to this method (e.g., invoker_rights_clause, deterministic_clause). */ unitModifiers
}
exports.MethodDeclarationStatementSyntaxNodeBase = MethodDeclarationStatementSyntaxNodeBase

class FunctionDeclarationStatementSyntaxNode extends MethodDeclarationStatementSyntaxNodeBase {
  /**
   * @param {object} params
   * @param {SyntaxNode} params.keyword  The initial token (`FUNCTION`)
   * @param {IdentifierSyntaxNode} params.name
   * @param {DeclarationParameterListExpressionSyntaxNode?} params.parameters
   * @param {ReturnDeclarationExpressionSyntaxNode} params.returnClause
   * @param {SyntaxNode[]} unitModifiers
   * @param {ExpressionSyntaxNode?} params.body An optional body.
   * @param {SyntaxNode?} params.terminator
   */
  constructor({ keyword, name, parameters, returnClause, unitModifiers, body, terminator }) {
    super(keyword, name, parameters, returnClause, unitModifiers, body, terminator)
    this.keyword = keyword
    this.name = name
    this.parameters = parameters
    this.returnClause = returnClause
    this.unitModifiers = unitModifiers
    this.body = body
  }
}

class ProcedureDeclarationStatementSyntaxNode extends FunctionDeclarationStatementSyntaxNode {
  /**
   * @param {object} params
   * @param {SyntaxNode} params.keyword  The initial token (`PROCEDURE`)
   * @param {IdentifierSyntaxNode} params.name
   * @param {DeclarationParameterListExpressionSyntaxNode?} params.parameters
   * @param {SyntaxNode[]} unitModifiers
   * @param {ReturnDeclarationExpressionSyntaxNode} params.returnClause
   * @param {ExpressionSyntaxNode?} params.body An optional body.
   * @param {SyntaxNode?} params.terminator
   */
  constructor({ keyword, name, parameters, unitModifiers, body, terminator }) {
    super({ keyword, name, parameters, unitModifiers, body, terminator })
  }
}


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

  /** @type {InheritanceFlagSyntaxNode[]} */ inheritance
  /** @type {SyntaxNode} */ memberOrStatic
  /** @param {SyntaxNode?} */ mapOrOrder

  /**
   * @param {object} params
   * @param {InheritanceFlagSyntaxNode[]} params.inheritance
   * @param {SyntaxNode?} params.mapOrOrder
   * @param {SyntaxNode?} params.memberOrStatic
   * @param {SyntaxNode?} params.keyword
   * @param {IdentifierSyntaxNode} params.name
   * @param {DeclarationParameterListExpressionSyntaxNode?} params.parameters
   * @param {ReturnDeclarationExpressionSyntaxNode?} params.returnClause
   * @param {SyntaxNode[]} unitModifiers
   */
  constructor({ inheritance, mapOrOrder, memberOrStatic, keyword, name, parameters, returnClause, unitModifiers }) {
    super(inheritance, mapOrOrder, memberOrStatic, keyword, name, parameters, returnClause, unitModifiers)
    this.mapOrOrder = mapOrOrder
    this.memberOrStatic = memberOrStatic
    this.keyword = keyword
    this.name = name
    this.inheritance = inheritance
    this.parameters = parameters
    this.returnClause = returnClause
    this.unitModifiers = unitModifiers

    this.memberKind = 'Method'
    this.isStatic = memberOrStatic.value === 'STATIC'
  }
}
exports.ObjectMethodDeclarationStatementSyntaxNode = ObjectMethodDeclarationStatementSyntaxNode

/**
 * Represents an object type constructor.
 */
class ConstructorDeclarationStatementSyntaxNode extends ObjectMethodDeclarationStatementSyntaxNodeBase {
  constructor({ inheritance, constructor, functionKeyword, name, parameters, returnClause, unitModifiers }) {
    super(inheritance, constructor, functionKeyword, name, parameters, returnClause, unitModifiers)
    this.keyword = functionKeyword
    this.name = name
    this.inheritance = inheritance
    this.parameters = parameters
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
  /**
   * @param {TokenLike[]} tokens
   * @param {object} params
   * @param {string?} params.name How Oracle refers to this.  Oracle has compound keywords like `PUBLIC SYNONYM` and `PACKAGE BODY`, but in those the primary ones are `SYNONYM` and `PACKAGE BODY` respectively.
   */
  constructor(tokens, { name } = {}) {
    mustBeNonEmptyArray(tokens)
    super(...tokens)

    this.name = name?.toString() ?? tokens[0].value
  }

  /** @type {string} The canonical name of the type; e.g., `SYNONYM`. */ name
}

class DeclarationParameterExpressionSyntaxNode extends ExpressionSyntaxNode {

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
exports.DeclarationParameterExpressionSyntaxNode = DeclarationParameterExpressionSyntaxNode

class DeclarationParameterListExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {DeclarationParameterExpressionSyntaxNode[]} */ parameters

  /**
   *
   * @param {SyntaxNode} leftParen
   * @param {(DeclarationParameterExpressionSyntaxNode | SyntaxNode)?[]} parametersWithCommas
   * @param {SyntaxNode} rightParen
   */
  constructor(leftParen, parametersWithCommas, rightParen) {
    super(leftParen, ...parametersWithCommas, rightParen)
    this.parameters = parametersWithCommas.filter(x => x instanceof DeclarationParameterExpressionSyntaxNode)
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
 * <unit-kind>? <identifier>
 * ```
 */
class AccessorExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {SyntaxNode?} */ unitKind
  /** @type {IdentifierSyntaxNode} */ name

  constructor({ unitKind, name }) {
    super(unitKind, name)
    this.unitKind = unitKind
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

  /**
   *
   * @param {SyntaxNode} lparen
   * @param {SyntaxNode[]} accessorsWithCommas
   * @param {SyntaxNode} rparen
   */
  constructor(lparen, accessorsWithCommas, rparen) {
    super(lparen, ...accessorsWithCommas, rparen)
    this.accessors = accessorsWithCommas.filter(x => x instanceof AccessorExpressionSyntaxNode)
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
  /** @type {SyntaxNode?} The type's doc comment */ docComment
  /** @type {ObjectAttributeDeclarationExpressionSyntaxNode[]} */ attributes
  /** @type {ObjectMethodDeclarationStatementSyntaxNodeBase[]} */ methods

  constructor({ lparen, docComment, membersWithCommas, rparen }) {
    super(lparen, docComment, ...membersWithCommas, rparen)
    this.docComment = docComment
    this.attributes = membersWithCommas.filter(x => x instanceof ObjectAttributeDeclarationExpressionSyntaxNode)
    this.methods = membersWithCommas.filter(x => x instanceof ObjectMethodDeclarationStatementSyntaxNodeBase)
    console.assert(membersWithCommas.length === this.members.length + membersWithCommas.filter(x => x.toString() === ',').length, 'oops')
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

  /** @type {IdentifierSyntaxNode} */ name
  /** @type {InvocationParameterExpressionSyntaxNode[]} */ parameters

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
   * @param {object} params
   * @param {SyntaxNode} params.keyword
   * @param {IdentifierSyntaxNode} params.name
   * @param {InvocationParameterListExpressionSyntaxNode} params.parameters
   * @param {TerminatorSyntaxNode?} terminator
   * @returns {PragmaDeclarationStatementSyntaxNode} the created node
   */
  static create({ keyword, name, parameters, terminator }) {
    console.assert(keyword && name && parameters)
    switch (name.value) {
      /** @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/AUTONOMOUS_TRANSACTION-pragma.html */
      case 'AUTONOMOUS_TRANSACTION':
        return new PragmaDeclarationStatementSyntaxNode({ keyword, name, parameters, terminator, searchHints: PragmaDeclarationStatementSyntaxNode.#searchHintsByName[name.value] })
      /** @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/COVERAGE-pragma.html */
      case 'COVERAGE':
        return new PragmaDeclarationStatementSyntaxNode({ keyword, name, parameters, terminator, searchHints: PragmaDeclarationStatementSyntaxNode.#searchHintsByName[name.value] })
      /**
       * Named, but applies to previous or parent declaration.
       * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/DEPRECATE-pragma.html
       */
      case 'DEPRECATE':
        return new DeprecatePragmaDeclarationStatementSyntaxNode({ keyword, name, parameters, terminator })
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
        return new PragmaDeclarationStatementSyntaxNode({ keyword, name, parameters, terminator, searchHints: PragmaDeclarationStatementSyntaxNode.#searchHintsByName[name.value] })
      default:
        console.warn(`${keyword.textSpan} Unknown pragma '${name}'`, ...arguments)
        return new PragmaDeclarationStatementSyntaxNode({ keyword, name, parameters, terminator, searchHints: PragmaDeclarationStatementSyntaxNode.#searchHintsByName[name.value] })
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
   * @param {InvocationParameterListExpressionSyntaxNode} params.parameters
   * @param {TerminatorSyntaxNode} terminator
   * @param {SearchHint[]} searchHints
   */
  constructor({ keyword, name, parameters, terminator, searchHints }) {
    super(keyword, name, parameters, terminator)
    this.name = name
    this.parameters = parameters.parameters
    this.searchHints = searchHints
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
   * @param {object} params
   * @param {SyntaxNode} params.keyword
   * @param {IdentifierSyntaxNode} params.name
   * @param {InvocationParameterListExpressionSyntaxNode} params.parameters
   * @param {TerminatorSyntaxNode} terminator
   */
  constructor({ keyword, name, parameters, terminator }) {
    super({ keyword, name, parameters, terminator })

    // JSCRAP: I can decompose to variables but not members. Is that a real limitation or...?
    const [elementName, message] = parameters.parameters.map(p => p.value)
    this.elementName = elementName
    this.message = message
  }

  /**
   * @override
   * @param {DeclarationStatementSyntaxNode} node
   * @returns {boolean}
   */
  isMatch(node) {
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
    const { name, parameters, elementName, message } = this
    // DEPRECATE, really?
    return new Annotation('deprecated', target, message)
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
   * @param {object} params
   * @param {SyntaxNode} params.keyword
   * @param {IdentifierSyntaxNode} params.name
   * @param {InvocationParameterListExpressionSyntaxNode} params.parameters
   * @param {TerminatorSyntaxNode} terminator
   */
  constructor({ keyword, name, parameters, terminator }) {
    super({ keyword, name, parameters, terminator })

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
    return new Annotation(name.value, target, null, { exception, errorCode, errorId })
  }
}
exports.ExceptionInitPragmaDeclarationStatementSyntaxNode = ExceptionInitPragmaDeclarationStatementSyntaxNode

////////////////////

/**
 * Represents a parameter in an invocation.
 */
class InvocationParameterExpressionSyntaxNode extends ExpressionSyntaxNode {

  /** @type {IdentifierSyntaxNode?} */ name
  /** @type {AnyExpressionSyntaxNode} The parameter value expression */ value

  /**
   * @param {object} params
   * @param {IdentifierSyntaxNode?} params.name The parameter name in the invocation (optional).
   * @param {SyntaxNode?} params.arrow The parameter arrow in the invocation (optional).
   * @param {AnyExpressionSyntaxNode} params.value  The parameter value expression (required).
   */
  constructor({ name, arrow, value }) {
    super(name, arrow, value)
    this.name = name
    this.value = value
    console.assert(value instanceof ExpressionSyntaxNode || value instanceof IdentifierSyntaxNode || value instanceof LiteralSyntaxNode, `${value.textSpan}: must not be base class or Statement`)
  }
}
exports.InvocationParameterExpressionSyntaxNode = InvocationParameterExpressionSyntaxNode

/**
 * Represents a parameter list in an invocation.
 */
class InvocationParameterListExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {InvocationParameterExpressionSyntaxNode[]} */ parameters

  constructor(lparen, parametersWithCommas, rparen) {
    super(lparen, ...parametersWithCommas, rparen)
    this.parameters = parametersWithCommas.filter(x => x instanceof InvocationParameterExpressionSyntaxNode)
  }
}
exports.InvocationParameterListExpressionSyntaxNode = InvocationParameterListExpressionSyntaxNode

/**
 * Represents an invocation of a function, procedure, or similar.
 */
class InvocationExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {IdentifierSyntaxNode} */ name
  /** @type {InvocationParameterExpressionSyntaxNode[]} */ parameters

  /**
   * @param {IdentifierSyntaxNode} name
   * @param {InvocationParameterListExpressionSyntaxNode?} parameterList
   */
  constructor(name, parameterList) {
    super(name, parameterList)
    this.name = name
    this.parameters = parameterList?.parameters ?? []
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

  /**
   * @param {SyntaxNode} lparen
   * @param {ExpressionSyntaxNode} value
   * @param {SyntaxNode?} qualifier
   * @param {SyntaxNode} rparen
   */
  constructor(lparen, value, qualifier, rparen) {
    super(lparen, value, qualifier, rparen)
    this.value = value
    this.qualifier = qualifier
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

  /** @type {ExpressionSyntaxNode} */ value

  /**
   * @param {SyntaxNode} lparen
   * @param {ExpressionSyntaxNode} value
   * @param {SyntaxNode} rparen
   */
  constructor(lparen, value, rparen) {
    super(lparen, value, rparen)
    this.value = value
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

  /**
   * @param {SyntaxNode} lparen
   * @param {ExpressionSyntaxNode} precision
   * @param {SyntaxNode?} comma
   * @param {ExpressionSyntaxNode?} scale
   * @param {SyntaxNode} rparen
   */
  constructor(lparen, precision, comma, scale, rparen) {
    super(lparen, precision, comma, scale, rparen)
    this.precision = precision
    this.scale = scale
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
class DocumentCommentSyntaxNode extends SyntaxNode {
  constructor(...tokens) {
    super(...tokens)
  }
}
