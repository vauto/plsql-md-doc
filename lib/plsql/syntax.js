// @ts-check
const console = require('../debug').child(__filename)
const {
  InvalidNumberOfArgumentsError,
  mustBeInstanceOf,
  mustBeArray,
  mustBeNonEmptyString,
  mustBeObject,
  ofType,
} = require('../guards')
const {
  AnnotationNode,
  ExpressionSyntaxNode,
  IdentifierSyntaxNode,
  LiteralSyntaxNode,
  StatementSyntaxNode: StatementSyntaxNodeBase,
  SyntaxNode,
  SyntaxNodeReader,
  StructuredTriviaSyntaxNode,
  mustBeNamedSyntaxNode
} = require('../syntax')
const {
  Token,
  TokenSyntaxError,
  mustBeTokenLike
} = require('../token')

/**
 * @typedef {import('../syntax').AnyExpressionSyntaxNode} AnyExpressionSyntaxNode
 * @typedef {import('../syntax').NamedSyntaxNode} NamedSyntaxNode
 * @typedef {import('../syntax').SyntaxNodeOrToken} SyntaxNodeOrToken
 * @typedef {import('../syntax').SyntaxNodeOrTokenLike} SyntaxNodeOrTokenLike
 * @typedef {import('../syntax').SyntaxNodeOrTokenLikeOrIterable} SyntaxNodeOrTokenLikeOrIterable
 * @typedef {import('../token').TokenFormat} TokenFormat
 * @typedef {import('../token').TokenLike} TokenLike
 * @typedef {import('../token').TokenPattern} TokenPattern
 * @typedef {import('../name').ItemName} ItemName
 */




/**
 * Patterns for reserved words.
 */
class Patterns {

  /** Tokens of type `identifier`. */
  static IDENTIFIER = { type: 'identifier' }
  /** Tokens of type `keyword`. */
  static KEYWORD = { type: 'keyword' }
  static NUMBER_LITERAL = { type: 'number' }
  static STRING_LITERAL = { type: 'string' }
  static OPERATOR = { type: 'operator' }
  /** Tokens of type `reserved`. */
  static RESERVED = { type: 'reserved' }
  static NEWLINE = { type: 'newline' }


  /**
   * @param {TokenPattern & object} pattern
   * @returns {TokenPattern}
   */
  static inverse(pattern) { return { ...pattern, inverse: !pattern.inverse } }

  /**
   * @param {string} value
   * @returns {TokenPattern & { type: 'keyword', value: value }}
   */
  static keyword(value) { return { type: 'keyword', value } }
  /**
   * @param {string} value
   * @returns {TokenPattern & { type: 'operator', value: value }}
   */
  static operator(value) { return { type: 'operator', value } }
  /**
   * Makes a pattern for reserved words.
   * @param {string} value
   * @returns {TokenPattern & { type: 'reserved', value: value }}
   */
  static reserved(value) { return { type: 'reserved', value } }

  static ALL = this.reserved('ALL')
  static ALTER = this.reserved('ALTER')
  static AND = this.reserved('AND')
  static ANY = this.reserved('ANY')
  static AS = this.reserved('AS')
  static ASC = this.reserved('ASC')
  static AT = this.reserved('AT')
  static BEGIN = this.reserved('BEGIN')
  static BETWEEN = this.reserved('BETWEEN')
  static BY = this.reserved('BY')
  static CASE = this.reserved('CASE')
  static CHAR = this.reserved('CHAR')
  static CHECK = this.reserved('CHECK')
  static CLUSTER = this.reserved('CLUSTER')
  static CLUSTERS = this.reserved('CLUSTERS')
  static COLAUTH = this.reserved('COLAUTH')
  static COLUMNS = this.reserved('COLUMNS')
  static COMPRESS = this.reserved('COMPRESS')
  static CONNECT = this.reserved('CONNECT')
  static CRASH = this.reserved('CRASH')
  static CREATE = this.reserved('CREATE')
  static CURSOR = this.reserved('CURSOR')
  static DATE = this.reserved('DATE')
  static DECIMAL = this.reserved('DECIMAL')
  static DECLARE = this.reserved('DECLARE')
  static DEFAULT = this.reserved('DEFAULT')
  static DELETE = this.reserved('DELETE')
  static DESC = this.reserved('DESC')
  static DISTINCT = this.reserved('DISTINCT')
  static DROP = this.reserved('DROP')
  static ELSE = this.reserved('ELSE')
  static END = this.reserved('END')
  static EXCEPTION = this.reserved('EXCEPTION')
  static EXCLUSIVE = this.reserved('EXCLUSIVE')
  static EXISTS = this.reserved('EXISTS')
  static FETCH = this.reserved('FETCH')
  static FLOAT = this.reserved('FLOAT')
  static FOR = this.reserved('FOR')
  static FROM = this.reserved('FROM')
  static FUNCTION = this.reserved('FUNCTION')
  static GOTO = this.reserved('GOTO')
  static GRANT = this.reserved('GRANT')
  static GROUP = this.reserved('GROUP')
  static HAVING = this.reserved('HAVING')
  static IDENTIFIED = this.reserved('IDENTIFIED')
  static IF = this.reserved('IF')
  static IN = this.reserved('IN')
  static INDEX = this.reserved('INDEX')
  static INDEXES = this.reserved('INDEXES')
  static INSERT = this.reserved('INSERT')
  static INTEGER = this.reserved('INTEGER')
  static INTERSECT = this.reserved('INTERSECT')
  static INTO = this.reserved('INTO')
  static IS = this.reserved('IS')
  static LIKE = this.reserved('LIKE')
  static LOCK = this.reserved('LOCK')
  static LONG = this.reserved('LONG')
  static MINUS = this.reserved('MINUS')
  static MODE = this.reserved('MODE')
  static NOCOMPRESS = this.reserved('NOCOMPRESS')
  static NOT = this.reserved('NOT')
  static NOWAIT = this.reserved('NOWAIT')
  static NULL = this.reserved('NULL')
  static NUMBER = this.reserved('NUMBER')
  static OF = this.reserved('OF')
  static ON = this.reserved('ON')
  static OPTION = this.reserved('OPTION')
  static OR = this.reserved('OR')
  static ORDER = this.reserved('ORDER')
  static OVERLAPS = this.reserved('OVERLAPS')
  static PCTFREE = this.reserved('PCTFREE')
  static PRIOR = this.reserved('PRIOR')
  static PROCEDURE = this.reserved('PROCEDURE')
  static PUBLIC = this.reserved('PUBLIC')
  static RAW = this.reserved('RAW')
  static RENAME = this.reserved('RENAME')
  static RESOURCE = this.reserved('RESOURCE')
  static REVOKE = this.reserved('REVOKE')
  static SELECT = this.reserved('SELECT')
  static SET = this.reserved('SET')
  static SHARE = this.reserved('SHARE')
  static SIZE = this.reserved('SIZE')
  static SMALLINT = this.reserved('SMALLINT')
  static SQL = this.reserved('SQL')
  static START = this.reserved('START')
  static SUBTYPE = this.reserved('SUBTYPE')
  static SYNONYM = this.reserved('SYNONYM')
  static TABAUTH = this.reserved('TABAUTH')
  static TABLE = this.reserved('TABLE')
  static THEN = this.reserved('THEN')
  static TO = this.reserved('TO')
  static TRIGGER = this.reserved('TRIGGER')
  static TYPE = this.reserved('TYPE')
  static UNION = this.reserved('UNION')
  static UNIQUE = this.reserved('UNIQUE')
  static UPDATE = this.reserved('UPDATE')
  static VALUES = this.reserved('VALUES')
  static VARCHAR = this.reserved('VARCHAR')
  static VARCHAR2 = this.reserved('VARCHAR2')
  static VIEW = this.reserved('VIEW')
  static VIEWS = this.reserved('VIEWS')
  static WHEN = this.reserved('WHEN')
  static WHERE = this.reserved('WHERE')
  static WITH = this.reserved('WITH')

  static CONSTANT = this.keyword('CONSTANT')

  static OPEN_PAREN = this.operator('(')
  static CLOSE_PAREN = this.operator(')')
  static ASTERISK = this.operator('*')
  static ASSIGNMENT = this.operator(':=')
  static DOTDOT = this.operator('..')

  static PREPROCESSOR = {
    KEYWORD: { type: 'preprocessor.keyword' },
    THEN: { type: 'preprocessor.keyword', value: 'THEN' },
    END: { type: 'preprocessor.keyword', value: 'END' },
  }

  static INTERVAL = this.keyword('INTERVAL')
  static REF = this.keyword('REF')
  static RETURN = this.keyword('RETURN')
  static TIMESTAMP = this.keyword('TIMESTAMP')

  static Operators = {
    ARROW: this.operator('=>'),
    PLUS: this.operator('+'),
    MINUS: this.operator('-'),
    SEMICOLON: this.operator(';'),
    COLON: this.operator(':'),
    AT: this.operator('@'),
    PERIOD: this.operator('.'),
    COMMA: this.operator(','),
    AMPERSAND: this.operator('&'),
    DOUBLE_AMPERSAND: this.operator('&&'),
    PERCENT: this.operator('%')
  }

  static IDENTIFIER_DELIMITERS = [
    this.Operators.PERIOD,
    this.Operators.AT, // e.g., foo@myDB
    this.Operators.PERCENT // e.g., cur%ROWCOUNT, employees%ROWTYPE
  ]

  static SUBSTITUTION_OPERATORS = [
    this.Operators.AMPERSAND,
    this.Operators.DOUBLE_AMPERSAND
  ]

  static SLASH = this.operator('/')

  /** Loose reserved/keyword matching, where either is OK. */
  static ANY_KEYWORD = [this.RESERVED, this.KEYWORD]

  /** Loose identifier matching (allows keywords, a few reserved words) */
  static ANY_IDENTIFIER = [
    this.IDENTIFIER,
    this.KEYWORD,
    this.RESERVED
  ]

  static ANY_DEFAULT = [this.ASSIGNMENT, this.DEFAULT]

  // Loose operator matching
  static ANY_OPERATOR = this.OPERATOR
  static BINARY_OPERATOR = [
    this.Operators.PLUS,
    this.Operators.MINUS,
    '*', '/',
    '<', '=', '>', '<=', '>=', '<>', '!=',

    // String
    '||',
    Patterns.IN,
    Patterns.LIKE,

    //
    this.Operators.ARROW,

    // Binary operators that are words
    this.IS,    // x IS NULL
    this.OR,
    this.AND,

    // Period (for methods)
    this.Operators.PERIOD
  ]
  static NUMERIC_UNARY_OPERATOR = [
    this.Operators.PLUS,
    this.Operators.MINUS
  ]
  static UNARY_OPERATOR = [
    ...this.NUMERIC_UNARY_OPERATOR,
    this.NOT
  ]


  static END_OF_SQL_STATEMENT = [this.Operators.SEMICOLON, this.SLASH]

  static IS_OR_AS = [this.IS, this.AS]

  static PRAGMA = this.keyword('PRAGMA')
  static PACKAGE = this.keyword('PACKAGE') // yes, it's keyword.

  static METHOD_KIND = [this.FUNCTION, this.PROCEDURE]

  static PLSQL_UNIT_KIND = [
    this.FUNCTION, this.PROCEDURE, this.PACKAGE, this.TRIGGER, this.TYPE
  ]


  static EDITIONABLE = this.keyword('EDITIONABLE')
  static EDITIONING = this.keyword('EDITIONING')
  static NONEDITIONABLE = this.keyword('NONEDITIONABLE')

  /**
   * Patterns starting a SQL statement inside PL/SQL.
   * ```bnf
   * { commit_statement
   * | collection_method_call
   * | delete_statement
   * | insert_statement
   * | lock_table_statement
   * | merge_statement
   * | rollback_statement
   * | savepoint_statement
   * | set_transaction_statement
   * | update_statement
   * }
   */
  static SQL_IN_PLSQL = [
    'COMMIT',
    // collection_method_call: cannot put this here.
    this.DELETE,
    this.INSERT,
    this.LOCK,
    'MERGE',
    'ROLLBACK',
    'SAVEPOINT',
    this.SELECT,
    this.SET,
    this.UPDATE
  ]
}

/**
 * @typedef {SyntaxNodeOrToken | SyntaxNodeOrToken[]} NodeParamValue
 * @typedef {{[key: string]: NodeParamValue}} NamedNodeParams
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
   * Tries reading the next item as a doc comment for the surrounding unit.
   * @param {UnitType} unitType The unit type.
   * @returns {DocumentCommentSyntaxNode?}
   */
  #tryReadNextAsUnitDocComment(unitType) {
    mustBeNonEmptyString(unitType, 'unitType')
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

      switch (token.type) {
        case 'comment.doc.end':
          // We hit the end of a doc comment, consume the buffer and return it.
          // (This assumes the lexer input is correctly formed)
          this.iterator.skip(tokens.length)
          return new DocumentCommentSyntaxNode(...tokens)

        case 'comment.doc':
          // This is promising, but sniff the contents to should see if this actually applies to the unit,
          // or explicitly applies to the first member.
          switch (unitType) {
            case 'PACKAGE':
            case 'TYPE':
              if (token.value.match(/@(param|return|throws)\b/)) {
                // @param and @return would apply to a procedure/function, not a package or type
                console.log(`Comment appears to apply to member and not ${unitType}: ${token.value}`)
                return null
              }
              //// Sniff for more tagss we may want to match on.
              // for (const m of token.value.matchAll(/(@\w+)/g)) {
              //   console.warnOnce(m[0], `should we sniff ${m[0]} for ${unitType}?`)
              // }
              break
            default:
              // LATER: add sniffing for other unit types
              break
          }
      }

    }

    return null
  }

  // ---------------

  /**
   * Reads starting with the given token as a simple or compound identifier.
   * @param {TokenLike} token
   * @returns {IdentifierSyntaxNode}
   */
  #readAsIdentifier(token) {
    const tokens = [token]
    let /** @type {TokenLike[]?} */ nextTokens
    while (nextTokens = this.tryReadNextTokens(Patterns.IDENTIFIER_DELIMITERS, Patterns.ANY_IDENTIFIER)) {
      tokens.push(...nextTokens)
    }

    return new IdentifierSyntaxNode(...tokens)
  }

  /**
   * Tries reading the next item as a simple or compound identifier.
   * @returns {IdentifierSyntaxNode?}
   */
  #tryReadNextAsIdentifier() {
    return this.tryReadNextAs(this.#readAsIdentifier, Patterns.ANY_IDENTIFIER)
  }

  /**
   * Reads the next item as an identifier.
   * @returns {IdentifierSyntaxNode}
   */
  #readNextAsIdentifier() {
    return this.readNextAs(this.#readAsIdentifier, Patterns.ANY_IDENTIFIER)
  }

  // ---------------

  /**
   * Reads starting with the given token as a bind variable expression.
   * @param {TokenLike} colonToken `:`
   * ```bnf
   * ":" (identifier | number)
   * ```
   */
  #readAsBindVariableExpression(colonToken) {
    return new ExpressionSyntaxNode(colonToken, this.#tryReadNextAsIdentifier() ?? this.#readNextAsNumberLiteral())
  }

  /**
   * Tries reading the next item as a bind variable expression.
   * @returns {ExpressionSyntaxNode?}
   *
   * ```bnf
   * ("&" | "&&") (identifier | number)
   * ```
   */
  #tryReadNextAsBindVariableExpression() {
    const colonToken = this.tryReadNextToken(Patterns.Operators.COLON)
    return colonToken ? this.#readAsBindVariableExpression(colonToken) : null
  }

  /**
   * Reads starting with the given token as a substitution variable expression.
   * @param {TokenLike} substitutionToken `&`, `&&`
   * ```bnf
   * ("&" | "&&") (identifier | number) ["."]
   * ```
   */
  #readAsSubstitutionVariableExpression(substitutionToken) {
    const value = this.#tryReadNextAsIdentifier() ?? this.#readNextAsNumberLiteral()
    // "." is an optional terminator in case the substitution is to be evaluated mid-word.
    // E.g. `CREATE TABLE &&foo (id integer, constraint &&foo._PK primary key (Id))`

    const period = this.tryReadNextToken(Patterns.Operators.PERIOD)
    return new ExpressionSyntaxNode(substitutionToken, value, period)
  }

  /**
   * Tries reading the next item as a substitution variable expression.
   * @returns {ExpressionSyntaxNode?}
   *
   * ```bnf
   * ("&" | "&&") (identifier | number)
   * ```
   */
  #tryReadNextAsSubstitutionVariableExpression() {
    const substitutionToken = this.tryReadNextToken(Patterns.SUBSTITUTION_OPERATORS)
    return substitutionToken ? this.#readAsSubstitutionVariableExpression(substitutionToken) : null
  }

  // ---------------

  /**
   * Reads starting with the given token as a string literal.
   * @param {TokenLike} token
   * @returns {LiteralSyntaxNode}
   */
  #readAsStringLiteral(token) {
    Token.mustMatch(Patterns.STRING_LITERAL, token)
    return new LiteralSyntaxNode(token)
  }

  /**
   * Tries reading the next item as a string literal.
   * @returns {LiteralSyntaxNode?}
   */
  #tryReadNextAsStringLiteral() {
    return this.tryReadNextAs(this.#readAsStringLiteral, Patterns.STRING_LITERAL)
  }

  /**
   * Reads the next item as a string literal.
   * @returns {LiteralSyntaxNode}
   */
  #readNextAsStringLiteral() {
    return this.readNextAs(this.#readAsStringLiteral, Patterns.STRING_LITERAL)
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
   * @returns {TokenLike?}
   */
  #tryReadNextAsCommaToken() {
    return this.tryReadNextToken(Patterns.Operators.COMMA)
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
    Token.mustMatch({ type: 'reserved', value: 'CREATE' }, createKeyword)

    // OR REPLACE
    const createNode = new SyntaxNode(
      createKeyword,
      this.tryReadNextTokens('OR', 'REPLACE')
    )

    const editionable = this.#tryReadNextAsEditionableClause()
    const unitType = this.#tryReadNextAsUnitType()
    const ifNotExists = this.#tryReadNextAsIfNotExists()

    switch (unitType.name) {
      case 'FUNCTION':
      case 'PROCEDURE':
        return this.#readRestOfStandaloneMethod(createNode, editionable, unitType, ifNotExists)
      case 'PACKAGE':
        return this.#readRestOfPackageSpec(createNode, editionable, unitType, ifNotExists)
      case 'PACKAGE BODY':
        return this.#readRestOfPackageBody(createNode, editionable, unitType, ifNotExists)
      case 'TYPE':
        return this.#readRestOfTypeSpec(createNode, editionable, unitType, ifNotExists)
      case 'SYNONYM':
        return this.#readRestOfSynonym(createNode, editionable, unitType, ifNotExists)
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
   * Tries reading the next item as the SQL or PL/SQL unit type (e.g. `TABLE`, `PROCEDURE`).
   * @returns {UnitTypeSyntaxNode?}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/
   */
  #tryReadNextAsUnitType() {
    // Some unit types are reserved words, others are not.
    // Look for the kinds we properly support first.
    let typeToken = this.tryReadNextToken([
      'PACKAGE',
      'TYPE',
      'FUNCTION',
      'PROCEDURE',
      'TRIGGER',

      // Other single-word unit types
      'ANALYTIC',
      'CLUSTER',
      'CONTEXT',
      'CONTROLFILE',
      'DATABASE',
      'DIMENSION',
      'DISKGROUP',
      'DOMAIN',
      'EDITION',
      'HIERARCHY',
      'INDEX', // UNIQUE/BITMAP/MULTIVALUE: see below
      'INDEXTYPE',
      'JAVA',
      'LIBRARY',
      'OPERATOR',
      'OUTLINE',
      'PFILE',
      'PROFILE',
      'ROLE',
      'SCHEMA',
      'SEQUENCE',
      'SPFILE',
      'TABLE',
      'TABLESPACE',
      'USER',
      'VIEW'
    ])

    if (typeToken) {
      switch (typeToken.value) {
        case 'PACKAGE':
        case 'TYPE':
          // MAY be BODY
          return new UnitTypeSyntaxNode([typeToken, this.tryReadNextToken('BODY')])
        case 'DATABASE':
          // MAY be DATABASE LINK
          return new UnitTypeSyntaxNode([typeToken, this.tryReadNextToken('LINK')])
        case 'TABLESPACE':
          // MAY be TABLESPACE SET
          return new UnitTypeSyntaxNode([typeToken, this.tryReadNextToken('SET')])
        default:
          return new UnitTypeSyntaxNode([typeToken])
      }
    }

    // Multi-word types (every word is part of the unit type)
    let typeTokens = this.tryReadNextTokens('ANALYTIC', 'VIEW')
      ?? this.tryReadNextTokens('AUDIT', 'POLICY')
      ?? this.tryReadNextTokens('FLASHBACK', 'ARCHIVE')
      ?? this.tryReadNextTokens('INMEMORY', 'JOIN', 'GROUP')
      ?? this.tryReadNextTokens('JSON', 'DUALITY', 'VIEW')
      ?? this.tryReadNextTokens('JSON', 'RELATIONAL', 'DUALITY', 'VIEW')
      ?? this.tryReadNextTokens('LOCKDOWN', 'PROFILE')
      ?? this.tryReadNextTokens('LOGICAL', 'PARTITION', 'TRACKING')
      ?? this.tryReadNextTokens('MATERIALIZED', 'VIEW', 'LOG')
      ?? this.tryReadNextTokens('MATERIALIZED', 'VIEW')
      ?? this.tryReadNextTokens('MATERIALIZED', 'ZONEMAP')
      ?? this.tryReadNextTokens('MLE', ['ENV', 'MODULE'])


    if (typeTokens) {
      return new UnitTypeSyntaxNode(typeTokens)
    }

    // [modifier...] {unit-type}
    typeTokens = this.tryReadNextTokens(['BITMAP', 'MULTIVALUE', 'UNIQUE'], 'INDEX')
      ?? this.tryReadNextTokens(['GLOBAL', 'PRIVATE'], 'TEMPORARY', 'TABLE')
      ?? this.tryReadNextTokens(['BLOCKCHAIN', 'IMMUTABLE', 'SHARDED', 'DUPLICATED'], 'TABLE')
      ?? this.tryReadNextTokens('IMMUTABLE', 'BLOCKCHAIN', 'TABLE')
      ?? this.tryReadNextTokens('PUBLIC', 'SYNONYM')
    if (typeTokens) {
      return new UnitTypeSyntaxNode(typeTokens, typeTokens.at(-1).value)
    }

    return null
  }

  // -----------------------------------
  // SQL unit common
  // -----------------------------------

  /**
   * Reads starting with the given token as an opaque SQL statement.
   * NOTE: will not work for multi-semicolon units like PL/SQL units.
   * @param {TokenLike} token The first token.
   * @param {...SyntaxNodeOrTokenLike} nodesOrTokens  Additional nodes/tokens.
   * @returns {StatementSyntaxNode}
   */
  #readAsOpaqueSqlStatement(token, ...nodesOrTokens) {
    return new SqlStatementSyntaxNode(token, ...nodesOrTokens, ...this.readNextTokensUntil(Patterns.END_OF_SQL_STATEMENT))
  }

  /**
   * Reads the next item as an opaque SQL statement, up to the terminator.  NOTE: will not work for multi-semicolon units like PL/SQL units.
   * @param {...SyntaxNodeOrTokenLike} nodesOrTokens
   * @returns {SqlStatementSyntaxNode}
   */
  #readNextAsOpaqueSqlStatement(...nodesOrTokens) {
    return new SqlStatementSyntaxNode(...nodesOrTokens, ...this.readNextTokensUntil(Patterns.END_OF_SQL_STATEMENT))
  }

  /**
   * Tries reading the next token as the slash token (`/`).
   * @returns {TokenLike?} `/` or null
   */
  #tryReadNextAsSlashToken() {
    return this.tryReadNextToken(Patterns.SLASH)
  }

  // SQL statements

  /**
   * Reads the rest of the `CREATE SYNONYM` statement.
   * @param {SyntaxNode} create `CREATE`
   * @param {SyntaxNode} editionable `EDITIONABLE` clause
   * @param {UnitTypeSyntaxNode} unitType `SYNONYM` or `PUBLIC SYNONYM`
   * @param {SyntaxNode?} ifNotExists `IF NOT EXISTS`
   * @returns {SqlStatementSyntaxNode}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/CREATE-SYNONYM.html
   */
  #readRestOfSynonym(create, editionable, unitType, ifNotExists) {
    return this.#readNextAsOpaqueSqlStatement(create, editionable, unitType, ifNotExists)
  }

  // -----------------------------------
  // PL/SQL unit common
  // -----------------------------------

  /**
   * Reads starting with the given token as an opaque PL/SQL statement.
   * @param {TokenLike} token
   * @returns {StatementSyntaxNode} The opaque statement.
   */
  #readAsOpaquePlsqlStatement(token) {
    return new StatementSyntaxNode(token, ...this.readNextTokensUntil(Patterns.Operators.SEMICOLON))
  }

  /**
   * Tries reading the next item as a PL/SQL statement terminator (`;`).
   * @returns {TokenLike?} The terminating semicolon, if any.
   */
  #tryReadNextAsSemicolonToken() {
    return this.tryReadNextToken(Patterns.Operators.SEMICOLON)
  }

  // ---------------

  /**
   * Tries reading the next item as the unit kind from an `ACCESSIBLE BY` accessor declaration.
   * @returns {UnitTypeSyntaxNode?}
   * ```bnf
   * unit_kind
   * ```
   */
  #tryReadNextAsAccessorUnitKind() {
    return this.#tryReadNextAsUnitType()
  }

  /**
   * Tries reading the next item as single `ACCESSIBLE BY (...)` accessor declaration.
   * ```bnf
   * [ unit_kind ] [schema.]unit_name
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
   * @returns {Generator<AccessorExpressionSyntaxNode | TokenLike>}
   * @yields {AccessorExpressionSyntaxNode | TokenLike}
   */
  *#readNextAsAccessorsWithCommas() {
    let accessor = this.#tryReadNextAsAccessor()
    if (!accessor) {
      return
    }

    yield accessor

    let comma
    while (accessor && (comma = this.#tryReadNextAsCommaToken())) {
      yield comma
      yield accessor = this.#tryReadNextAsAccessor()
    }
  }

  /**
   * Tries reading the next item as the list portion of an `ACCESSIBLE BY (...)` clause.
   * ```bnf
   * ( accessor [, accessor ]... )
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
   * ```bnf
   * ACCESSIBLE BY ( accessor [, accessor ]... )
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
   * @returns {UnitModifierExpressionSyntaxNode?}
   * ```text
   * DEFAULT COLLATION [USING_NLS_COMP]
   * ```
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/DEFAULT-COLLATION-clause.html
   */
  #tryReadNextAsDefaultCollationClause() {
    const tokens = this.tryReadNextTokens('DEFAULT', 'COLLATION', 'USING_NLS_COMP')
    return tokens ? new UnitModifierExpressionSyntaxNode(tokens) : null
  }

  /**
   * Tries reading the next item as a `DETERMINISTIC` clause from a declaration modifier.
   * ```text
   * DETERMINSTIC
   * ```
   * @returns {UnitModifierExpressionSyntaxNode?}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/DETERMINISTIC-clause.html
   */
  #tryReadNextAsDeterministicClause() {
    const t = this.tryReadNextToken('DETERMINISTIC')
    return t ? new UnitModifierExpressionSyntaxNode(t) : null
    const o = this.tryReadNextAs(t => new UnitModifierExpressionSyntaxNode(t), 'DETERMINSTIC')
    return o
  }

  /**
   * Tries reading the next item as an invoker right's and definer right's clause (aka an `AUTHID` clause).
   * ```text
   * AUTHID [DEFINER|CURRENT_USER]
   * ```
   * @returns {UnitModifierExpressionSyntaxNode?}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/invokers_rights_clause.html
   */
  #tryReadNextAsInvokerRightsClause() {
    let tokens = this.tryReadNextTokens('AUTHID', Patterns.KEYWORD)
    return tokens ? new UnitModifierExpressionSyntaxNode(tokens) : null
  }

  /**
   * Tries reading the next item as a `PARALLEL_ENABLE` clause from a declaration modifier.
   * ```text
   * PARALLEL_ENABLE [partition-by-clause]?
   * ```
   * @returns {UnitModifierExpressionSyntaxNode?}
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

    return new UnitModifierExpressionSyntaxNode(parallelEnable)
  }

  /**
   * Tries reading the next item as a `PIPELINED` clause from a declaration modifier.
   * @returns {UnitModifierExpressionSyntaxNode?}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/PIPELINED-clause.html
   * ```bnf
   * PIPELINED
   * { [ USING [schema.] implementation_type ]
   * | { ROW | TABLE } POLYMORPHIC [ USING [schema.] implementation_package ]
   * }
   * ```
   *
   * @remarks
   * The documentation mentions that `PIPELINED` MAY be followed by `{ IS | USING }`,
   * but the `IS` section is just the standard `IS` keyword from the function definition,
   * _not_ part of the `PIPELINED` clause.
   */
  #tryReadNextAsPipelinedClause() {
    const pipelined = this.tryReadNextToken('PIPELINED')
    if (!pipelined) {
      return null
    }

    const polymorphic = this.tryReadNextTokens(['ROW', 'TABLE'], 'POLYMORPHIC')
    const usingKeyword = this.tryReadNextToken('USING')
    if (usingKeyword) {
      return new UnitModifierExpressionSyntaxNode(pipelined, polymorphic, usingKeyword, this.#readNextAsIdentifier())
    } else {
      return new UnitModifierExpressionSyntaxNode(pipelined, polymorphic)
    }
  }

  /**
   * Tries reading the next item as a `SHARING` clause from a declaration modifier.
   * @returns {UnitModifierExpressionSyntaxNode?}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/SHARING-clause.html
   * ```bnf
   * SHARING = { METADATA | NONE }
   * ```
   */
  #tryReadNextAsSharingClause() {
    const tokens = this.tryReadNextTokens('SHARING', '=', ['METADATA', 'NONE'])
    return tokens ? new UnitModifierExpressionSyntaxNode(tokens) : null
  }

  /**
   * Tries reading the next item as a `RESULT_CACHE` clause declaration modifier.
   * @returns {UnitModifierExpressionSyntaxNode?}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/RESULT_CACHE-clause.html
   * ```bnf
   * RESULT_CACHE [ RELIES_ON ( [ data_source [, data_source]... ] )
   * ```
   */
  #tryReadNextAsResultCacheClause() {
    const keyword = this.tryReadNextToken('RESULT_CACHE')
    if (!keyword) {
      return null
    }

    // RESULT_CACHE [RELIES_ON ([data_source, ...]?)]?
    const reliesOn = this.tryReadNextToken('RELIES_ON')
    if (reliesOn) {
      // RELIES_ON clause is found, but it is deprecated.
      // Eat and move on.
      return new UnitModifierExpressionSyntaxNode(keyword, reliesOn, this.#readNextAsOpenParenToken(), this.readNextTokensUntil(Patterns.CLOSE_PAREN))
    }

    return new UnitModifierExpressionSyntaxNode(keyword)
  }

  /**
   * Tries reading the next item as an aggregate clause declaration modifier.
   * @returns {UnitModifierExpressionSyntaxNode?}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/AGGREGATE-clause.html
   * ```bnf
   * AGGREGATE USING [ schema. ] implementation_type
   * ```
   */
  #tryReadNextAsAggregateClause() {
    const keywords = this.tryReadNextTokens('AGGREGATE', 'USING')
    if (!keywords) {
      return null
    }

    return new UnitModifierExpressionSyntaxNode(keywords, this.#tryReadNextAsIdentifier())
  }

  /**
   * Tries reading the next item as a shard enable clause declaration modifier.
   * @returns {UnitModifierExpressionSyntaxNode?}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/SHARD_ENABLE-clause.html
   * ```bnf
   * SHARD_ENABLE
   * ```
   */
  #tryReadNextAsShardEnableClause() {
    return this.tryReadNextAs(t => new UnitModifierExpressionSyntaxNode(t), 'SHARD_ENABLE')
  }

  /**
   * Tries reading the next item as a SQL macro clause declaration modifier.
   * @returns {UnitModifierExpressionSyntaxNode?}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/SQL_MACRO-clause.html
   * ```bnf
   * SQL_MACRO { ( { TYPE => } ( SCALAR | TABLE ) ) }
   * ```
   */
  #tryReadNextAsSqlMacroClause() {
    const sqlMacroToken = this.tryReadNextToken('SQL_MACRO')
    if (!sqlMacroToken) {
      return null
    }

    const openParenToken = this.#tryReadNextAsOpenParenToken()
    if (!openParenToken) {
      return new UnitModifierExpressionSyntaxNode(sqlMacroToken)
    }

    return new UnitModifierExpressionSyntaxNode(
      sqlMacroToken,
      openParenToken,
      ...this.tryReadNextTokens('TYPE', '=>'),
      ...this.readNextTokens(['SCALAR', 'TABLE'], ')')
    )
  }

  /**
   * Tries reading the next item as a declaration modifier for a top-level unit.
   * @returns {UnitModifierExpressionSyntaxNode?}
   * <p>
   * NOTE: not all clauses may apply to an object, we are just parsing them as if they are to make the code slightly less complicated.
   */
  #tryReadNextAsUnitDeclarationModifier() {
    return this.#tryReadNextAsSharingClause()
      ?? this.#tryReadNextAsInvokerRightsClause()
      ?? this.#tryReadNextAsAccessibleByClause()
      ?? this.#tryReadNextAsDefaultCollationClause()
      ?? this.#tryReadNextAsDeterministicClause()
      ?? this.#tryReadNextAsShardEnableClause()
      ?? this.#tryReadNextAsParallelEnableClause()
      ?? this.#tryReadNextAsResultCacheClause()
      ?? this.#tryReadNextAsAggregateClause()
      ?? this.#tryReadNextAsPipelinedClause()
      ?? this.#tryReadNextAsSqlMacroClause()
  }

  /**
   * Reads a sequence of zero or more unit declaration modifiers.
   * @returns {Generator<UnitModifierExpressionSyntaxNode>}
   * @yields {UnitModifierExpressionSyntaxNode}
   * <p>
   * NOTE: not all clauses may apply to an object, we are just parsing them as if they are to make the code slightly less complicated.
   */
  *#readNextAsUnitDeclarationModifiers() {
    let /** @type {UnitModifierExpressionSyntaxNode?} */ modifier
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
    const nameAndArrow = this.tryReadNextTokens(Patterns.ANY_IDENTIFIER, Patterns.Operators.ARROW)
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
   * @returns {Generator<InvocationParameterExpressionSyntaxNode | TokenLike>}
   * @yields {SyntaxNode}
   */
  *#readNextAsInvocationParametersWithCommas() {
    let param = this.#tryReadNextAsInvocationParameter()
    if (!param) {
      return
    }

    yield param

    let comma
    while (param && (comma = this.#tryReadNextAsCommaToken())) {
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
   * Reads starting with the given token as an identifier optionally used as an invocation
   * of a procedure, function, cursor, method, pseudofunction, or similar.
   * @param {TokenLike} token The first token in the identifier.
   * @returns {InvocationExpressionSyntaxNode | IdentifierSyntaxNode}
   * <p>
   * Note we currently don't have a good way to distinguish between a function invoked without parentheses and a standalone identifier.
   */
  #readAsInvocation(token) {
    const identifier = this.#readAsIdentifier(token)
    const parameterList = this.#tryReadNextAsInvocationParameterList()
    if (!parameterList) {
      // Just an identifier
      return identifier
    }

    return new InvocationExpressionSyntaxNode(identifier, parameterList)
  }

  /**
   * Tries reading the next item as an identifier used as an invocation
   * of a procedure, function, cursor, method, pseudofunction, or similar.
   * @returns {InvocationExpressionSyntaxNode | IdentifierSyntaxNode | BinaryExpressionSyntaxNode}
   * @deprecated
   */
  #tryReadNextAsInvocationChain() {
    return this.tryReadNextAs(this.#readAsInvocationChain, Patterns.ANY_IDENTIFIER)
  }

  /**
   * Reads starting with the given token as an identifier optionally used as an invocation
   * of a procedure, function, cursor, method, pseudofunction, or similar.
   * @param {TokenLike} token The first token in the identifier.
   * @returns {InvocationExpressionSyntaxNode | IdentifierSyntaxNode | BinaryExpressionSyntaxNode}
   * @deprecated
   * <p>
   * Note we currently don't have a good way to distinguish between a function invoked without parentheses and a standalone identifier.
   */
  #readAsInvocationChain(token) {
    const invocation = this.#readAsInvocation(token)
    const dotToken = this.tryReadNextToken(Patterns.Operators.PERIOD)
    if (dotToken) {
      return new BinaryExpressionSyntaxNode(invocation, dotToken, this.#tryReadNextAsValueExpression())
    }

    return invocation
  }

  // ---------------------------------------------
  // PL/SQL block unit common
  // ---------------------------------------------

  /**
   * @returns {StatementSyntaxNode?}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/block.html#GUID-9ACEB9ED-567E-4E1A-A16A-B8B35214FC9D__CJACGHDD
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/block.html#GUID-9ACEB9ED-567E-4E1A-A16A-B8B35214FC9D__CJABJCGE
   */
  #tryReadNextAsDeclaration() {
    // Oracle distinguishes between "item_list_1" and "item_list_2".  There's no real need to here.

    // We look for any identifier, keyword, or a strict list of reserved words.
    // We don't search all reserved words because a) Oracle shouldn't allow them bare here, and b) we don't want to scoop up BEGIN or END.
    const token = this.tryReadNextToken(['SUBTYPE', 'TYPE', 'PRAGMA', 'CURSOR', 'FUNCTION', 'PROCEDURE', Patterns.IDENTIFIER, Patterns.KEYWORD])
    if (!token) {
      return null
    }
    switch (token.value) {
      case 'SUBTYPE':
        return this.#readAsSubtypeDeclaration(token)
      case 'TYPE':
        return this.#readAsTypeDeclaration(token)
      case 'PROCEDURE':
      case 'FUNCTION':
        return this.#readAsMethodDeclaration(token)
      case 'PRAGMA':
        return this.#readAsPragmaDeclaration(token)
      case 'CURSOR':
        return this.#readAsCursorDeclarationOrDefinition(token)
      default:
        // Just treat this as an identifier, it's probably a constant, variable, or exception.
        return this.#readAsVariableDeclaration(token)
    }
  }

  /**
   * Reads any and all declarations from a declare section (implicit or explicit).
   * @returns {Generator<StatementSyntaxNode>}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/block.html#GUID-9ACEB9ED-567E-4E1A-A16A-B8B35214FC9D__CJACGHDD
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/block.html#GUID-9ACEB9ED-567E-4E1A-A16A-B8B35214FC9D__CJABJCGE
   */
  *#readAllDeclarations() {
    let statement
    while (statement = this.#tryReadNextAsDeclaration()) {
      yield statement
    }
  }

  /**
   * Reads starting with the given token as a PL/SQL `DECLARE` keyword followed by a declare section.
   * @param {TokenLike} declareToken
   * @returns {DeclareSectionSyntaxNode}
   */
  #readAsDeclareSection(declareToken) {
    return new DeclareSectionSyntaxNode(declareToken, ...this.#readAllDeclarations())
  }

  #tryReadNextAsImplicitDeclareSelection() {
    // See if there are any declarations.
    // There will not be an explicit `DECLARE` keyword, so just see if we can read any declarations.
    const declarations = [...this.#readAllDeclarations()]
    return declarations.length ? new DeclareSectionSyntaxNode(null, ...declarations) : null
  }

  // ---------------

  /**
   * ```bnf
   * END LOOP [ label ] ;
   * ```
   */
  #readNextAsEndLoopExpression() {
    return new ExpressionSyntaxNode(
      ...this.readNextTokens(Patterns.END, 'LOOP'),
      this.#tryReadNextAsIdentifier(),
      this.#tryReadNextAsSemicolonToken()
    )
  }

  /**
   * @param {TokenLike} loopKeyword `LOOP`
   * @returns {StatementSyntaxNode}
   */
  #readAsBasicLoopStatement(loopKeyword) {
    // No frills or checks yet.
    return new StatementSyntaxNode(loopKeyword,
      ...this.#readAllPlsqlStatements(),
      this.#readNextAsEndLoopExpression()
    )
  }

  /**
   * @param {TokenLike} forKeyword `FOR`
   * @returns {StatementSyntaxNode}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/cursor-FOR-LOOP-statement.html
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/FOR-LOOP-statement.html
   */
  #readAsForLoopStatement(forKeyword) {
    // No frills or checks yet.
    const indexInRangeLoop = this.readNextTokensUntil('LOOP')
    return new StatementSyntaxNode(forKeyword,
      ...indexInRangeLoop,
      ...this.#readAllPlsqlStatements(),
      this.#readNextAsEndLoopExpression()
    )
  }

  /**
   * @param {TokenLike} whileKeyword
   * @returns {StatementSyntaxNode}
   * ```bnf
   * WHILE boolean_expression
   *   LOOP statement... END LOOP [ label ] ;
   * ```
   */
  #readAsWhileLoopStatement(whileKeyword) {
    // No frills or checks yet.
    return new StatementSyntaxNode(whileKeyword,
      this.#readNextAsValueExpression(),
      this.readNextToken('LOOP'),
      ...this.#readAllPlsqlStatements(),
      this.#readNextAsEndLoopExpression()
    )
  }

  /**
   * @returns {ExpressionSyntaxNode}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/FORALL-statement.html
   * ```bnf
   * { lower_bound .. upper_bound
   * | INDICES OF collection [ BETWEEN lower_bound AND upper_bound ]
   * | VALUES OF index_collection
   * }
   * ```
   */
  #tryReadNextAsBoundsClause() {
    throw this.notImplemented()
  }

  /**
   * @param {TokenLike} forallToken
   * @returns {StatementSyntaxNode}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/FORALL-statement.html
   *
   * ```bnf
   * FORALL index IN bounds_clause [ SAVE EXCEPTIONS ] dml_statement;
   * ```
   */
  #readAsForallStatement(forallToken) {
    return this.#readAsOpaquePlsqlStatement(forallToken)
    // const index = this.#readNextAsIdentifier()
    // const inKeyword = this.readNextToken('IN')
    // const boundsClause = this.#tryReadNextAsBoundsClause()
    // const saveExceptions = this.tryReadNextTokens('SAVE', 'EXCEPTIONS')
    // const dml_statement =
    // const indexInRangeLoop = this.readNextTokensUntil('LOOP')
    // return new StatementSyntaxNode(forallToken,
    //   ...indexInRangeLoop,
    //   ...this.#readAllPlsqlStatements(),
    // )
  }


  // ---------------

  *#readAllElsifExpressions() {
    let elsifToken
    while (elsifToken = this.tryReadNextToken('ELSIF')) {
      yield new ExpressionSyntaxNode(
        elsifToken,
        this.#readNextAsValueExpression(),
        this.readNextToken('THEN'),
        [...this.#readAllPlsqlStatements()]
      )
    }
  }

  #tryReadNextAsElseExpression() {
    const elseKeyword = this.tryReadNextToken('ELSE')
    return elseKeyword ? new ExpressionSyntaxNode(elseKeyword, ...this.#readAllPlsqlStatements()) : null
  }

  /**
   * @returns {ExpressionSyntaxNode?}
   * ```bnf
   * WHEN boolean_expression THEN
   * ```
   */
  #tryReadNextWhenBooleanExpressionThenClause() {
    const whenToken = this.tryReadNextToken('WHEN')
    if (!whenToken) {
      return null
    }

    return new ExpressionSyntaxNode(
      whenToken,
      this.#tryReadNextAsValueExpression(),
      this.tryReadNextToken('THEN')
    )
  }

  /**
   * Tries reading the next item as a dangling predicate.
   *
   * A dangling_predicate is an ordinary expression with its left operand missing, for example, `< 2`.
   * Using a dangling_predicate allows for more complicated comparisons that would otherwise require a searched CASE statement.
   *
   * @returns {ExpressionSyntaxNode?}
   * ```bnf
   * operator value_expression
   * ```
   *
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/plsql-control-statements.html#GUID-3937FEB2-96A1-456B-AD9E-09B627DF0939
   */
  #tryReadNextAsDanglingPredicate() {
    const operator = this.#tryReadNextAsBinaryOperatorToken()
    return operator ? new ExpressionSyntaxNode(operator, this.#tryReadNextAsValueExpression()) : null
  }

  /**
   * ```bnf
   * (selector_value | dangling_predicate)
   * [, selector_value | dangling_predicate]...
   * ```
   */
  #tryReadNextAsCaseMatchList() {
    return new ExpressionSyntaxNode(...this.readAllAs(
      () => this.#tryReadNextAsValueExpression() ?? this.#tryReadNextAsDanglingPredicate()
    ))
  }

  /**
   * Reads the next item as the `END CASE` statement.
   * ```bnf
   * END CASE [ label ] ;
   * ```
   */
  #readNextAsEndCaseExpression() {
    return new ExpressionSyntaxNode(
      ...this.readNextTokens(Patterns.END, 'CASE'), // END CASE
      this.#tryReadNextAsIdentifier(),
      this.#tryReadNextAsIdentifier()     // [label]
    )
  }

  /**
   * Reads a searched `CASE` statement.
   * @param {TokenLike} caseToken `CASE`
   * @returns {StatementSyntaxNode}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/CASE-statement.html
   *
   * ```bnf
   * CASE
   *   WHEN boolean_expression THEN statement [ statement ]... ;
   *     [ WHEN boolean_expression THEN statement [ statement ]... ; ]...
   *       [ ELSE statement [ statement ]... ;
   *         END CASE [ label ];
   * ```
   *
   * @remarks
   * `CASE` statements and expressions are subtly different to where parsing them separately works best.
   */
  #readAsSearchedCaseStatement(caseToken) {
    // [WHEN .. THEN]...
    const clauses = []
    let whenKeyword
    while (whenKeyword = this.tryReadNextToken('WHEN')) {
      const expression = this.#tryReadNextAsValueExpression(),
        thenKeyword = this.tryReadNextToken('THEN')
      clauses.push(new ExpressionSyntaxNode(whenKeyword, expression, thenKeyword, ...this.#readAllPlsqlStatements()))
    }

    // [ELSE]
    const elseKeyword = this.tryReadNextToken('ELSE')
    if (elseKeyword) {
      clauses.push(new ExpressionSyntaxNode(elseKeyword, ...this.#readAllPlsqlStatements()))
    }

    return new StatementSyntaxNode(
      caseToken, ...clauses,
      this.#readNextAsEndCaseExpression(),   // END CASE [label]
      this.#tryReadNextAsSemicolonToken()   // ;
    )
  }

  /**
   * Reads a `CASE` statement.
   * @param {TokenLike} caseToken `CASE`
   * @param {AnyExpressionSyntaxNode} selector  The selector for the case statement.
   * @returns {StatementSyntaxNode}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/CASE-statement.html
   *
   * ```bnf
   * CASE selector WHEN (selector_value | dangling_predicate)
   *   [, selector_value | dangling_predicate]... THEN statement[statement]...;
   *     [WHEN (selector_value | dangling_predicate)
   *       [, selector_value | dangling_predicate]... THEN statement[statement]...;]...
   *   [ELSE statement[statement]...] END CASE [label] ;
   * ```
   *
   * @remarks
   * `CASE` statements and expressions are subtly different to where parsing them separately works best.
   */
  #readAsSimpleCaseStatement(caseToken, selector) {
    // [WHEN .. THEN]...
    const clauses = []
    let whenKeyword
    while (whenKeyword = this.tryReadNextToken('WHEN')) {
      const matchList = this.#tryReadNextAsCaseMatchList()
      clauses.push(new ExpressionSyntaxNode(
        whenKeyword, matchList,
        this.readNextToken('THEN'),
        ...this.#readAllPlsqlStatements()
      ))
    }

    // [ELSE]
    const elseKeyword = this.tryReadNextToken('ELSE')
    if (elseKeyword) {
      clauses.push(new ExpressionSyntaxNode(elseKeyword, ...this.#readAllPlsqlStatements()))
    }

    return new StatementSyntaxNode(
      caseToken, selector, ...clauses,
      this.#readNextAsEndCaseExpression(),   // END CASE [label]
      this.#tryReadNextAsSemicolonToken()   // ;
    )
  }

  /**
   * Reads a `CASE` statement.
   * @param {TokenLike} caseToken `CASE`
   * @returns {StatementSyntaxNode}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/CASE-statement.html
   *
   * ```bnf
   * simple_case_statement | searched_case_statement
   * ```
   *
   * @remarks
   * `CASE` statements and expressions are subtly different to where parsing them separately works best.
   */
  #readAsCaseStatement(caseToken) {
    const selector = this.#tryReadNextAsValueExpression()
    if (selector) {
      return this.#readAsSimpleCaseStatement(caseToken, selector)
    } else {
      return this.#readAsSearchedCaseStatement(caseToken)
    }
  }

  /**
   * Reads a searched `CASE` expression.
   * @param {TokenLike} caseToken `CASE`
   * @returns {ExpressionSyntaxNode}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/plsql-language-fundamentals.html#GUID-42342604-3BCD-48A3-B1F9-B0656E37C2CC
   *
   * ```bnf
   * CASE
   *   WHEN boolean_expression THEN result_value
   * [ WHEN boolean_expression THEN result_value]...
   * [ ELSE result_value]
   * END
   * ```
   *
   * @remarks
   * `CASE` statements and expressions are subtly different to where parsing them separately works best.
   */
  #readAsSearchedCaseExpression(caseToken) {
    // [WHEN .. THEN]...
    const clauses = []
    let whenKeyword
    while (whenKeyword = this.tryReadNextToken('WHEN')) {
      clauses.push(new ExpressionSyntaxNode(whenKeyword,
        this.#readNextAsValueExpression(),
        this.readNextToken('THEN'),
        this.#readNextAsValueExpression()
      ))
    }

    // [ELSE]
    const elseKeyword = this.tryReadNextToken('ELSE')
    if (elseKeyword) {
      clauses.push(new ExpressionSyntaxNode(elseKeyword, this.#readNextAsValueExpression()))
    }

    return new ExpressionSyntaxNode(caseToken, ...clauses, this.readNextToken(Patterns.END))
  }

  /**
   * Reads a `CASE` expression.
   * @param {TokenLike} caseToken `CASE`
   * @param {AnyExpressionSyntaxNode} selector  The selector for the case statement.
   * @returns {ExpressionSyntaxNode}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/plsql-language-fundamentals.html#GUID-F52A70F5-87E1-4AAE-9388-FE56E1ED5598
   *
   * ```bnf
   * CASE selector
   *   WHEN (selector_value | dangling_predicate)
   *     [, selector_value | dangling_predicate]... THEN result_value
   *       [ WHEN (selector_value | dangling_predicate)
   *         [, selector_value | dangling_predicate]... THEN result_value]...
   *   [ ELSE result_value]
   * END
   * ```
   *
   * @remarks
   * `CASE` statements and expressions are subtly different to where parsing them separately works best.
   */
  #readAsSimpleCaseExpression(caseToken, selector) {
    // [WHEN .. THEN]...
    const clauses = []
    let whenKeyword
    while (whenKeyword = this.tryReadNextToken('WHEN')) {
      const matchList = this.#tryReadNextAsCaseMatchList()
      clauses.push(new ExpressionSyntaxNode(
        whenKeyword, matchList,
        this.readNextToken('THEN'),
        this.#readNextAsValueExpression()
      ))
    }

    // [ELSE]
    const elseKeyword = this.tryReadNextToken('ELSE')
    if (elseKeyword) {
      clauses.push(new ExpressionSyntaxNode(elseKeyword, this.#readNextAsValueExpression()))
    }

    return new ExpressionSyntaxNode(caseToken, selector, ...clauses, this.readNextToken(Patterns.END))
  }

  /**
   * Reads a `CASE` expression.
   * @param {TokenLike} caseToken `CASE`
   * @returns {ExpressionSyntaxNode}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/plsql-language-fundamentals.html#GUID-216F1B33-493F-4CDE-93BB-096BACA8523E
   *
   * ```bnf
   * simple_case_expression | searched_case_expression
   * ```
   *
   * @remarks
   * `CASE` statements and expressions are subtly different to where parsing them separately works best.
   */
  #readAsCaseExpression(caseToken) {
    const selector = this.#tryReadNextAsValueExpression()
    if (selector) {
      return this.#readAsSimpleCaseExpression(caseToken, selector)
    } else {
      return this.#readAsSearchedCaseExpression(caseToken)
    }
  }

  /**
   * @param {TokenLike} ifToken `IF`
   * @returns {StatementSyntaxNode}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/IF-statement.html
   * ```bnf
   * IF boolean_expression THEN statement [ statement ]...
   *   [ ELSIF boolean_expression THEN statement [ statement ]... ]...
   *     [ ELSE statement [ statement ]... ] END IF ;
   ```
   */
  #readAsIfStatement(ifToken) {
    return new StatementSyntaxNode(
      ifToken,                              // IF
      this.#readNextAsValueExpression(),    // boolean_expression
      this.readNextToken('THEN'),           // THEN
      [...this.#readAllPlsqlStatements()],  // statement [ statement ]...
      [...this.#readAllElsifExpressions()], // [ ELSIF boolean_expression THEN statement [ statement ]... ]...
      this.#tryReadNextAsElseExpression(),  // [ ELSE statement [ statement ]... ]
      this.readNextTokens(Patterns.END, 'IF', ';') // END IF ;
    )
  }

  /**
   * @param {TokenLike} openToken
   */
  #readAsOpenStatement(openToken) {
    return this.#readAsOpaquePlsqlStatement(openToken);
  }

  /**
   * @param {TokenLike} closeToken
   */
  #readAsCloseStatement(closeToken) {
    return this.#readAsOpaquePlsqlStatement(closeToken);
  }

  //----------------

  /**
   * @param {TokenLike} selectOrWithKeyword
   */
  #readAsSelectStatement(selectOrWithKeyword) {
    return this.#readAsOpaquePlsqlStatement(selectOrWithKeyword)
  }

  #tryReadNextAsSelectStatement() {
    return this.tryReadNextAs(this.#readAsSelectStatement, ['SELECT', 'WITH'])
  }

  //----------------

  #tryReadNextAsExceptionName() {
    // Don't read reserved words here.
    // Not caring about distinction of "OTHERS" here right now.
    const token = this.tryReadNextToken([Patterns.KEYWORD, Patterns.IDENTIFIER])
    return token ? this.#readAsIdentifier(token) : null
  }

  /**
   * @returns {Generator<IdentifierSyntaxNode | TokenLike>}
   */
  *#readAllExceptionNamesWithCommas() {
    let exception = this.#tryReadNextAsExceptionName()
    if (!exception) {
      return
    }

    yield exception

    let orKeyword
    while (exception && (orKeyword = this.tryReadNextToken('OR'))) {
      yield orKeyword
      yield exception = this.#tryReadNextAsExceptionName()
    }
  }

  #tryReadNextAsExceptionNameList() {
    return new ExceptionNameListSyntaxNode(...this.#readAllExceptionNamesWithCommas())
  }

  #tryReadNextAsExceptionHandler() {
    const whenToken = this.tryReadNextToken('WHEN')
    if (!whenToken) {
      return null
    }
    return new ExceptionHandlerSyntaxNode(
      whenToken,
      this.#tryReadNextAsExceptionNameList(),
      this.tryReadNextToken('THEN'),
      ...this.#readAllPlsqlStatements()
    )
  }

  /**
   * @returns {Generator<ExceptionHandlerSyntaxNode>}
   */
  *#readAllExceptionHandlers() {
    let statement
    while (statement = this.#tryReadNextAsExceptionHandler()) {
      yield statement
    }
  }

  /**
   * @returns {ExceptionHandlerListSyntaxNode?}
   * ```bnf
   * EXCEPTION exception_handler [ exception_handler ]...
   * ```
   */
  #tryReadNextAsExceptionHandlerList() {
    const exceptionKeyword = this.tryReadNextToken(Patterns.EXCEPTION)
    if (exceptionKeyword) {
      return new ExceptionHandlerListSyntaxNode(exceptionKeyword, ...this.#readAllExceptionHandlers())
    }

    return null
  }

  /**
   * Reads starting with the given token as a PL/SQL `BEGIN`..`END` block.
   * @param {TokenLike} beginToken `BEGIN`
   * @returns {BlockBodySyntaxNode}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/block.html#GUID-9ACEB9ED-567E-4E1A-A16A-B8B35214FC9D__CJAIABJJ
   * ```bnf
   * BEGIN statement ...
   *   [ EXCEPTION exception_handler [ exception_handler ]... ] END [ name ] ;
   * ```
   */
  #readAsPlsqlBlockBody(beginToken) {
    // No frills or checks yet.
    return new BlockBodySyntaxNode(beginToken,
      [...this.#readAllPlsqlStatements()],
      this.#tryReadNextAsExceptionHandlerList(),
      this.tryReadNextToken(Patterns.END),
      this.#tryReadNextAsIdentifier(),
      this.#tryReadNextAsSemicolonToken()
    )
  }

  /**
   * Reads the next item as a PL/SQL `BEGIN`..`END` block.
   * @returns {BlockBodySyntaxNode}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/block.html#GUID-9ACEB9ED-567E-4E1A-A16A-B8B35214FC9D__CJAIABJJ
   * ```bnf
   * BEGIN statement ...
   *   [ EXCEPTION exception_handler [ exception_handler ]... ] END [ name ] ;
   * ```
   */
  #readNextAsPlsqlBlockBody() {
    return this.#readAsPlsqlBlockBody(this.readNextToken(Patterns.BEGIN))
  }

  /**
   * Reads starting with the given token as a PL/SQL `DECLARE`..`BEGIN`..`END` block.
   * @param {TokenLike} token `DECLARE` | `BEGIN`
   * @returns {BlockSyntaxNode}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/block.html#GUID-9ACEB9ED-567E-4E1A-A16A-B8B35214FC9D__CJAIABJJ
   * ```bnf
   * [ DECLARE declare_section ] body
   * ```
   */
  #readAsPlsqlBlock(token) {
    switch (token.value) {
      case 'BEGIN':
        // No declaration section
        return new BlockSyntaxNode(null, this.#readAsPlsqlBlockBody(token))
      case 'DECLARE':
        // Declaration section followed by body
        return new BlockSyntaxNode(this.#readAsDeclareSection(token), this.#tryReadNextAsPlsqlBlockBody())
      default:
        throw this.notImplemented(`For token '${token.value}'`)
    }
  }

  /**
   * Tries reading the next item as a PL/SQL label.
   * @returns {ExpressionSyntaxNode?}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/block.html#GUID-9ACEB9ED-567E-4E1A-A16A-B8B35214FC9D__CJACJBCH
   * ```bnf
   * << label >>
   * ```
   */
  #tryReadNextAsPlsqlLabel() {
    const openLabelToken = this.tryReadNextToken('<<')
    if (!openLabelToken) {
      return null
    }

    const identifier = this.#readNextAsIdentifier(),
      closeLabelToken = this.readNextToken('>>')
    return new ExpressionSyntaxNode(openLabelToken, identifier, closeLabelToken)
  }

  /**
   * @returns {Generator<ExpressionSyntaxNode>}
   */
  *#readAllPlsqlLabels() {
    yield* this.readAllAs(this.#tryReadNextAsPlsqlLabel)
  }

  // ---------------

  /**
   * Tries reading the next item as a PL/SQL statement with optional beginning labels inside a block.
   * @returns {StatementSyntaxNode?}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/block.html#GUID-9ACEB9ED-567E-4E1A-A16A-B8B35214FC9D__CJACJBCH
   * ```bnf
   * statement ::=
   * [ << label >> [ << label >> ] ...]
   *   unlabeled_statement
   * ```
   * @see #tryReadNextAsUnlabeledPlsqlStatement()
   */
  #tryReadNextAsPlsqlStatement() {
    const labels = [...this.#readAllPlsqlLabels()]
    const statement = this.#tryReadNextAsUnlabeledPlsqlStatement()
    return labels.length ? new StatementSyntaxNode(...labels, statement) : statement
  }

  /**
   * Tries reading the next item as a PL/SQL statement inside a block.
   * @returns {StatementSyntaxNode?}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/block.html#GUID-9ACEB9ED-567E-4E1A-A16A-B8B35214FC9D__CJACJBCH
   * ```bnf
   * unlabeled_statement ::=
   *   { assignment_statement
   *   | basic_loop_statement
   *   | case_statement
   *   | close_statement
   *   | continue_statement
   *   | cursor_for_loop_statement
   *   | execute_immediate_statement
   *   | exit_statement
   *   | fetch_statement
   *   | for_loop_statement
   *   | forall_statement
   *   | goto_statement
   *   | if_statement
   *   | null_statement
   *   | open_statement
   *   | open_for_statement
   *   | pipe_row_statement
   *   | plsql_block
   *   | c
   *   | raise_statement
   *   | return_statement
   *   | select_into_statement
   *   | sql_statement
   *   | while_loop_statement
   * }
   * ```
   */
  #tryReadNextAsUnlabeledPlsqlStatement() {
    // We look for any identifier, keyword, or a strict list of reserved words.
    // We don't search all reserved words because a) Oracle shouldn't allow them bare here, and b) we don't want to scoop up END.
    const patterns = [
      // assignment_statement
      // basic_loop_statement
      'LOOP',

      // case_statement
      'CASE',
      // close_statement
      'CLOSE',
      // continue_statement
      'CONTINUE',
      // execute_immediate_statement
      'EXECUTE',
      // exit_statement
      'EXIT',
      // fetch_statement
      'FETCH',
      // cursor_for_loop_statement
      // for_loop_statement
      'FOR',
      // forall_statement
      'FORALL',
      // goto_statement
      'GOTO',
      // if_statement
      'IF',
      // null_statement
      'NULL',
      // open_statement
      // open_for_statement
      'OPEN',
      // pipe_row_statement
      'PIPE',
      // plsql_block
      'BEGIN',
      'DECLARE',
      // raise_statement
      'RAISE',
      // return_statement
      'RETURN',
      // select_into_statement
      'WITH',
      'SELECT',
      // sql_statement
      ...Patterns.SQL_IN_PLSQL,
      // while_loop_statement
      Patterns.IDENTIFIER,
      Patterns.KEYWORD,

      // Bind/substitution variables
      Patterns.SUBSTITUTION_OPERATORS,
      Patterns.Operators.COLON
    ]

    const token = this.tryReadNextToken(patterns)
    if (!token) {
      return null
    }

    // Easy keyword checks
    switch (token.value) {
      case 'LOOP':      // basic_loop_statement
        return this.#readAsBasicLoopStatement(token)
      case 'CASE':      // case_statement
        return this.#readAsCaseStatement(token)
      case 'CLOSE':     // close_statement
        return this.#readAsCloseStatement(token)
      case 'CONTINUE':  // continue_statement
        return this.#readAsOpaquePlsqlStatement(token)
      case 'EXECUTE':   // execute_immediate_statement
        // I *think* we should be able to do this.
        return this.#readAsOpaquePlsqlStatement(token)
      case 'EXIT':      // exit_statement
        return this.#readAsOpaquePlsqlStatement(token)
      case 'FETCH':     // fetch_statement (stop)
        return this.#readAsOpaquePlsqlStatement(token)
      case 'FOR':       // cursor_for_loop_statement, for_loop_statement
        return this.#readAsForLoopStatement(token)
      case 'FORALL':    // forall_statement
        return this.#readAsForallStatement(token)
      case 'GOTO':      // goto_statement
        throw this.notImplemented(token.value)
      case 'IF':        // if_statement
        return this.#readAsIfStatement(token)
      case 'NULL':      // null_statement
        return new StatementSyntaxNode(token, this.#tryReadNextAsSemicolonToken())
      case 'OPEN':      // open_statement, open_for_statement
        return this.#readAsOpenStatement(token)
      case 'PIPE':      // pipe_row_statement
        return this.#readAsOpaquePlsqlStatement(token)
      case 'BEGIN':     // plsql_block
      case 'DECLARE':   // plsql_block
        return this.#readAsPlsqlBlock(token)
      case 'RAISE':     // raise_statement
        return this.#readAsOpaquePlsqlStatement(token)
      case 'RETURN':    // return_statement
        return this.#readAsOpaquePlsqlStatement(token)

      // select_into_statement
      // sql_statement > SELECT
      case 'WITH':
      case 'SELECT':
        return this.#readAsSelectStatement(token)
      // sql_statement > (other)
      case 'COMMIT':
      case 'DELETE':
      case 'INSERT':
      case 'LOCK':
      case 'MERGE':
      case 'ROLLBACK':
      case 'SAVEPOINT':
      case 'SET':
      case 'UPDATE':
        return this.#readAsOpaquePlsqlStatement(token)
      case 'WHILE':     // while_loop_statement
        return this.#readAsWhileLoopStatement(token)


      // XXX: If this is a special keyword, **UNREAD** it.
      case 'ELSIF':
        this.unreadToken()
        return null
    }


    // Handle all the ones that use identifiers:
    //  - assignment_statement
    //  - procedure_call
    //  - sql_statement > collection_method_call

    let expression
    switch (token.value) {
      case ':':
        expression = this.#readAsBindVariableExpression(token)
        break
      case '&':
      case '&&':
        expression = this.#readAsSubstitutionVariableExpression(token)
        break
      default:
        // Assume invocation chain.
        // Read the identifier and optional procedure invocation / collection method invocation.
        //  - foo
        //  - foo(1,2,3)
        //  - foo.exists(1)
        expression = this.#readAsInvocationChain(token) // LATER: Read any value expression.
        break
    }

    // Check for an assigment operator.
    const assignmentToken = this.tryReadNextToken(Patterns.ASSIGNMENT)
    if (assignmentToken) {
      // assignment_statement
      return new StatementSyntaxNode(
        expression,
        assignmentToken,
        this.#readNextAsValueExpression(),
        this.#tryReadNextAsSemicolonToken()
      )
    }

    // Probably just procedure_call or sql_statement > collection_method_call
    return new StatementSyntaxNode(expression, this.#tryReadNextAsSemicolonToken())
  }

  /**
   * @returns {Generator<StatementSyntaxNode>}
   */
  *#readAllPlsqlStatements() {
    yield* this.readAllAs(this.#tryReadNextAsPlsqlStatement)
  }

  /**
   * Tries reading the `END` of a block body that has no `BEGIN`, such as a PL/SQL package spec or body.
   * @param {TokenLike} endToken
   * @returns {BlockBodySyntaxNode}
   */
  #readAsEndOfBlockBody(endToken) {
    Token.mustMatch(Patterns.END, endToken)
    return new BlockBodySyntaxNode(null, null, null, endToken, this.#tryReadNextAsIdentifier(), this.#tryReadNextAsSemicolonToken());
  }

  /**
   * Tries reading the `END` of a block body that has no `BEGIN`, such as a PL/SQL package spec or body.
   * @returns {BlockBodySyntaxNode?}
   */
  #tryReadNextAsEndOfPlsqlBlockBody() {
    return this.tryReadNextAs(this.#readAsEndOfBlockBody, Patterns.END)
  }

  /**
   * Tries reading the next item as a PL/SQL `BEGIN`..`END` block.
   * @returns {BlockBodySyntaxNode?}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/block.html#GUID-9ACEB9ED-567E-4E1A-A16A-B8B35214FC9D__CJAIABJJ
   * ```bnf
   * BEGIN statement ...
   *   [ EXCEPTION exception_handler [ exception_handler ]... ] END [ name ] ;
   * ```
   */
  #tryReadNextAsPlsqlBlockBody() {
    return this.tryReadNextAs(this.#readAsPlsqlBlockBody, Patterns.BEGIN)
  }

  // ---------------------------------------------
  // PL/SQL block unit procedure/function
  // ---------------------------------------------

  // ---------------

  /**
  /**
   * Java call spec declaration
   * @returns {ExpressionSyntaxNode?}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/call-specification.html
   * `java_declaration`
   */
  #tryReadNextAsJavaDeclaration() {
    const tokens = this.tryReadNextTokens('LANGUAGE', 'JAVA', 'NAME')
    return tokens ? new ExpressionSyntaxNode(...tokens, this.#readNextAsStringLiteral()) : null
  }

  /**
   * JavaScript call spec declaration
   * @returns {ExpressionSyntaxNode?}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/call-specification.html
   * `java_declaration`
   */
  #tryReadNextAsJavaScriptDeclaration() {
    const tokens = this.tryReadNextTokens('MLE', ['MODULE', 'LANGUAGE'])
    if (tokens) {
      throw this.notImplemented('JavaScript declaration')
    }
    return null
  }

  /**
   * C call spec declaration
   * @returns {ExpressionSyntaxNode?}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/call-specification.html
   * `c_declaration`
   */
  #tryReadNextAsCDeclaration() {
    const tokens = this.tryReadNextTokens('LANGUAGE', 'C') ?? this.tryReadNextToken('EXTERNAL')
    if (tokens) {
      throw this.notImplemented('LANGUAGE C')
    }
    return null
  }

  /**
   * Tries reading the next item as a call specification.
   * @returns {StatementSyntaxNode?}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/call-specification.html
   */
  #tryReadNextAsCallSpecification() {
    const expression = this.#tryReadNextAsJavaDeclaration()
      ?? this.#tryReadNextAsJavaScriptDeclaration()
      ?? this.#tryReadNextAsCDeclaration()

    return expression ? new StatementSyntaxNode(expression, this.#tryReadNextAsSemicolonToken()) : null
  }

  /**
   * Tries reading the next item as a PL/SQL method body (declare section, begin..end)
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/block.html#GUID-9ACEB9ED-567E-4E1A-A16A-B8B35214FC9D__CJACHDGG
   */
  #tryReadNextAsMethodBody() {
    const declareSection = this.#tryReadNextAsImplicitDeclareSelection()
    const block = this.#tryReadNextAsPlsqlBlockBody()

    return block ? new MethodBodySyntaxNode(declareSection, block) : null
  }

  /**
   * Try reading the next item as any method body.
   * @returns {StatementSyntaxNode?}
   */
  #tryReadNextAsAnyMethodBody() {
    return this.#tryReadNextAsCallSpecification() ?? this.#tryReadNextAsMethodBody()
  }

  /**
   * Reads starting with the given token as a method declaration within a PL/SQL declaration block.
   * @param {TokenLike} methodKeyword `PROCEDURE`, `FUNCTION`
   * @returns {MethodDeclarationStatementSyntaxNode}
   *
   * No longer making a distinction between the fact that the PL/SQL package spec doesn't allow a declare_section + body.
   *
   * ```bnf
   * CREATE [ OR REPLACE ] [ EDITIONABLE | NONEDITIONABLE ] FUNCTION [ IF NOT EXISTS ] plsql_function_source
   * CREATE [ OR REPLACE ] [ EDITIONABLE | NONEDITIONABLE ] PROCEDURE [ IF NOT EXISTS ] plsql_procedure_source
   * ```
   */
  #readAsMethodDeclaration(methodKeyword) {
    Token.mustMatch(Patterns.METHOD_KIND, methodKeyword)
    const unitType = new UnitTypeSyntaxNode(methodKeyword),
      name = this.#readNextAsIdentifier(),
      parameterList = this.#tryReadNextAsParameterListDeclaration(),
      returnClause = this.#tryReadNextAsReturnDeclaration(),
      unitModifiers = [...this.#readNextAsUnitDeclarationModifiers()],
      isOrAsKeyword = this.tryReadNextToken(Patterns.IS_OR_AS),
      // Only read the body if we find IS or AS
      body = isOrAsKeyword ? this.#tryReadNextAsAnyMethodBody() : null,
      semicolonToken = this.#tryReadNextAsSemicolonToken()

    return new MethodDeclarationStatementSyntaxNode(
      unitType, name, parameterList, returnClause, unitModifiers,
      isOrAsKeyword, body,
      semicolonToken
    )
  }

  // ---------------

  /**
   * Reads starting with the given token as a method declaration within a PL/SQL declaration block.
   * @param {TokenLike} cursorKeyword `CURSOR`
   * @returns {MethodDeclarationStatementSyntaxNode}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/explicit-cursor-declaration-and-definition.html
   *
   * ```bnf
   * cursor_declaration | cursor_definition
   *
   * cursor_declaration ::=
   *   CURSOR cursor
   *     [( cursor_parameter_dec [, cursor_parameter_dec ]... )]
   *       RETURN rowtype;
   *
   * cursor_definition ::=
   *   CURSOR cursor
   *     [( cursor_parameter_dec [, cursor_parameter_dec ]... )]
   *       [ RETURN rowtype] IS select_statement ;
   *
   * ```
   */
  #readAsCursorDeclarationOrDefinition(cursorKeyword) {
    Token.mustMatch('CURSOR', cursorKeyword)
    const unitType = new UnitTypeSyntaxNode(cursorKeyword),
      name = this.#readNextAsIdentifier(),
      parameterList = this.#tryReadNextAsParameterListDeclaration(),
      returnClause = this.#tryReadNextAsReturnDeclaration(),
      isOrAsKeyword = this.tryReadNextToken(Patterns.IS_OR_AS),
      // Only read the select statement (body) if we find IS or AS
      selectStatement = isOrAsKeyword ? this.#tryReadNextAsSelectStatement() : null,
      semicolonToken = this.#tryReadNextAsSemicolonToken()

    return new MethodDeclarationStatementSyntaxNode(
      unitType, name, parameterList, returnClause, null,
      isOrAsKeyword, selectStatement,
      semicolonToken
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
    Token.mustMatch(Patterns.PRAGMA, pragmaKeyword)

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
    Token.mustMatch({ value: 'SUBTYPE' }, keyword)

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
    Token.mustMatch({ value: 'TYPE' }, typeKeyword)

    const name = this.#readNextAsIdentifier()
    const isKeyword = this.readNextToken(Patterns.IS)

    const typeExpression = this.#readNextAsTypeExpression()
    const semicolonToken = this.#tryReadNextAsSemicolonToken()

    switch (true) {
      case typeExpression instanceof RecordTypeExpressionSyntaxNode:
        return new RecordTypeDeclarationStatementSyntaxNode(typeKeyword, name, isKeyword, typeExpression, semicolonToken)
      case typeExpression instanceof CollectionTypeExpressionSyntaxNode:
        return new CollectionTypeDeclarationStatementSyntaxNode(typeKeyword, name, isKeyword, typeExpression, semicolonToken)
      case typeExpression instanceof RefCursorTypeExpressionSyntaxNode:
        return new RefCursorTypeDeclarationStatementSyntaxNode(typeKeyword, name, isKeyword, typeExpression, semicolonToken)
      default:
        // Any other TYPE
        return new TypeDeclarationStatementSyntaxNode(typeKeyword, name, isKeyword, typeExpression, semicolonToken)
    }
  }

  // ---------------

  /**
   * Reads starting with the given token as a variable, constant, or exception declaration.
   * @param {TokenLike} token The identifier token.
   * @returns {ExceptionDeclarationStatementSyntaxNode | VariableDeclarationStatementSyntaxNode}
   */
  #readAsVariableDeclaration(token) {
    const name = this.#readAsIdentifier(token)

    const exception = this.tryReadNextToken(Patterns.EXCEPTION)
    if (exception) {
      // <identifier> EXCEPTION;
      return new ExceptionDeclarationStatementSyntaxNode(name, exception, this.#tryReadNextAsSemicolonToken())
    }

    const constantKeyword = this.tryReadNextToken(Patterns.CONSTANT)
    const type = this.#readNextAsTypeExpression()

    const defaultToken = this.#tryReadNextAsAnyDefaultToken()
    const defaultValue = defaultToken ? this.#readNextAsValueExpression() : null

    return new VariableDeclarationStatementSyntaxNode(
      name,
      constantKeyword,
      type,
      defaultToken,
      defaultValue,
      this.#tryReadNextAsSemicolonToken()
    )
  }

  // -----------------------------------
  // PL/SQL Function/Procedure units
  // -----------------------------------

  /**
   * Reads the rest of the `CREATE [FUNCTION|PROCEDURE]` statement.
   * @param {SyntaxNode} create `CREATE [OR REPLACE]`
   * @param {SyntaxNode} editionable `EDITIONABLE` clause
   * @param {UnitTypeSyntaxNode} unitType `FUNCTION` or `PROCEDURE`
   * @param {SyntaxNode?} ifNotExists `IF NOT EXISTS`
   * @returns {CreateStandaloneMethodStatementSyntaxNode}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/CREATE-FUNCTION-statement.html
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/CREATE-PROCEDURE-statement.html
   *
   * ```bnf
   * plsql_function_source ::=
   *   [ schema. ] function_name
   *     [ ( parameter_declaration [, parameter_declaration]... ) ] RETURN datatype
   *   [ sharing_clause ]
   *     [ { invoker_rights_clause
   *       | accessible_by_clause
   *       | default_collation_clause
   *       | deterministic_clause
   *       | shard_enable_clause
   *       | parallel_enable_clause
   *       | result_cache_clause
   *       | aggregate_clause
   *       | pipelined_clause
   *       | sql_macro_clause
   *          }...
   *     ]
   *   { IS | AS } { [ declare_section ] body
   *                 | call_spec
   *               }
   *     ;
   * ```
   */
  #readRestOfStandaloneMethod(create, editionable, unitType, ifNotExists) {

    // BNF bug: Standalone functions with aggregate clauses do NOT necessarily have bodies.
    // Act as if that is possible for anything.
    const identifier = this.#readNextAsIdentifier(),
      parameterList = this.#tryReadNextAsParameterListDeclaration(),
      returnClause = this.#tryReadNextAsReturnDeclaration(),
      unitModifiers = [...this.#readNextAsUnitDeclarationModifiers()], // sharing_clause? -> {default_collation_clause, invoker_rights_clause, accessible_by_clause}*
      isOrAsKeyword = this.tryReadNextToken(Patterns.IS_OR_AS),
      // It is (our) standard practice to put the unit doc comment right after the IS/AS (or unit modifiers).
      // This is because Oracle understandably doesn't recognize comments before the CREATE statement as part of the package and it throws off line numbers, etc.
      docComment = this.#tryReadNextAsUnitDocComment(unitType.name),
      body = isOrAsKeyword ? this.#tryReadNextAsAnyMethodBody() : null,
      semicolonToken = this.#tryReadNextAsSemicolonToken(),
      slashToken = this.#tryReadNextAsSlashToken()

    return new CreateStandaloneMethodStatementSyntaxNode(
      create, editionable, unitType, ifNotExists,
      identifier, parameterList, returnClause, unitModifiers,
      isOrAsKeyword, docComment,
      body, semicolonToken, slashToken
    );
  }

  // -----------------------------------
  // PL/SQL Package unit (spec)
  // -----------------------------------

  /**
   * Reads a sequence of zero or more declarations within a package spec.
   * @returns {Generator<SyntaxNode>}
   * @yields {SyntaxNode}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/CREATE-PACKAGE-statement.html
   * `package_item_list`
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
            case 'FUNCTION':
              yield this.#readAsMethodDeclaration(token)
              continue
            case 'CURSOR':
              yield this.#readAsCursorDeclarationOrDefinition(token)
              break
            case 'PRAGMA':
              yield this.#readAsPragmaDeclaration(token)
              continue
            case 'BEGIN':
              // BEGIN..END
              yield this.#readAsPlsqlBlockBody(token)
              return
            case 'END':
              // just END
              yield this.#readAsEndOfBlockBody(token)
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
   * @param {SyntaxNode?} ifNotExists `IF NOT EXISTS`
   * @returns {CreatePackageStatementSyntaxNode}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/CREATE-PACKAGE-statement.html
   */
  #readRestOfPackageSpec(create, editionable, unitType, ifNotExists) {
    return new CreatePackageStatementSyntaxNode(
      create, editionable, unitType, ifNotExists,
      this.#readNextAsIdentifier(),
      // sharing_clause? -> {default_collation_clause, invoker_rights_clause, accessible_by_clause}*
      [...this.#readNextAsUnitDeclarationModifiers()],
      this.readNextToken(Patterns.IS_OR_AS),
      // It is (our) standard practice to put the unit doc comment right after the IS.
      // This is because Oracle understandably doesn't recognize comments before the CREATE statement as part of the package and it throws off line numbers, etc.
      this.#tryReadNextAsUnitDocComment(unitType.name),
      [...this.#readNextAsPackageSpecContent()],
      this.#tryReadNextAsSemicolonToken(),
      this.#tryReadNextAsSlashToken()
    );
  }

  // -----------------------------------
  // PL/SQL Package Body unit
  // -----------------------------------

  /**
   * Reads the rest of the `CREATE PACKAGE BODY` statement.
   * @param {SyntaxNode} create `CREATE [OR REPLACE]`
   * @param {SyntaxNode} editionable `EDITIONABLE` clause
   * @param {UnitTypeSyntaxNode} unitType `PACKAGE BODY`
   * @param {SyntaxNode?} ifNotExists `IF NOT EXISTS`
   * @returns {CreatePackageBodyStatementSyntaxNode}
   *
   * ```bnf
   * ```
   */
  #readRestOfPackageBody(create, editionable, unitType, ifNotExists) {
    const identifier = this.#readNextAsIdentifier(),
      unitModifiers = [...this.#readNextAsUnitDeclarationModifiers()], // sharing_clause? -> {default_collation_clause, invoker_rights_clause, accessible_by_clause}*
      isOrAsKeyword = this.tryReadNextToken(Patterns.IS_OR_AS),
      // It is (our) standard practice to put the unit doc comment right after the IS/AS (or unit modifiers).
      // This is because Oracle understandably doesn't recognize comments before the CREATE statement as part of the package and it throws off line numbers, etc.
      docComment = this.#tryReadNextAsUnitDocComment(unitType.name),
      declareSection = this.#tryReadNextAsImplicitDeclareSelection(),
      blockBody = this.#tryReadNextAsPlsqlBlockBody() ?? this.#tryReadNextAsEndOfPlsqlBlockBody(),
      semicolonToken = this.#tryReadNextAsSemicolonToken(),
      slashToken = this.#tryReadNextAsSlashToken()

    return new CreatePackageBodyStatementSyntaxNode(
      create, editionable, unitType, ifNotExists,
      identifier, unitModifiers,
      isOrAsKeyword, docComment,
      declareSection, blockBody, semicolonToken, slashToken
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
   * @returns {ObjectAttributeDeclarationExpressionSyntaxNode?}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/CREATE-TYPE-statement.html#GUID-389D603D-FBD0-452A-8414-240BBBC57034
   */
  #tryReadNextAsObjectAttributeDeclaration() {
    // n.b. Object attribute currently doesn't support inheritance, this is so we at least eat what we take
    const name = this.#tryReadNextAsIdentifier()
    if (!name) {
      return null
    }

    // doesn't allow defaults or other
    return new ObjectAttributeDeclarationExpressionSyntaxNode(name, this.#readNextAsTypeExpression())
  }

  // ---------------

  /**
   * Reads the next item as a constructor return declaration.
   * @returns {ConstructorReturnDeclarationExpressionSyntaxNode}
   */
  #tryReadNextAsReturnSelfAsResult() {
    const tokens = this.tryReadNextTokens(Patterns.RETURN, 'SELF', 'AS', 'RESULT')
    if (!tokens) {
      return null
    }

    const [returnKeyword, ...selfAsResultKeywords] = tokens
    return tokens ? new ConstructorReturnDeclarationExpressionSyntaxNode(returnKeyword, ...selfAsResultKeywords) : null
  }

  /**
   * Tries reading the next item as the rest of an object type constructor.
   * @param {InheritanceFlagSyntaxNode[]} inheritance
   * @returns {ConstructorDeclarationExpressionSyntaxNode?}
   */
  #tryReadNextAsRestOfConstructorDeclaration(inheritance) {
    // constructor is always function
    const tokens = this.tryReadNextTokens('CONSTRUCTOR', Patterns.FUNCTION)
    if (!tokens) {
      return null
    }


    const [constructorKeyword, methodKeyword] = tokens
    return new ConstructorDeclarationExpressionSyntaxNode(
      inheritance,
      constructorKeyword,
      new UnitTypeSyntaxNode(methodKeyword),
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
   * @returns {ObjectMethodDeclarationExpressionSyntaxNode?}
   */
  #tryReadNextAsRestOfObjectMemberOrStaticMethod(inheritance) {
    const requiredPatterns = [['MEMBER', 'STATIC'], Patterns.METHOD_KIND]
    const tokens = this.tryReadNextTokens(['MAP', 'ORDER'], ...requiredPatterns)
      ?? this.tryReadNextTokens(...requiredPatterns)
    if (!tokens) {
      return null
    }

    const [mapOrOrder, memberOrStatic, methodKeyword] = tokens.length === 3 ? tokens : [null, ...tokens]

    return new ObjectMethodDeclarationExpressionSyntaxNode(
      inheritance,
      mapOrOrder, memberOrStatic,
      new UnitTypeSyntaxNode(methodKeyword),
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
    const method = this.#tryReadNextAsRestOfObjectMemberOrStaticMethod(inheritance)
      // constructor_spec (always a function)
      ?? this.#tryReadNextAsRestOfConstructorDeclaration(inheritance)

    if (method) {
      return method
    }

    console.assert(inheritance.length === 0, "attributes should not be preceded by inheritance keywords")
    return this.#tryReadNextAsObjectAttributeDeclaration()
  }

  /**
   * Reads the next item as an object member declaration (e.g., method, attribute, constructor).
   * @returns {ObjectMemberDeclarationExpressionSyntaxNode}
   */
  #readNextAsObjectMemberDeclaration() {
    const param = this.#tryReadNextAsObjectMemberDeclaration()
    if (param) {
      console.assert(param instanceof ObjectMethodDeclarationExpressionSyntaxNode || param instanceof ObjectAttributeDeclarationExpressionSyntaxNode, `${param.textSpan}: must be method or attribute`)
      return param
    }
    throw this.syntaxError('Expected: object member')
  }

  /**
   * Reads a sequence of zero or more object member declarations and separating commas from an object type declaration.
   * @returns {Generator<ObjectMemberDeclarationExpressionSyntaxNode | TokenLike>}
   * @yields {ObjectMemberDeclarationExpressionSyntaxNode | TokenLike}
   */
  *#readNextAsObjectMemberDeclarationsWithCommas() {
    let param = this.#tryReadNextAsObjectMemberDeclaration()
    if (!param) {
      return
    }

    yield param

    let comma
    while (param && (comma = this.#tryReadNextAsCommaToken())) {
      yield comma
      yield param = this.#readNextAsObjectMemberDeclaration()
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
      // It is (our) standard practice to put the unit doc comment right after the opening parenthesis.
      // This is because Oracle understandably doesn't recognize comments before the CREATE statement as part of the package and it throws off line numbers, etc.
      this.#tryReadNextAsUnitDocComment('TYPE'),
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
   * @param {SyntaxNode} create `CREATE [OR REPLACE]`
   * @param {SyntaxNode} editionable `EDITIONABLE` clause
   * @param {UnitTypeSyntaxNode} unitType `TYPE`
   * @param {SyntaxNode?} ifNotExists `IF NOT EXISTS`
   * @returns {CreateTypeStatementSyntaxNode}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/CREATE-TYPE-statement.html#GUID-389D603D-FBD0-452A-8414-240BBBC57034
   */
  #readRestOfTypeSpec(create, editionable, unitType, ifNotExists) {
    const name = this.#readNextAsIdentifier()
    const force = SyntaxNode.asSyntaxNode(this.tryReadNextToken('FORCE'))
    const oid = this.#tryReadNextAsTypeOid()

    // Just read all the unit declaration modifiers into one bucket.
    const unitModifiers = [...this.#readNextAsUnitDeclarationModifiers()]

    const createExpression = new CreateTypeExpressionSyntaxNode(create, editionable, unitType, ifNotExists, name, force, oid, unitModifiers)

    // Next see if it is a base type or a subtype.
    const underKeyword = this.tryReadNextToken('UNDER')
    if (underKeyword) {
      // object subtype definition (UNDER keyword).
      // **NOTE:** there is no `IS` keyword here.
      return new CreateInheritedObjectTypeStatementSyntaxNode(
        createExpression,
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
        createExpression,
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
        createExpression,
        isOrAsKeyword,
        this.#tryReadNextAsUnitDocComment(unitType.name),
        this.#readAsTypeExpression(tableKeyword), // should be unrestricted but we don't care.
        [...this.#readNextAsTypeModifiers()],
        this.#tryReadNextAsSemicolonToken(),
        this.#tryReadNextAsSlashToken()
      )
    }

    throw this.notImplemented(isOrAsKeyword, 'unknown TYPE type')
  }

  // -----------------------------------
  // More PL/SQL common
  // -----------------------------------

  /**
   * Reads starting with the given token as an identifier (with optional `%` operator and restrictions) as a variable or parameter type.
   * @param {TokenLike} token
   * @returns {IdentifierTypeExpressionSyntaxNode}
   */
  #readAsTypeIdentifier(token) {
    return new IdentifierTypeExpressionSyntaxNode(
      this.#readAsIdentifier(token),
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
    const nullability = this.tryReadNextTokens('NOT', 'NULL') ?? this.tryReadNextTokens('NULL')
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
        this.#tryReadNextAsCommaToken(),
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
    Token.mustMatch(Patterns.INTERVAL, name)

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
   * @param {TokenLike} refKeyword `REF`
   * @param {TokenLike} cursorKeyword `CURSOR`
   * @returns {RefCursorTypeExpressionSyntaxNode}
   */
  #readAsRefCursorTypeExpression(refKeyword, cursorKeyword) {
    const returnKeyword = this.tryReadNextToken(Patterns.RETURN)
    const rowType = returnKeyword ? this.#readNextAsTypeExpression() : null
    return new RefCursorTypeExpressionSyntaxNode(refKeyword, cursorKeyword, returnKeyword, rowType)
  }

  // ---------------

  /**
   * Reads starting with the given token as a ref object type expression.
   * ```text
   * REF <type>
   * ```
   * @param {TokenLike} ref `REF`
   * @returns {TypeExpressionSyntaxNode}
   */
  #readAsRefTypeExpression(ref) {
    Token.mustMatch(Patterns.REF, ref)
    const cursor = this.tryReadNextToken(Patterns.CURSOR)
    if (cursor) {
      // REF CURSOR type expression
      return this.#readAsRefCursorTypeExpression(ref, cursor)
    }

    // Some other ref type.
    // Compositing it this way so we cover all the bases though 99% of the cases are REF <some object type>.
    return new TypeExpressionSyntaxNode(ref, this.#readNextAsTypeExpression())
  }

  // ---------------

  /**
   * Reads starting with the given token as a `TABLE OF` type expression.
   * ```text
   * TABLE OF <type> [INDEX BY <type>]?
   * ```
   * @param {TokenLike} tableKeyword `TABLE`
   * @returns {TypeExpressionSyntaxNode}
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/collection-variable.html
   */
  #readAsTableOfTypeExpression(tableKeyword) {
    // nested table (`TABLE OF <type-expr>`)
    // @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/CREATE-TYPE-statement.html#GUID-389D603D-FBD0-452A-8414-240BBBC57034__NESTED_TABLE_TYPE_DEF-DC078C6A
    const tableOf = new SyntaxNode(tableKeyword, this.readNextToken(Patterns.OF))
    const itemType = this.#readNextAsTypeExpression()

    // Check for `INDEX BY` to see if this is an associative array or a nested table type (array)
    const indexBy = SyntaxNode.asSyntaxNode(this.tryReadNextTokens('INDEX', 'BY'))
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
   * @returns {TypeExpressionSyntaxNode}
   */
  #readAsTypeExpression(name) {
    Token.mustMatch(Patterns.ANY_IDENTIFIER, name)

    // If followed by a period, assume it is a multi-part identifier.
    if (this.nextIs(Patterns.Operators.PERIOD)) {
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
          name,
          this.tryReadNextToken('RAW'),
          this.#tryReadNextAsNullabilityTypeRestriction()
        )

      case 'EXCEPTION':
        // Special cases: these are handled elsewhere.
        throw this.syntaxError(`${name.value} not expected here`)

      case 'RECORD':
        return new RecordTypeExpressionSyntaxNode(name, this.#readNextAsRecordFieldListDeclaration())

      case 'JSON':
        // LATER: does JSON have anything? (Probably.)
        return new TypeExpressionSyntaxNode(name)

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
   * @returns {TypeExpressionSyntaxNode}
   */
  #readNextAsTypeExpression() {
    // TODO revisit, reading any reserved here is probably questionable.
    let token = this.readNextToken(Patterns.ANY_IDENTIFIER)
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
   * @returns {ExpressionSyntaxNode | LiteralSyntaxNode?}
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
   * @param {TokenLike} intervalKeyword
   * @returns {ExpressionSyntaxNode}
   *
   * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/Literals.html#GUID-DC8D1DAD-7D04-45EA-9546-82810CD09A1B
   */
  #readAsIntervalLiteralExpression(intervalKeyword) {
    Token.mustMatch(Patterns.INTERVAL, intervalKeyword)

    const literal = this.#readNextAsStringLiteral()

    const fieldToken = this.readNextToken(['DAY', 'HOUR', 'MINUTE', 'SECOND', 'YEAR', 'MONTH'])
    switch (fieldToken.value) {
      case 'DAY':
      case 'HOUR':
      case 'MINUTE':
      case 'SECOND':
        return new DSIntervalLiteralExpressionSyntaxNode(
          intervalKeyword,
          literal,
          this.#readAsDSIntervalLeadingTypeRestrictionExpression(fieldToken),
          this.#tryReadNextAsDSIntervalTrailingTypeRestrictionExpression()
        )
      case 'YEAR':
      case 'MONTH':
        return new YMIntervalLiteralExpressionSyntaxNode(
          intervalKeyword,
          literal,
          this.#readAsYMIntervalLeadingTypeRestrictionExpression(fieldToken),
          this.#tryReadNextAsYMIntervalTrailingTypeRestrictionExpression()
        )
    }

    throw new TokenSyntaxError(intervalKeyword, "INTERVAL literal found, but not DAY or YEAR")
  }

  /**
   * Tries reading the next tokens as a `[DAY (precision)?|HOUR (precision)?|MINUTE (precision)?|SECOND (precision(, fractional_seconds)?))?]` expression.
   * @param {TokenLike} fieldToken
   * @returns {IntervalLeadingTypeRestrictionExpressionSyntaxNode?}
   */
  #readAsDSIntervalLeadingTypeRestrictionExpression(fieldToken) {
    switch (fieldToken.value) {
      case 'DAY':
      case 'HOUR':
      case 'MINUTE':
        return new IntervalLeadingTypeRestrictionExpressionSyntaxNode(fieldToken, this.#tryReadNextAsPrecisionTypeRestriction())
      case 'SECOND':
      default: // likely malformed
        return new IntervalLeadingTypeRestrictionExpressionSyntaxNode(fieldToken, this.#tryReadNextAsPrecisionAndScaleTypeRestriction()) // LATER: dedicated leading/fractional restriction
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

    const [toKeyword, fieldToken] = tokens
    switch (fieldToken.value) {
      case 'DAY':
      case 'HOUR':
      case 'MINUTE':
        return new IntervalTrailingTypeRestrictionExpressionSyntaxNode(toKeyword, fieldToken)
      case 'SECOND':
      default: // likely malformed
        return new IntervalTrailingTypeRestrictionExpressionSyntaxNode(toKeyword, fieldToken, this.#tryReadNextAsPrecisionTypeRestriction())
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
    Token.mustMatch(Patterns.TIMESTAMP, keyword)

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

  /**
   * ```text
   * TREAT( expr AS [ REF ] [ schema. ]type | JSON )
   * ```
   * @param {TokenLike} treatKeyword `TREAT`
   */
  #readAsTreatExpression(treatKeyword) {
    const openParenToken = this.#readNextAsOpenParenToken(),
      expr = this.#readNextAsValueExpression(),
      asKeyword = this.readNextToken(Patterns.AS),
      type = this.#readNextAsTypeExpression(),
      closeParenToken = this.#readNextAsCloseParenToken();
    return new ExpressionSyntaxNode(
      treatKeyword,
      openParenToken,
      expr, asKeyword, type,
      closeParenToken
    )
  }

  // ---------------

  /**
   * Tries reading the next item as a `SQL%{attribute}` expression.
   * ```bnf
   * boolean_expression ::=
   *    SQL % { FOUND | ISOPEN | NOTFOUND }
   * numeric_subexpression ::=
   *    SQL % { ROWCOUNT | BULK_ROWCOUNT ( index ) }
   * ```
   */
  #tryReadNextAsSqlAttributeExpression() {
    const sqlPercentAttribute = this.tryReadNextTokens(
      Patterns.SQL,
      Patterns.Operators.PERCENT,

      // All of the known values are not reserved words (or, as of 23c, even *keywords*).
      // Of those, BULK_ROWCOUNT and BULK_EXCEPTIONS are collections (the latter a collection of records),
      // so we'll read those as a possible invocation.
      [Patterns.KEYWORD, Patterns.IDENTIFIER]
    )

    if (!sqlPercentAttribute) {
      return null
    }

    return new ExpressionSyntaxNode(sqlPercentAttribute, this.#tryReadNextAsInvocationParameterList())
  }

  /**
   * Tries reading the next item as a single value expression.
   * @returns {AnyExpressionSyntaxNode?}
   * ```bnf
   *  { boolean_expression
   *    | character_expression
   *    | collection_constructor
   *    | date_expression
   *    | numeric_expression
   *    | qualified_expression
   *    | searched_case_expression
   *    | simple_case_expression
   *    | ( expression )
   *    }
   * ```
   */
  #tryReadNextAsSingleValueExpression() {
    // Literals, binds, well-known expression types
    const simpleValue = this.#tryReadNextAsStringLiteral()
      ?? this.#tryReadNextAsNumberLiteral()
      ?? this.#tryReadNextAsSubstitutionVariableExpression()
      ?? this.#tryReadNextAsBindVariableExpression()
      ?? this.#tryReadNextAsSqlAttributeExpression()

    if (simpleValue) {
      return simpleValue
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

    // We look for any identifier, keyword, or a strict list of reserved words.
    // We don't search all reserved words because a) Oracle shouldn't allow them bare here, and b) we don't want to scoop up BEGIN or END.
    const token = this.tryReadNextToken([
      // boolean_expression reserved words
      Patterns.NOT,
      Patterns.NULL,

      // Other reserved words not handled prior to this
      Patterns.DATE,
      Patterns.CASE,

      // All others are keywords or identifiers.
      Patterns.KEYWORD,
      Patterns.IDENTIFIER
    ])
    if (token) {
      switch (token.type) {
        case 'reserved':
          switch (token.value) {
            case 'CASE':
              return this.#readAsCaseExpression(token)
            case 'DATE':
              return new DateLiteralExpressionSyntaxNode(token, this.#readNextAsStringLiteral())
            case 'NOT':
              // NOT {boolean_expression}
              return new ExpressionSyntaxNode(token, this.#readNextAsSingleValueExpression())
            case 'NULL':
              return new ExpressionSyntaxNode(token)
            default:
              throw this.syntaxError(`The reserved word '${token.value}' is not supported as the start of a value expression.`)
          }

        case 'keyword':
          switch (token.value) {
            // well-known literals
            case 'TRUE':
            case 'FALSE':
              return new ExpressionSyntaxNode(token)
            case 'INTERVAL':
              return this.#readAsIntervalLiteralExpression(token)
            case 'TIMESTAMP':
              return this.#readAsTimestampLiteralExpression(token)

            // Keyword operators
            case 'NEW':
              // new object constructor invocation
              // LATER: this really doesn't do the right thing if we actually care to evaluate the body!
              // It evaluates `new Type().Foo()` as `(new Type()).Foo()`.
              // However, we're not evaulating these, we're just eating them...
              return new ExpressionSyntaxNode(token, this.#tryReadNextAsInvocationChain())
            case 'TREAT':
              return this.#readAsTreatExpression(token)

            // Well-known keywords representing function calls.
            case 'ASCII':
            case 'ASCIISTR':
            case 'CHR':
            case 'CURRENT_DATE':
            case 'CURRENT_TIMESTAMP':
            case 'HEXTORAW':
            case 'INITCAP':
            case 'LENGTH':
            case 'LOCALTIMESTAMP':
            case 'LOWER':
            case 'RAWTOHEX':
            case 'SYSDATE':
            case 'SYSTIMESTAMP':
            case 'SYS_GUID':
            case 'TO_CHAR':
            case 'TO_DATE':
            case 'TO_NUMBER':
            case 'UNISTR':
            case 'USER':
            case 'UPPER':
              return this.#readAsInvocation(token)
            default:
              // Unsure if standalone identifier or invocation, try guessing
              const identifier = this.#readAsIdentifier(token)
              const parameterList = this.#tryReadNextAsInvocationParameterList()
              if (parameterList) {
                // Definitely an invocation.
                return new InvocationExpressionSyntaxNode(identifier, parameterList);
              }

              // No parens. This could be a keyword we're not handling correctly, but is probably not.
              console.logOnce(token.value, `${token.textSpan}: start of value expression: { type: '${token.type}', value: '${token.value}' }`)
              return identifier;
          }

        case 'identifier':
          // Unsure if standalone identifier or invocation, try guessing
          return this.#readAsInvocation(token)
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

  *#readNextAsValueExpressionList() {
    const openParenToken = this.#tryReadNextAsOpenParenToken()
    if (!openParenToken) {
      return
    }

    yield openParenToken

    let expression = this.#tryReadNextAsValueExpression()
    if (expression) {
      yield expression

      let comma
      while (expression && (comma = this.#tryReadNextAsCommaToken())) {
        yield comma
        yield expression = this.#tryReadNextAsValueExpression()
      }
    }

    yield this.#readNextAsCloseParenToken()
  }
  // ---------------

  /**
   * @param {ExpressionSyntaxNode} left  The left expression
   * @param {TokenLike} operatorToken The operator token.
   */
  #readAsBinaryExpression(left, operatorToken) {
    switch (operatorToken.value) {
      case 'IN':
        return new BinaryExpressionSyntaxNode(left, operatorToken, new ExpressionSyntaxNode(...this.#readNextAsValueExpressionList()))
      default:
        return new BinaryExpressionSyntaxNode(left, operatorToken, this.#readNextAsValueExpression())

    }
  }

  /**
   * Tries reading the next item as a binary operator token.
   * @returns {TokenLike?}
   */
  #tryReadNextAsBinaryOperatorToken() {
    return this.tryReadNextToken(Patterns.BINARY_OPERATOR)
  }

  /**
   * Tries reading the next item as a value expression.
   * @returns {ExpressionSyntaxNode?}
   * ```bnf
   *  { boolean_expression
   *    | character_expression
   *    | collection_constructor
   *    | date_expression
   *    | numeric_expression
   *    | qualified_expression
   *    | searched_case_expression
   *    | simple_case_expression
   *    | ( expression )
   *    }
   * ```
   */
  #tryReadNextAsValueExpression() {
    const expression = this.#tryReadNextAsSingleValueExpression()
    if (!expression) {
      return null
    }

    // See if there is a binary operator
    const operatorToken = this.#tryReadNextAsBinaryOperatorToken()
    if (operatorToken) {
      return this.#readAsBinaryExpression(expression, operatorToken)
    }

    return expression
  }

  /**
   * Reads the next item as a value expression.
   * @returns {ExpressionSyntaxNode}
   * ```bnf
   *  { boolean_expression
   *    | character_expression
   *    | collection_constructor
   *    | date_expression
   *    | numeric_expression
   *    | qualified_expression
   *    | searched_case_expression
   *    | simple_case_expression
   *    | ( expression )
   *    }
   * ```
   */
  #readNextAsValueExpression() {
    const expression = this.#readNextAsSingleValueExpression()

    // See if there is an operator
    const operatorToken = this.tryReadNextToken(Patterns.BINARY_OPERATOR)
    if (operatorToken) {
      return this.#readAsBinaryExpression(expression, operatorToken)
    }

    return expression
  }

  // ---------------

  /**
   * Tries reading the next item as a `RETURN` declaration.
   * @returns {ReturnDeclarationExpressionSyntaxNode?}
   */
  #tryReadNextAsReturnDeclaration() {
    const returnKeyword = this.tryReadNextToken(Patterns.RETURN)
    if (!returnKeyword) {
      return null
    }

    return new ReturnDeclarationExpressionSyntaxNode(returnKeyword, this.#readNextAsTypeExpression()) // yeah this means we eat `varchar2(x)` but who cares.
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
   * Tries reading the next item as The `DEFAULT` keyword or an assignment symbol (`:=`).
   * @returns {TokenLike?} A token of `:=`, `DEFAULT`, or null.
   */
  #tryReadNextAsAnyDefaultToken() {
    return this.tryReadNextToken(Patterns.ANY_DEFAULT)
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

    const defaultToken = this.#tryReadNextAsAnyDefaultToken()
    const defaultValue = defaultToken ? this.#readNextAsValueExpression() : null

    return new DeclarationParameterExpressionSyntaxNode(name, mode, type, defaultToken, defaultValue)
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
   * @returns {Generator<DeclarationParameterExpressionSyntaxNode | TokenLike>}
   * @yields {DeclarationParameterExpressionSyntaxNode | TokenLike}
   */
  *#readNextAsParameterDeclarationsWithCommas() {
    let param = this.#tryReadNextAsParameterDeclaration()
    if (!param) {
      return
    }

    yield param

    let comma
    while (param && (comma = this.#tryReadNextAsCommaToken())) {
      yield comma
      yield param = this.#tryReadNextAsParameterDeclaration()
    }
  }

  /**
   * Tries reading the next item as a parameter list from a declaration.
   * @returns {DeclarationParameterListExpressionSyntaxNode?}
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

  // ---------------


  /**
   * Tries reading the next item as a single parameter from a declaration.
   * @returns {RecordFieldDeclarationExpressionSyntaxNode?}
   */
  #tryReadNextAsRecordFieldDeclaration() {
    const name = this.#tryReadNextAsIdentifier()
    if (!name) {
      return null
    }

    const type = this.#readNextAsTypeExpression()

    const defaultToken = this.#tryReadNextAsAnyDefaultToken()
    const defaultValue = defaultToken ? this.#readNextAsValueExpression() : null

    return new RecordFieldDeclarationExpressionSyntaxNode(name, type, defaultToken, defaultValue)
  }

  /**
   * Reads a sequence of zero or more parameters and separating commas from a declaration.
   * @returns {Generator<RecordFieldDeclarationExpressionSyntaxNode | TokenLike>}
   * @yields {RecordFieldDeclarationExpressionSyntaxNode | TokenLike}
   */
  *#readNextAsRecordFieldDeclarationsWithCommas() {
    let param = this.#tryReadNextAsRecordFieldDeclaration()
    if (!param) {
      return
    }

    yield param

    let comma
    while (param && (comma = this.#tryReadNextAsCommaToken())) {
      yield comma
      yield param = this.#tryReadNextAsRecordFieldDeclaration()
    }
  }

  /**
   * Reads the next item as a parameter list from a declaration.
   * @returns {RecordFieldListDeclarationExpressionSyntaxNode}
   */
  #readNextAsRecordFieldListDeclaration() {
    return new RecordFieldListDeclarationExpressionSyntaxNode(
      this.#readNextAsOpenParenToken(),
      [...this.#readNextAsRecordFieldDeclarationsWithCommas()],
      this.#readNextAsCloseParenToken()
    )
  }

  // ---------------

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

    Token.mustMatch(Patterns.PREPROCESSOR.KEYWORD, token)
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
   * @param {TokenLike} token The first token
   * @param {...SyntaxNodeOrTokenLikeOrIterable} nodesOrTokens Optional additional tokens/nodes
   * @returns {SqlPlusStatementSyntaxNode}
   */
  #readAsSqlPlusCommandStatement(token, ...nodesOrTokens) {
    return new SqlPlusStatementSyntaxNode(token, ...this.#readThroughEndOfLine())
  }

  /**
   * Reads starting with the given token as a SQL*Plus script invocation, up to the end of line.
   * @param {TokenLike} token The first token
   * @returns {SqlPlusStatementSyntaxNode}
   */
  #readAsSqlPlusScriptStatement(token) {
    return new SqlPlusStatementSyntaxNode(token, ...this.#readThroughEndOfLine())
  }

  /**
   * Could be either SQL or SQL*Plus.
   * @param {TokenLike} setKeyword
   * @returns {SqlPlusStatementSyntaxNode | SqlStatementSyntaxNode}
   */
  #readAsSetStatement(setKeyword) {
    // TODO confirm that the allowed SQL SET command is TRANSACTION.
    const transactionKeyword = this.tryReadNextToken('TRANSACTION')
    if (transactionKeyword) {
      return this.#readAsOpaqueSqlStatement(setKeyword, transactionKeyword)
    }

    return this.#readAsSqlPlusCommandStatement(setKeyword)
  }

  // -----------------------------------
  // Main reader
  // -----------------------------------

  /** @override */
  readInternal() {
    let token
    while (token = this.tryReadNextToken()) {
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
            case 'REVOKE':
            case 'INSERT':
            case 'UPDATE':
            case 'DELETE':
            case 'SELECT':
            case 'WITH':
              return this.#readAsOpaqueSqlStatement(token)
            case 'SET':
              return this.#readAsSetStatement(token)
            case 'DECLARE':
            case 'BEGIN':
              return this.#readAsPlsqlBlock(token)
            case 'CONNECT':
              // SQL*Plus
              return this.#readAsSqlPlusCommandStatement(token)

          }
          break;

        case 'keyword':
          switch (token.value) {
            case 'ACC': // ACCEPT
            case 'ACCEPT':
            case 'A':   // APPEND
            case 'APPEND':
            case 'ARGUMENT':
            case 'ATTR':  // ATTRIBUTE
            case 'ATTRIBUTE':
            case 'BREAK':
            case 'BTITLE':
            case 'CHANGE':
            case 'CLEAR':
            case 'COLUMN':
            case 'COMPUTE':
            case 'COPY': // deprecated. eat it anyway.
            case 'DEF':
            case 'DEFINE':
            case 'DEL':
            case 'DESCRIBE':
            case 'DISCONNECT':
            case 'EXEC':
            case 'EXECUTE':
            case 'EXIT':
            case 'PROMPT':
            case 'SHOW':
            case 'SPOOL':
            case 'VAR':
            case 'WHENEVER':
              // SQL*Plus command
              return this.#readAsSqlPlusCommandStatement(token)
            case 'ARCHIVE':
              // SQL*Plus: ARCHIVE LOG
              const logToken = this.tryReadNextToken('LOG')
              if (logToken) {
                return this.#readAsSqlPlusCommandStatement(token, logToken)
              }

              // Something else? Fall through.
              break
            case 'CALL':
              // CALL SQL command
              return this.#readNextAsOpaqueSqlStatement(token, this.#tryReadNextAsInvocationChain())
            case 'COMMIT':
            case 'ROLLBACK':
              return this.#readAsOpaqueSqlStatement(token)
          }

        case 'operator':
          switch (token.value) {
            case '/':
              // terminating slash
              return new TerminatorSyntaxNode(token)
            case '@':
            case '@@':
              // SQL*Plus file invocation operator
              return this.#readAsSqlPlusScriptStatement(token)
            case '$':
            case '!':
              // shell execute (SQL*Plus)
              return this.#readAsSqlPlusCommandStatement(token)
          }
          break

        case 'preprocessor.keyword':
          return this.#readAsPreprocessorCommand(token)
      }

      // Fallthrough logic, read as an opaque SQL statement.
      console.assert(false, `${token.textSpan} unrecognized initial statement token { type: '${token.type}', value: '${token.value}' }`, token)
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
 * Represents a PL/SQL statement.
 */
class StatementSyntaxNode extends StatementSyntaxNodeBase {
  /** @type {Token?} The terminating semicolon */ semicolonToken

  /**
   * @param {...SyntaxNodeOrTokenLikeOrIterable} nodesOrTokens
   */
  constructor(...nodesOrTokens) {
    super(...nodesOrTokens)

    // Find the terminating semicolon.
    switch (this.lastNontrivialToken.value) {
      case ';':
        this.semicolonToken = this.lastNontrivialToken
        break
      case '/':
        // Probably a top-level SQL statement. Don't worry.
        break
      default:
        // ???
        console.info(`${this.textSpan} semicolon not found for statement`, this, this.toString())
        break
    }
  }
}
exports.StatementSyntaxNode = StatementSyntaxNode

// -----------------

/**
 * @typedef {NamedSyntaxNode} DeclarationSyntaxNode
 */

/**
 * @abstract
 * Represents a declaration statement.
 * @implements {DeclarationSyntaxNode}
 */
class DeclarationStatementSyntaxNode extends StatementSyntaxNode {
  #name

  /**
   * @param {...SyntaxNodeOrTokenLikeOrIterable} nodesOrTokens
   */
  constructor(...nodesOrTokens) {
    super(...nodesOrTokens)
    this.#name = this.children.find(ofType(IdentifierSyntaxNode))
    if (this.lastNontrivialToken.value === ';') {
      this.semicolonToken = this.lastNontrivialToken
    }
  }

  get name() { return this.#name }
}
exports.DeclarationStatementSyntaxNode = DeclarationStatementSyntaxNode

/**
 * @abstract
 * Represents a member declaration expression.
 * @implements {DeclarationSyntaxNode}
 */
class DeclarationExpressionSyntaxNode extends ExpressionSyntaxNode {
  #name

  /**
   * @param {...SyntaxNodeOrTokenLikeOrIterable?} nodesOrTokens
   */
  constructor(...nodesOrTokens) {
    super(...nodesOrTokens)
    this.#name = this.children.find(ofType(IdentifierSyntaxNode))
  }

  get name() { return this.#name }
}
exports.DeclarationExpressionSyntaxNode = DeclarationExpressionSyntaxNode

/**
 * @param {any} value
 * @returns {value is DeclarationSyntaxNode}
 */
const isDeclarationSyntaxNode = (value) => value instanceof DeclarationExpressionSyntaxNode || value instanceof DeclarationStatementSyntaxNode
exports.isDeclarationSyntaxNode = isDeclarationSyntaxNode

// -----------------

/**
 * @typedef {'attribute' | 'exception' | 'field' | 'method' | 'parameter' | 'pragma' | 'type' | 'variable'} MemberKind The friendly name of the kind of member.
 *
 * @typedef _MemberSyntaxNode
 * @property {MemberKind} memberKind The friendly name of the kind of member.
 *
 * @typedef {DeclarationSyntaxNode & _MemberSyntaxNode} MemberSyntaxNode
 */

/**
 * @implements {MemberSyntaxNode}
 */
class MemberStatementSyntaxNode extends DeclarationStatementSyntaxNode {
  #memberKind

  /**
   * @param {MemberKind} memberKind The friendly name of the kind of member.
   * @param {...SyntaxNodeOrTokenLikeOrIterable} nodesOrTokens
   */
  constructor(memberKind, ...nodesOrTokens) {
    super(...nodesOrTokens)
    this.#memberKind = memberKind
    if (this.lastNontrivialToken.value === ';') {
      this.semicolonToken = this.lastNontrivialToken
    }
  }

  get memberKind() { return this.#memberKind }
}
exports.MemberStatementSyntaxNode = MemberStatementSyntaxNode

/**
 * @abstract
 * Represents a member declaration expression.
 * @implements {MemberSyntaxNode}
 */
class MemberExpressionSyntaxNode extends DeclarationExpressionSyntaxNode {
  #memberKind
  /** @type {AnnotationNode[]} Annotations for this statement. */ annotations = []

  /**
   * @param {MemberKind} memberKind
   * @param {...SyntaxNodeOrTokenLikeOrIterable?} nodesOrTokens
   */
  constructor(memberKind, ...nodesOrTokens) {
    super(...nodesOrTokens)
    this.#memberKind = memberKind
  }

  get memberKind() { return this.#memberKind }
}
exports.MemberExpressionSyntaxNode = MemberExpressionSyntaxNode

/**
 * @param {any} value
 * @returns {value is MemberSyntaxNode}
 */
const isMemberSyntaxNode = (value) => value instanceof MemberStatementSyntaxNode || value instanceof MemberExpressionSyntaxNode
exports.isMemberSyntaxNode = isMemberSyntaxNode

// -----------------

/**
 * Top-level SQL statement.
 */
class SqlStatementSyntaxNode extends DeclarationStatementSyntaxNode {
  /** @type {Token?} The optional terminating slash (`/`). */ slashToken

  /**
   * @param  {...SyntaxNodeOrTokenLikeOrIterable} nodesOrTokens
   */
  constructor(...nodesOrTokens) {
    super(...nodesOrTokens)

    // Ensure that, if we have a trailing slash, that we assign the terminators.
    // (Superclass handles the case where a semicolon is the final token.)
    if (this.lastNontrivialToken.value === '/') {
      // found a trailing slash.  Consume it and try associating the terminating semicolon if the previous nontrivial token is a semicolon.
      console.assert(this.tokens.at(-1) === this.lastNontrivialToken, 'not the last nontrivial')
      this.slashToken = this.lastNontrivialToken
      if (this.tokens.length >= 2) {
        const maybeSemicolonToken = this.tokens.at(-2)
        if (maybeSemicolonToken.value === ';') {
          this.semicolonToken = maybeSemicolonToken
        }
      }
    }
  }
}
exports.SqlStatementSyntaxNode = SqlStatementSyntaxNode

/**
 * Represents the initial part of a `CREATE` SQL statement.
 * @example `CREATE OR REPLACE PACKAGE FOO AUTHID CURRENT_USER`
 * @see CreatePlsqlUnitStatementSyntaxNode
 */
class CreateUnitExpressionSyntaxNode extends DeclarationExpressionSyntaxNode {
  #unitType
  #unitModifiers

  /**
   * @param {SyntaxNode} create `CREATE [OR REPLACE]`
   * @param {SyntaxNode} editionable `EDITIONABLE` clause
   * @param {UnitTypeSyntaxNode} unitType The unit type node.
   * @param {SyntaxNode?} ifNotExists `IF NOT EXISTS`
   * @param {IdentifierSyntaxNode} name The name of the unit.
   * @param {...SyntaxNodeOrTokenLikeOrIterable} nodesOrTokens Additional expression members
   */
  constructor(create, editionable, unitType, ifNotExists, name, ...nodesOrTokens) {
    super(create, editionable, unitType, ifNotExists, name, ...nodesOrTokens)
    this.#unitType = unitType

    // Default behavior is to search immediate children for unit modifiers.
    // Subclasses are not obligated to pass these directly, however.
    this.#unitModifiers = this.children.filter(ofType(UnitModifierExpressionSyntaxNode))
  }

  /** @type {UnitTypeSyntaxNode} The unit type (e.g., `PACKAGE`, `TYPE BODY`). */
  get unitType() { return this.#unitType }

  /**
   * @type {UnitModifierExpressionSyntaxNode[]}
   * Various clauses applying to this unit (e.g., invoker_rights_clause, deterministic_clause).
   */
  get unitModifiers() { return this.#unitModifiers }
}
exports.CreateUnitExpressionSyntaxNode = CreateUnitExpressionSyntaxNode

/**
 * `CREATE` PL/SQL unit statement.
 */
class CreatePlsqlUnitStatementSyntaxNode extends SqlStatementSyntaxNode {
  /** @type {CreateUnitExpressionSyntaxNode} */ createExpression
  /** @type {DocumentCommentSyntaxNode?} */ docComment

  /**
   * @param {CreateUnitExpressionSyntaxNode} createExpression
   * @param {...SyntaxNodeOrTokenLikeOrIterable} nodesOrTokens
   */
  constructor(createExpression, ...nodesOrTokens) {
    super(createExpression, ...nodesOrTokens)
    this.createExpression = createExpression
    this.docComment = this.structuredChildren.find(/** @returns {x is DocumentCommentSyntaxNode} */ x => x instanceof DocumentCommentSyntaxNode)
  }

  get name() {
    return this.createExpression.name
  }

  /** @type {UnitTypeSyntaxNode} The unit type (e.g., `PACKAGE`, `TYPE BODY`). */
  get unitType() {
    return this.createExpression.unitType
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
   * @param {NamedSyntaxNode[]} declarations
   * @returns {void}
   */
  processPragmas(declarations) {
    // We only process declarations (which includes pragmas).
    mustBeArray(declarations, 'declarations')
    declarations.every((n, i) => mustBeNamedSyntaxNode(n, `declarations[${i}]`))

    /** @type {PragmaDeclarationStatementSyntaxNode[]} 'siblings' pragmas encountered, to apply to all with name */
    const siblingPragmas = declarations.filter(/** @returns {d is PragmaDeclarationStatementSyntaxNode} */d => d instanceof PragmaDeclarationStatementSyntaxNode && d.searchHints.indexOf('siblings') >= 0)

    /** @type {PragmaDeclarationStatementSyntaxNode[]} 'next' pragmas encountered, to be consumed as we encounter them */
    let nextPragmas = []

    /**
     * @param {PragmaDeclarationStatementSyntaxNode} pragma
     * @param {number} index
     * @returns {boolean}
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

/**
 * `CREATE FUNCTION` or `CREATE PROCEDURE` opening expression (all before the `IS`/`AS`).
 * @implements {MethodSyntaxNode}
 */
class CreateMethodExpressionSyntaxNode extends CreateUnitExpressionSyntaxNode {
  #parameterList

  /**
   * @param {SyntaxNode} create `CREATE [OR REPLACE]`
   * @param {SyntaxNode} editionable `EDITIONABLE` clause
   * @param {UnitTypeSyntaxNode} unitType `FUNCTION` or `PROCEDURE`
   * @param {SyntaxNode?} ifNotExists `IF NOT EXISTS`
   * @param {IdentifierSyntaxNode} name The name of the function or procedure.
   * @param {DeclarationParameterListExpressionSyntaxNode?} parameterList The parameters, if any.
   * @param {ReturnDeclarationExpressionSyntaxNode?} returnClause The return clause (function only)
   * @param {UnitModifierExpressionSyntaxNode[]} unitModifiers Various clauses applying to this unit (e.g., invoker_rights_clause, deterministic_clause).
   */
  constructor(create, editionable, unitType, ifNotExists, name, parameterList, returnClause, unitModifiers) {
    super(create, editionable, unitType, ifNotExists, name, parameterList, returnClause, unitModifiers)

    this.#parameterList = this.children.find(ofType(DeclarationParameterListExpressionSyntaxNode))
    this.returnClause = this.children.find(ofType(ReturnDeclarationExpressionSyntaxNodeBase))
  }

  get memberKind() { return 'method' }
  get methodType() { return this.unitType }
  get methodKind() { return this.methodType.name }
  get parameterList() { return this.#parameterList }
  get parameters() { return this.#parameterList?.parameters ?? [] }
}
exports.CreateMethodExpressionSyntaxNode = CreateMethodExpressionSyntaxNode

/**
 * `CREATE [OR REPLACE] [FUNCTION|PROCEDURE]` statement, including body.
 */
class CreateStandaloneMethodStatementSyntaxNode extends CreatePlsqlUnitStatementSyntaxNode {
  /** @type {Token?} The `IS` or `AS` keyword (optional). */ isOrAsKeyword
  /** @type {SyntaxNode} */ body
  /** @type {MemberSyntaxNode[]} */ members

  /**
   * @param {SyntaxNode} create `CREATE [OR REPLACE]`
   * @param {SyntaxNode} editionable `EDITIONABLE` clause
   * @param {UnitTypeSyntaxNode} unitType `FUNCTION` or `PROCEDURE`
   * @param {SyntaxNode?} ifNotExists `IF NOT EXISTS`
   * @param {IdentifierSyntaxNode} name The name of the function or procedure.
   * @param {DeclarationParameterListExpressionSyntaxNode?} parameterList The parameters, if any.
   * @param {ReturnDeclarationExpressionSyntaxNode?} returnClause The return clause (function only)
   * @param {UnitModifierExpressionSyntaxNode[]} unitModifiers Various clauses applying to this unit (e.g., invoker_rights_clause, deterministic_clause).
   * @param {TokenLike?} isOrAsKeyword The `IS` or `AS` keyword (optional)
   * @param {DocumentCommentSyntaxNode?} docComment
   * @param {SyntaxNode} body
   * @param {TokenLike?} semicolonToken The terminating semicolon (`;`), if any.
   * @param {TokenLike?} slashToken The terminating slash (`/`), if any.
   */
  constructor(create, editionable, unitType, ifNotExists, name, parameterList, returnClause, unitModifiers, isOrAsKeyword, docComment, body, semicolonToken, slashToken) {
    const createExpression = new CreateMethodExpressionSyntaxNode(
      create, editionable, unitType, ifNotExists,
      name, parameterList, returnClause, unitModifiers
    )

    if (isOrAsKeyword) mustBeTokenLike(isOrAsKeyword, 'isOrAsKeyword')
    if (docComment) mustBeInstanceOf(docComment, DocumentCommentSyntaxNode, 'docComment')
    if (semicolonToken) mustBeTokenLike(semicolonToken, 'semicolonToken')
    if (slashToken) mustBeTokenLike(slashToken, 'slashToken')

    super(createExpression, isOrAsKeyword, docComment, body, semicolonToken, slashToken)

    this.isOrAsKeyword = this.resolveToken(isOrAsKeyword)
    this.body = body
    // this.processPragmas(this.members) // TODO
    console.assert(this.docComment == docComment, 'oops docComment not assigned (note == not === because null vs undefined)')
  }
}
exports.CreateStandaloneMethodStatementSyntaxNode = CreateStandaloneMethodStatementSyntaxNode

// -----------------

/**
 * `CREATE [OR REPLACE] PACKAGE` opening expression (all before the `IS`/`AS`).
 */
class CreatePackageExpressionSyntaxNode extends CreateUnitExpressionSyntaxNode {
  /**
   * @param {SyntaxNode} create `CREATE [OR REPLACE]`
   * @param {SyntaxNode} editionable `EDITIONABLE` clause
   * @param {UnitTypeSyntaxNode} unitType `PACKAGE`
   * @param {SyntaxNode?} ifNotExists `IF NOT EXISTS`
   * @param {IdentifierSyntaxNode} name
   * @param {UnitModifierExpressionSyntaxNode[]} unitModifiers
   */
  constructor(create, editionable, unitType, ifNotExists, name, unitModifiers) {
    super(create, editionable, unitType, ifNotExists, name, unitModifiers)
  }
}
exports.CreatePackageExpressionSyntaxNode = CreatePackageExpressionSyntaxNode

/**
 * `CREATE [OR REPLACE] PACKAGE` spec statement, including members.
 */
class CreatePackageStatementSyntaxNode extends CreatePlsqlUnitStatementSyntaxNode {
  /** @type {Token} The `IS` or `AS` keyword. */ isOrAsKeyword
  /** @type {SyntaxNode[]} */ content
  /** @type {MemberSyntaxNode[]} */ members

  /**
   * @param {SyntaxNode} create `CREATE [OR REPLACE]`
   * @param {SyntaxNode} editionable `EDITIONABLE` clause
   * @param {UnitTypeSyntaxNode} unitType `PACKAGE`
   * @param {SyntaxNode?} ifNotExists `IF NOT EXISTS`
   * @param {IdentifierSyntaxNode} name The name of the package.
   * @param {UnitModifierExpressionSyntaxNode[]} unitModifiers Various clauses applying to this unit (e.g., invoker_rights_clause, deterministic_clause).
   * @param {TokenLike} isOrAsKeyword The `IS` or `AS` keyword.
   * @param {DocumentCommentSyntaxNode?} docComment
   * @param {SyntaxNode[]} content
   * @param {TokenLike?} semicolonToken The terminating semicolon (`;`), if any.
   * @param {TokenLike?} slashToken The terminating slash (`/`), if any.
   */
  constructor(create, editionable, unitType, ifNotExists, name, unitModifiers, isOrAsKeyword, docComment, content, semicolonToken, slashToken) {
    const createExpression = new CreatePackageExpressionSyntaxNode(create, editionable, unitType, ifNotExists, name, unitModifiers)

    mustBeInstanceOf(createExpression, CreatePackageExpressionSyntaxNode, 'createExpression')
    mustBeTokenLike(isOrAsKeyword, 'isOrAsKeyword')
    if (docComment) mustBeInstanceOf(docComment, DocumentCommentSyntaxNode, 'docComment')
    mustBeArray(content, 'content')
    content.forEach((m, i) => mustBeInstanceOf(m, SyntaxNode, `content[${i}]`))
    if (semicolonToken) mustBeTokenLike(semicolonToken, 'semicolonToken')
    if (slashToken) mustBeTokenLike(slashToken, 'slashToken')

    super(createExpression, isOrAsKeyword, docComment, content, semicolonToken, slashToken)

    this.isOrAsKeyword = this.resolveToken(isOrAsKeyword)
    this.content = content

    this.members = this.content.filter(isMemberSyntaxNode)
    this.processPragmas(this.members)
    console.assert(this.docComment == docComment, 'oops docComment not assigned (note == not === because null vs undefined)')
  }
}
exports.CreatePackageStatementSyntaxNode = CreatePackageStatementSyntaxNode

/**
 * `CREATE [OR REPLACE] PACKAGE` spec statement, including members.
 */
class CreatePackageBodyStatementSyntaxNode extends CreatePlsqlUnitStatementSyntaxNode {
  /** @type {Token} The `IS` or `AS` keyword. */ isOrAsKeyword
  /** @type {SyntaxNode[]} */ content
  /** @type {MemberSyntaxNode[]} */ members

  /**
   * @param {SyntaxNode} create `CREATE [OR REPLACE]`
   * @param {SyntaxNode} editionable `EDITIONABLE` clause
   * @param {UnitTypeSyntaxNode} unitType `PACKAGE`
   * @param {SyntaxNode?} ifNotExists `IF NOT EXISTS`
   * @param {IdentifierSyntaxNode} name The name of the package.
   * @param {UnitModifierExpressionSyntaxNode[]} unitModifiers Various clauses applying to this unit (e.g., invoker_rights_clause, deterministic_clause).
   * @param {TokenLike} isOrAsKeyword The `IS` or `AS` keyword.
   * @param {DocumentCommentSyntaxNode?} docComment
   * @param {DeclareSectionSyntaxNode?} declareSection,
   * @param {BlockBodySyntaxNode} blockBody,
   * @param {TokenLike?} semicolonToken The terminating semicolon (`;`), if any.
   * @param {TokenLike?} slashToken The terminating slash (`/`), if any.
   */
  constructor(create, editionable, unitType, ifNotExists, name, unitModifiers, isOrAsKeyword, docComment, declareSection, blockBody, semicolonToken, slashToken) {
    const createExpression = new CreatePackageExpressionSyntaxNode(create, editionable, unitType, ifNotExists, name, unitModifiers)

    mustBeTokenLike(isOrAsKeyword, 'isOrAsKeyword')
    if (docComment) mustBeInstanceOf(docComment, DocumentCommentSyntaxNode, 'docComment')
    if (semicolonToken) mustBeTokenLike(semicolonToken, 'semicolonToken')
    if (slashToken) mustBeTokenLike(slashToken, 'slashToken')

    super(createExpression, isOrAsKeyword, docComment, declareSection, blockBody, semicolonToken, slashToken)

    this.isOrAsKeyword = this.resolveToken(isOrAsKeyword)
    this.declareSection = declareSection
    this.members = this.declareSection?.children.filter(isMemberSyntaxNode) ?? []
    this.processPragmas(this.members)
    console.assert(this.docComment == docComment, 'oops docComment not assigned (note == not === because null vs undefined)')
  }
}
exports.CreatePackageBodyStatementSyntaxNode = CreatePackageBodyStatementSyntaxNode

// -----------------

class CreateTypeExpressionSyntaxNode extends CreateUnitExpressionSyntaxNode {
  /**
   * @param {SyntaxNode} create `CREATE [OR REPLACE]`
   * @param {SyntaxNode} editionable `EDITIONABLE` clause
   * @param {UnitTypeSyntaxNode} unitType `TYPE`
   * @param {SyntaxNode?} ifNotExists `IF NOT EXISTS`
   * @param {IdentifierSyntaxNode} name
   * @param {SyntaxNode?} force
   * @param {SyntaxNode?} oid
   * @param {UnitModifierExpressionSyntaxNode[]} unitModifiers
   */
  constructor(create, editionable, unitType, ifNotExists, name, force, oid, unitModifiers) {
    super(create, editionable, unitType, ifNotExists, name, force, oid, unitModifiers)
  }
}
exports.CreateTypeExpressionSyntaxNode = CreateTypeExpressionSyntaxNode

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
   * @param {CreateTypeExpressionSyntaxNode} createExpression
   * @param {TokenLike} isOrUnderKeyword `IS`, `AS`, or `UNDER`
   * @param {TokenLike | IdentifierSyntaxNode} keywordOrBaseType
   * @param {ObjectMemberListDeclarationExpressionSyntaxNode} memberList
   * @param {SyntaxNode[]} typeModifiers
   * @param {TokenLike?} semicolonToken The terminating semicolon (`;`), if any.
   * @param {TokenLike?} slashToken The terminating slash (`/`), if any.
   */
  constructor(createExpression, isOrUnderKeyword, keywordOrBaseType, memberList, typeModifiers, semicolonToken, slashToken) {
    mustBeInstanceOf(createExpression, CreateTypeExpressionSyntaxNode, 'createExpression')
    mustBeTokenLike(isOrUnderKeyword, 'isOrUnderKeyword')
    mustBeObject(keywordOrBaseType, 'keywordOrBaseType')
    mustBeInstanceOf(memberList, ObjectMemberListDeclarationExpressionSyntaxNode, 'memberList')
    mustBeArray(typeModifiers, 'typeModifiers')
    typeModifiers.forEach((m, i) => mustBeInstanceOf(m, SyntaxNode, `typeModifiers[${i}]`))
    if (semicolonToken) mustBeTokenLike(semicolonToken, 'semicolonToken')
    if (slashToken) mustBeTokenLike(slashToken, 'slashToken')

    super(createExpression, isOrUnderKeyword, keywordOrBaseType, memberList, typeModifiers, semicolonToken, slashToken)

    this.baseType = keywordOrBaseType instanceof IdentifierSyntaxNode ? keywordOrBaseType : null
    this.#memberList = memberList
    this.typeModifiers = typeModifiers

    // Doc comment comes from members
    this.docComment = memberList.docComment

    this.processPragmas(this.members)

    // SPECIAL: set the return type for constructors to our type.
    if (this.constructors.length > 0) {
      const typeExpression = new TypeExpressionSyntaxNode(this.name)
      for (const constructor of this.constructors) {
        constructor.returnClause.type = typeExpression
      }
    }

    console.assert(semicolonToken ? this.semicolonToken?.start === semicolonToken.start : !this.semicolonToken, 'oops;')
    console.assert(slashToken ? this.slashToken?.start === slashToken.start : !this.slashToken, 'oops/')
  }

  /** @type {ConstructorDeclarationExpressionSyntaxNode[]} */
  get constructors() {
    return this.methods.filter(/** @returns {x is ConstructorDeclarationExpressionSyntaxNode} */ x => x instanceof ConstructorDeclarationExpressionSyntaxNode)
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
   * @param {CreateTypeExpressionSyntaxNode} createExpression
   * @param {TokenLike} isOrAsKeyword
   * @param {TokenLike} objectKeyword
   * @param {ObjectMemberListDeclarationExpressionSyntaxNode} memberList
   * @param {SyntaxNode[]} typeModifiers
   * @param {TokenLike?} semicolonToken The terminating semicolon (`;`), if any.
   * @param {TokenLike?} slashToken The terminating slash (`/`), if any.
   */
  constructor(createExpression, isOrAsKeyword, objectKeyword, memberList, typeModifiers, semicolonToken, slashToken) {
    mustBeInstanceOf(createExpression, CreateTypeExpressionSyntaxNode, 'createExpression')
    mustBeTokenLike(isOrAsKeyword, 'isOrAsKeyword')
    mustBeTokenLike(objectKeyword, 'objectKeyword')
    mustBeInstanceOf(memberList, ObjectMemberListDeclarationExpressionSyntaxNode, 'memberList')
    mustBeArray(typeModifiers, 'typeModifiers')
    typeModifiers.forEach((m, i) => mustBeInstanceOf(m, SyntaxNode, `typeModifiers[${i}]`))
    if (semicolonToken) mustBeTokenLike(semicolonToken, 'semicolonToken')
    if (slashToken) mustBeTokenLike(slashToken, 'slashToken')

    super(createExpression, isOrAsKeyword, objectKeyword, memberList, typeModifiers, semicolonToken, slashToken)

    this.isOrAsKeyword = this.resolveToken(isOrAsKeyword)
    this.objectKeyword = this.resolveToken(objectKeyword)
  }
}
exports.CreateBaseObjectTypeStatementSyntaxNode = CreateBaseObjectTypeStatementSyntaxNode

/**
 * SQL statement for an inherited object type.
 */
class CreateInheritedObjectTypeStatementSyntaxNode extends CreateObjectTypeStatementSyntaxNode {
  /** @type {Token} `UNDER` */ underKeyword

  /**
   * @param {CreateTypeExpressionSyntaxNode} createExpression
   * @param {TokenLike} underKeyword `UNDER` keyword (as opposed to `IS`)
   * @param {IdentifierSyntaxNode} baseType
   * @param {ObjectMemberListDeclarationExpressionSyntaxNode} memberList
   * @param {SyntaxNode[]} typeModifiers
   * @param {TokenLike?} semicolonToken The terminating semicolon (`;`), if any.
   * @param {TokenLike?} slashToken The terminating slash (`/`), if any.
   */
  constructor(createExpression, underKeyword, baseType, memberList, typeModifiers, semicolonToken, slashToken) {
    mustBeInstanceOf(createExpression, CreateTypeExpressionSyntaxNode, 'createExpression')
    mustBeTokenLike(underKeyword, 'underKeyword')
    mustBeInstanceOf(baseType, IdentifierSyntaxNode, 'baseType')
    mustBeInstanceOf(memberList, ObjectMemberListDeclarationExpressionSyntaxNode, 'memberList')
    mustBeArray(typeModifiers, 'typeModifiers')
    typeModifiers.forEach((m, i) => mustBeInstanceOf(m, SyntaxNode, `typeModifiers[${i}]`))
    if (semicolonToken) mustBeTokenLike(semicolonToken, 'semicolonToken')
    if (slashToken) mustBeTokenLike(slashToken, 'slashToken')

    super(createExpression, underKeyword, baseType, memberList, typeModifiers, semicolonToken, slashToken)

    this.underKeyword = this.resolveToken(underKeyword)
  }
}
exports.CreateInheritedObjectTypeStatementSyntaxNode = CreateInheritedObjectTypeStatementSyntaxNode

class CreateNestedTableTypeStatementSyntaxNode extends CreateTypeStatementSyntaxNode {
  /** @type {Token} `IS` or `AS` */ isOrAsKeyword
  /** @type {TypeExpressionSyntaxNode} The base type on which this is derived. */ baseType

  /**
   * @param {CreateTypeExpressionSyntaxNode} createExpression
   * @param {TokenLike} isOrAsKeyword
   * @param {DocumentCommentSyntaxNode?} docComment
   * @param {TypeExpressionSyntaxNode} baseType
   * @param {SyntaxNode[]} typeModifiers
   * @param {TokenLike?} semicolonToken The terminating semicolon (`;`), if any.
   * @param {TokenLike?} slashToken The terminating slash (`/`), if any.
   */
  constructor(createExpression, isOrAsKeyword, docComment, baseType, typeModifiers, semicolonToken, slashToken) {
    mustBeInstanceOf(createExpression, CreateTypeExpressionSyntaxNode, 'createExpression')
    mustBeTokenLike(isOrAsKeyword, 'isOrAsKeyword')
    if (docComment) mustBeInstanceOf(docComment, DocumentCommentSyntaxNode, 'docComment')
    mustBeInstanceOf(baseType, TypeExpressionSyntaxNode, 'baseType')
    if (semicolonToken) mustBeTokenLike(semicolonToken, 'semicolonToken')
    if (slashToken) mustBeTokenLike(slashToken, 'slashToken')

    super(createExpression, isOrAsKeyword, docComment, baseType, typeModifiers, semicolonToken, slashToken)

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

class ExceptionDeclarationStatementSyntaxNode extends MemberStatementSyntaxNode {
  /** @type {Token} */ exceptionKeyword

  /**
   * @param {IdentifierSyntaxNode} name
   * @param {TokenLike} exceptionKeyword
   * @param {TokenLike?} semicolonToken
   */
  constructor(name, exceptionKeyword, semicolonToken) {
    super('exception', name, exceptionKeyword, semicolonToken)
    this.exceptionKeyword = this.resolveToken(exceptionKeyword)

    console.assert(this.name === name)
    console.assert(semicolonToken ? this.semicolonToken?.start === semicolonToken.start : !this.semicolonToken, 'oops;')
  }
}
exports.ExceptionDeclarationStatementSyntaxNode = ExceptionDeclarationStatementSyntaxNode

class VariableDeclarationStatementSyntaxNode extends MemberStatementSyntaxNode {
  /** @type {Token?} */ constantKeyword
  /** @type {SyntaxNode} */ type
  /** @type {Token?} The `DEFAULT` keyword or symbol (`:=`) */ defaultToken
  /** @type {SyntaxNode?} */ defaultValue

  /**
   * @param {IdentifierSyntaxNode} name
   * @param {TokenLike?} constantKeyword
   * @param {SyntaxNode} type
   * @param {TokenLike?} defaultToken The `DEFAULT` keyword or symbol (`:=`)
   * @param {SyntaxNode?} defaultValue
   * @param {TokenLike} semicolonToken
   */
  constructor(name, constantKeyword, type, defaultToken, defaultValue, semicolonToken) {
    super('variable', name, constantKeyword, type, defaultToken, defaultValue, semicolonToken)

    this.constantKeyword = this.resolveToken(constantKeyword)
    this.type = type
    this.defaultToken = this.resolveToken(defaultToken)
    this.defaultValue = defaultValue
  }

  get isConstant() {
    return !!this.constantKeyword
  }
}
exports.VariableDeclarationStatementSyntaxNode = VariableDeclarationStatementSyntaxNode

/**
 * Base class for all `TYPE` and `SUBTYPE` declaration statements.
 */
class TypeDeclarationStatementSyntaxNodeBase extends MemberStatementSyntaxNode {
  /** @type {Token} The `IS` keyword.*/ isKeyword

  /**
   * @param {TokenLike} typeOrSubtypeKeyword The initial keyword (typically `TYPE` or `SUBTYPE`).
   * @param {IdentifierSyntaxNode} name The identifier.
   * @param {TokenLike} isKeyword The `IS` keyword.
   * @param {...SyntaxNodeOrTokenLikeOrIterable} params
   */
  constructor(typeOrSubtypeKeyword, name, isKeyword, ...params) {
    mustBeTokenLike(typeOrSubtypeKeyword, 'typeOrSubtypeKeyword')
    mustBeInstanceOf(name, IdentifierSyntaxNode, 'name')
    mustBeTokenLike(isKeyword, 'isKeyword')
    mustBeArray(params, 'params')

    super('type', typeOrSubtypeKeyword, name, isKeyword, ...params)

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

// -----------------

/**
 * `TYPE <identifier> IS <other>` declaration.
 */
class TypeDeclarationStatementSyntaxNode extends TypeDeclarationStatementSyntaxNodeBase {
  /** @type {Token} The `TYPE` keyword. */ typeKeyword
  /** @type {TypeExpressionSyntaxNode} The base type definition. */ baseType

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
 * `TYPE <identifier> IS RECORD (...)` declaration.
 */
class RecordTypeDeclarationStatementSyntaxNode extends TypeDeclarationStatementSyntaxNode {
  /** @override @type {RecordTypeExpressionSyntaxNode} The `RECORD IS (...)` type expression.  */ baseType = null

  /**
   * @param {TokenLike} typeKeyword The `TYPE` keyword.
   * @param {IdentifierSyntaxNode} name The identifier.
   * @param {TokenLike} isKeyword The `IS` keyword.
   * @param {RecordTypeExpressionSyntaxNode} baseType
   * @param {TokenLike} semicolonToken
   */
  constructor(typeKeyword, name, isKeyword, baseType, semicolonToken) {
    super(typeKeyword, name, isKeyword, baseType, semicolonToken)
    this.baseType = baseType
  }

  /** @type {Token} The `RECORD` keyword */
  get recordKeyword() {
    return this.baseType.recordKeyword
  }
  get openParenToken() {
    return this.baseType.openParenToken
  }
  get closeParenToken() {
    return this.baseType.closeParenToken
  }
  get fields() {
    return this.baseType.fields
  }
}
exports.RecordTypeDeclarationStatementSyntaxNode = RecordTypeDeclarationStatementSyntaxNode

/** Marker type for collection type declarations. */
class CollectionTypeDeclarationStatementSyntaxNode extends TypeDeclarationStatementSyntaxNode {
  /** @override @type {CollectionTypeExpressionSyntaxNode} The type expression. */ baseType = null
  /**
   * @param {TokenLike} typeKeyword The `TYPE` keyword.
   * @param {IdentifierSyntaxNode} name The identifier.
   * @param {TokenLike} isKeyword The `IS` keyword.
   * @param {CollectionTypeExpressionSyntaxNode} baseType
   * @param {TokenLike} semicolonToken
   */
  constructor(typeKeyword, name, isKeyword, baseType, semicolonToken) {
    super(typeKeyword, name, isKeyword, baseType, semicolonToken)
    this.baseType = baseType
  }
}
exports.CollectionTypeDeclarationStatementSyntaxNode = CollectionTypeDeclarationStatementSyntaxNode

/** Marker type for `REF CURSOR` type declarations. */
class RefCursorTypeDeclarationStatementSyntaxNode extends TypeDeclarationStatementSyntaxNode {
  /** @override @type {RefCursorTypeExpressionSyntaxNode} The type expression. */ baseType = null
  /**
   * @param {TokenLike} typeKeyword The `TYPE` keyword.
   * @param {IdentifierSyntaxNode} name The identifier.
   * @param {TokenLike} isKeyword The `IS` keyword.
   * @param {RefCursorTypeExpressionSyntaxNode} baseType
   * @param {TokenLike} semicolonToken
   */
  constructor(typeKeyword, name, isKeyword, baseType, semicolonToken) {
    super(typeKeyword, name, isKeyword, baseType, semicolonToken)
    this.baseType = baseType
  }

  /** @type {Token} The `REF` keyword. */ get refKeyword() { return this.baseType.refKeyword }
  /** @type {Token} The `CURSOR` keyword. */ get cursorKeyword() { return this.baseType.cursorKeyword }
  /** @type {Token?} The `RETURN` keyword (optional). */ get returnKeyword() { return this.baseType.returnKeyword }
  /** @type {TypeExpressionSyntaxNode?} The returned row type. */ get rowType() { return this.baseType.rowType }
}
exports.RefCursorTypeDeclarationStatementSyntaxNode = RefCursorTypeDeclarationStatementSyntaxNode

// -----------------

/**
 * @typedef _MethodSyntaxNode
 * @property {UnitTypeSyntaxNode} methodType The method type (e.g., `PROCEDURE`, `FUNCTION`).
 * @property {string} memberKind
 * @property {string} methodKind The full method kind as described by ORACLE.
 * @property {DeclarationParameterListExpressionSyntaxNode?} parameterList
 * @property {DeclarationParameterExpressionSyntaxNode[]} parameters
 * @property {ReturnDeclarationSyntaxNode?} returnClause
 * @property {UnitModifierExpressionSyntaxNode[]} unitModifiers
 *
 * @typedef {NamedSyntaxNode & _MethodSyntaxNode} MethodSyntaxNode
 * @typedef {MemberSyntaxNode & MethodSyntaxNode} MethodDeclarationSyntaxNode
 */

/**
 * Represents a PL/SQL method header (name, params, return clause, unit modifiers)
 * from any PL/SQL unit.
 * @implements {MethodDeclarationSyntaxNode}
 */
class MethodDeclarationExpressionSyntaxNodeBase extends MemberExpressionSyntaxNode {
  #methodType
  #parameterList
  /** @type {ReturnDeclarationExpressionSyntaxNodeBase?} The return clause for this declaration, if any. */ returnClause
  /** @type {UnitModifierExpressionSyntaxNode[]} Various clauses applying to this method (e.g., invoker_rights_clause, deterministic_clause). */ unitModifiers

  /**
   * @param  {...SyntaxNodeOrTokenLikeOrIterable} nodesOrTokens
   */
  constructor(...nodesOrTokens) {
    super('method', ...nodesOrTokens)
    this.#methodType = this.children.find(ofType(UnitTypeSyntaxNode))
    this.#parameterList = this.children.find(ofType(DeclarationParameterListExpressionSyntaxNode))
    this.returnClause = this.children.find(ofType(ReturnDeclarationExpressionSyntaxNodeBase))
    this.unitModifiers = this.children.filter(ofType(UnitModifierExpressionSyntaxNode))
  }

  get methodType() {
    return this.#methodType
  }

  get methodKind() {
    return this.methodType.name
  }

  get parameterList() { return this.#parameterList }
  get parameters() { return this.#parameterList?.parameters ?? [] }
}
exports.MethodDeclarationExpressionSyntaxNodeBase = MethodDeclarationExpressionSyntaxNodeBase

/**
 * Represents a PL/SQL subprogram header (name, params, return clause, unit modifiers)
 * from any non-object PL/SQL unit (function, procedure, package).
 */
class MethodDeclarationExpressionSyntaxNode extends MethodDeclarationExpressionSyntaxNodeBase {
  /**
   * @param {UnitTypeSyntaxNode} methodType The method type (`PROCEDURE`, `FUNCTION`)
   * @param {IdentifierSyntaxNode} name
   * @param {DeclarationParameterListExpressionSyntaxNode?} parameterList
   * @param {ReturnDeclarationExpressionSyntaxNode} returnClause
   * @param {UnitModifierExpressionSyntaxNode[]} unitModifiers
   */
  constructor(methodType, name, parameterList, returnClause, unitModifiers) {
    super(methodType, name, parameterList, returnClause, unitModifiers)
  }
}
exports.MethodDeclarationExpressionSyntaxNode = MethodDeclarationExpressionSyntaxNode

/**
 * Base class of any method declaration.
 * @implements {MethodDeclarationSyntaxNode}
 * @see ConstructorDeclarationExpressionSyntaxNode
 * @see MethodDeclarationStatementSyntaxNode
 * @see ObjectMethodDeclarationExpressionSyntaxNode
 */
class MethodDeclarationStatementSyntaxNodeBase extends MemberStatementSyntaxNode {
  /** @type {MethodDeclarationExpressionSyntaxNodeBase} The method header. */ header
  /** @type {string} A unique ID for this procedure within context. */ id

  /**
   * @param {MethodDeclarationExpressionSyntaxNodeBase} header The method header.
   * @param  {...SyntaxNodeOrTokenLikeOrIterable} nodesOrTokens
   */
  constructor(header, ...nodesOrTokens) {
    mustBeInstanceOf(header, MethodDeclarationExpressionSyntaxNodeBase, 'header')
    super(header.memberKind, header, ...nodesOrTokens)
    this.header = this.children.find(/** @returns {x is MethodDeclarationExpressionSyntaxNodeBase} */ x => x instanceof MethodDeclarationExpressionSyntaxNodeBase)
  }

  get memberKind() { return this.header.memberKind }
  get methodKind() { return this.header.methodKind }

  get methodType() { return this.header.methodType }
  get name() { return this.header.name }
  get parameterList() { return this.header.parameterList }
  get parameters() { return this.header.parameters }
  get returnClause() { return this.header.returnClause }
  get openParenToken() { return this.parameterList?.openParenToken }
  get closeParenToken() { return this.parameterList?.closeParenToken }
  get unitModifiers() { return this.header.unitModifiers }
}
exports.MethodDeclarationStatementSyntaxNodeBase = MethodDeclarationStatementSyntaxNodeBase

// -----------------

/**
 * @param {any} value
 * @returns {value is MethodSyntaxNode}
 */
const isMethodSyntaxNode = (value) =>
  isMethodDeclarationSyntaxNode(value) || value instanceof CreateMethodExpressionSyntaxNode
exports.isMethodSyntaxNode = isMethodSyntaxNode

/**
 * @param {any} value
 * @returns {value is MethodDeclarationSyntaxNode}
 */
const isMethodDeclarationSyntaxNode = (value) =>
  value instanceof MethodDeclarationExpressionSyntaxNodeBase || value instanceof MethodDeclarationStatementSyntaxNodeBase
exports.isMethodDeclarationSyntaxNode = isMethodDeclarationSyntaxNode

// -----------------

/**
 * Represents a PL/SQL subprogram (procedure, function) within the context of a declaration block
 * (including PL/SQL package specs and bodies).
 */
class MethodDeclarationStatementSyntaxNode extends MethodDeclarationStatementSyntaxNodeBase {
  /** @type {Token?} */ isOrAsKeyword
  /** @type {StatementSyntaxNode?} The method body (optional) */ body

  /**
   * @param {UnitTypeSyntaxNode} methodType The method type (`PROCEDURE`, `FUNCTION`)
   * @param {IdentifierSyntaxNode} name
   * @param {DeclarationParameterListExpressionSyntaxNode?} parameterList
   * @param {ReturnDeclarationExpressionSyntaxNode} returnClause
   * @param {UnitModifierExpressionSyntaxNode[]} unitModifiers
   * @param {TokenLike?} isOrAsKeyword The `IS` or `AS` keyword.
   * @param {StatementSyntaxNode?} body An optional body.
   * @param {TokenLike?} semicolonToken The terminating semicolon (`;`), if any.
   */
  constructor(methodType, name, parameterList, returnClause, unitModifiers, isOrAsKeyword, body, semicolonToken) {
    super(new MethodDeclarationExpressionSyntaxNode(methodType, name, parameterList, returnClause, unitModifiers), isOrAsKeyword, body, semicolonToken)

    this.isOrAsKeyword = this.resolveToken(isOrAsKeyword)
    this.body = body
  }
}
exports.MethodDeclarationStatementSyntaxNode = MethodDeclarationStatementSyntaxNode

class DeclareSectionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {Token?} The (optional) `DECLARE` token. */ declareToken
  /** @type {StatementSyntaxNode[]} */ declarations

  /**
   * @param {...StatementSyntaxNode} declarations
   */
  constructor(declareToken, ...declarations) {
    super(declareToken, ...declarations)

    this.declareToken = this.resolveToken(declareToken)
    this.declarations = declarations
  }
}
exports.DeclareSectionSyntaxNode = DeclareSectionSyntaxNode

class ExceptionNameListSyntaxNode extends ExpressionSyntaxNode {
  /** @type {IdentifierSyntaxNode[]} */ exceptions

  /**
   *
   * @param  {...(IdentifierSyntaxNode | TokenLike)} exceptionsWithOrKeywords
   */
  constructor(...exceptionsWithOrKeywords) {
    super(...exceptionsWithOrKeywords)
    this.exceptions = exceptionsWithOrKeywords.filter(ofType(IdentifierSyntaxNode))
  }
}

/**
 * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/exception-handler.html#GUID-3FECF29B-A240-4191-A635-92C612D00C4D__CJAEIGAB
 * ```bnf
 * WHEN { exception [ OR exception ]... | OTHERS }
 *   THEN statement [ statement ]...
 * ```
 */
class ExceptionHandlerSyntaxNode extends ExpressionSyntaxNode {
  /** @type {Token} `WHEN` */ whenKeyword
  /** @type {ExceptionNameListSyntaxNode} The list of exception names (or `OTHERS` keyword)  */ exceptionNameList
  /** @type {Token} `THEN` */ thenKeyword
  /** @type {StatementSyntaxNode[]} */ statements

  /**
   * @param {TokenLike} whenKeyword
   * @param {ExceptionNameListSyntaxNode} exceptionNameList
   * @param {TokenLike} thenKeyword
   * @param {StatementSyntaxNode[]} statements
   */
  constructor(whenKeyword, exceptionNameList, thenKeyword, ...statements) {
    super(whenKeyword, exceptionNameList, thenKeyword, ...statements)
    this.whenKeyword = this.resolveToken(whenKeyword)
    this.exceptionNameList = exceptionNameList
    this.thenKeyword = this.resolveToken(thenKeyword)
    this.statements = statements
  }
}

/**
 * ```bnf
 * EXCEPTION exception_handler [ exception_handler ]... ]
 * ```
 */
class ExceptionHandlerListSyntaxNode extends ExpressionSyntaxNode {
  /** @type {Token} `EXCEPTION` */ exceptionKeyword
  /** @type {ExceptionHandlerSyntaxNode[]} */ handlers

  /**
   * @param {TokenLike} exceptionKeyword
   * @param {ExceptionHandlerSyntaxNode[]} handlers
   */
  constructor(exceptionKeyword, ...handlers) {
    super(exceptionKeyword, ...handlers)
    this.exceptionKeyword = this.resolveToken(exceptionKeyword)
    this.handlers = handlers
  }
}

/**
 * ```bnf
 * BEGIN statement ...
 *   [ EXCEPTION exception_handler [ exception_handler ]... ] END [ name ] ;
 * ```
 */
class BlockBodySyntaxNode extends StatementSyntaxNode {
  /** @type {Token} `BEGIN` */ beginToken
  /** @type {StatementSyntaxNode[]} */ statements
  /** @type {ExceptionHandlerListSyntaxNode?} */ exceptionHandlerList
  /** @type {Token} `END` */ endToken

  /**
   * @param {TokenLike} beginToken
   * @param {StatementSyntaxNode[]} statements
   * @param {ExceptionHandlerListSyntaxNode?} exceptionHandlerList
   * @param {TokenLike} endToken
   * @param {IdentifierSyntaxNode?} name The end name (optional)
   * @param {TokenLike} semicolonToken
   */
  constructor(beginToken, statements, exceptionHandlerList, endToken, name, semicolonToken) {
    super(beginToken, statements, exceptionHandlerList, endToken, name, semicolonToken)

    this.beginToken = this.resolveToken(beginToken)
    this.statements = statements
    this.exceptionHandlerList = exceptionHandlerList
    this.endToken = this.resolveToken(endToken)
  }
}
exports.BlockBodySyntaxNode = BlockBodySyntaxNode

class BlockSyntaxNode extends StatementSyntaxNode {
  /** @type {DeclareSectionSyntaxNode?} */ declareSection
  /** @type {BlockBodySyntaxNode} */ block

  /**
   * @param {DeclareSectionSyntaxNode?} declareSection
   * @param {BlockBodySyntaxNode} block
   */
  constructor(declareSection, block) {
    super(declareSection, block)
    this.declareSection = declareSection
    this.block = block
    this.semicolonToken = block.semicolonToken
  }
}
exports.BlockSyntaxNode = BlockSyntaxNode

class MethodBodySyntaxNode extends BlockSyntaxNode { }
exports.MethodBodySyntaxNode = MethodBodySyntaxNode


// -----------------------------------
// PL/SQL Object type unit
// -----------------------------------

/**
 * An object method declaration expression.
 * @see {ConstructorDeclarationExpressionSyntaxNode}
 */
class ObjectMethodDeclarationExpressionSyntaxNode extends MethodDeclarationExpressionSyntaxNodeBase {
  #methodKind

  /**
   * @param {InheritanceFlagSyntaxNode[]} inheritance Inheritance flags.
   * @param {TokenLike?} mapOrOrderKeyword The `MAP` or `ORDER` keyword (optional)
   * @param {TokenLike} memberOrStaticKeyword The `MEMBER` or `STATIC` keyword
   * @param {UnitTypeSyntaxNode} methodType The method type (`PROCEDURE`, `FUNCTION`)
   * @param {IdentifierSyntaxNode} name
   * @param {DeclarationParameterListExpressionSyntaxNode?} parameterList
   * @param {ReturnDeclarationExpressionSyntaxNode?} returnClause
   * @param {UnitModifierExpressionSyntaxNode[]} unitModifiers
   */
  constructor(inheritance, mapOrOrderKeyword, memberOrStaticKeyword, methodType, name, parameterList, returnClause, unitModifiers) {
    super(inheritance, mapOrOrderKeyword, memberOrStaticKeyword, methodType, name, parameterList, returnClause, unitModifiers)

    this.inheritance = inheritance
    this.mapOrOrderKeyword = this.resolveToken(mapOrOrderKeyword)
    this.memberOrStaticKeyword = this.resolveToken(memberOrStaticKeyword)
    console.assert(this.unitModifiers?.length == unitModifiers?.length, 'what2')
    this.#methodKind = [this.mapOrOrderKeyword, this.memberOrStaticKeyword, this.methodType].filter(t => t).join(' ')
  }

  /**
   * @override Gets the full method kind.
   * @example `MEMBER FUNCTION`
   */
  get methodKind() {
    return this.#methodKind
  }
}
exports.ObjectMethodDeclarationExpressionSyntaxNode = ObjectMethodDeclarationExpressionSyntaxNode

/**
 * Represents an object type constructor.
 */
class ConstructorDeclarationExpressionSyntaxNode extends ObjectMethodDeclarationExpressionSyntaxNode {
  /** @override @property {ConstructorReturnDeclarationExpressionSyntaxNode} returnClause */

  /**
   * @param {InheritanceFlagSyntaxNode[]} inheritance
   * @param {TokenLike} constructorKeyword `CONSTRUCTOR`
   * @param {UnitTypeSyntaxNode} methodType `FUNCTION`
   * @param {IdentifierSyntaxNode} name
   * @param {DeclarationParameterListExpressionSyntaxNode?} parameterList
   * @param {ConstructorReturnDeclarationExpressionSyntaxNode} returnClause
   * @param {UnitModifierExpressionSyntaxNode[]} unitModifiers
   */
  constructor(inheritance, constructorKeyword, methodType, name, parameterList, returnClause, unitModifiers) {
    super(inheritance, null, constructorKeyword, methodType, name, parameterList, returnClause, unitModifiers)
  }

  /** The `CONSTRUCTOR` keyword. */
  get constructorKeyword() {
    return this.memberOrStaticKeyword
  }

  get isStatic() {
    return false
  }
}
exports.ConstructorDeclarationExpressionSyntaxNode = ConstructorDeclarationExpressionSyntaxNode

// -------------------------------------

/**
 * @typedef {string} UnitType
 */

/**
 * Node representing the Oracle SQL or PL/SQL unit type.
 */
class UnitTypeSyntaxNode extends SyntaxNode {
  /** @type {UnitType} The canonical name of the type; e.g., `SYNONYM`. */ name

  /**
   * @param {TokenLike | TokenLike[]} tokens The tokens comprising the unit type (e.g., [`PUBLIC`, `SYNONYM`], [`PACKAGE`]).
   * @param {string?} name How Oracle refers to this.  Oracle has compound keywords like `PUBLIC SYNONYM` and `PACKAGE BODY`, but in those the primary ones are `SYNONYM` and `PACKAGE BODY` respectively.
   */
  constructor(tokens, name = undefined) {
    super(tokens)
    this.name = name ?? this.toString('V')
    console.assert(/^\w+(?: \w+)?$/.test(this.name), `${this.textSpan} invalid name`, this.name)
  }
}
exports.UnitTypeSyntaxNode = UnitTypeSyntaxNode

// -----------------

class DeclarationParameterExpressionSyntaxNode extends MemberExpressionSyntaxNode {
  /** @type {ExpressionSyntaxNode?} */ mode
  /** @type {TypeExpressionSyntaxNode} */ type
  /** @type {Token?} The `DEFAULT` keyword or symbol (`:=`) */ defaultToken
  /** @type {AnyExpressionSyntaxNode?} */ defaultValue

  /**
   * @param {IdentifierSyntaxNode} name
   * @param {ExpressionSyntaxNode?} mode
   * @param {TypeExpressionSyntaxNode} type
   * @param {TokenLike?} defaultToken The `DEFAULT` keyword or symbol (`:=`)
   * @param {AnyExpressionSyntaxNode?} defaultValue
   */
  constructor(name, mode, type, defaultToken, defaultValue) {
    super('parameter', name, mode, type, defaultToken, defaultValue)
    this.mode = mode
    this.type = type
    this.defaultToken = this.resolveToken(defaultToken)
    this.defaultValue = defaultValue
  }
}
exports.DeclarationParameterExpressionSyntaxNode = DeclarationParameterExpressionSyntaxNode

class DeclarationParameterListExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {DeclarationParameterExpressionSyntaxNode[]} */ parameters
  /** @type {Token} */ openParenToken
  /** @type {Token} */ closeParenToken

  /**
   * @param {TokenLike} openParenToken
   * @param {(DeclarationParameterExpressionSyntaxNode | TokenLike)[]} parametersWithCommas
   * @param {TokenLike} closeParenToken
   */
  constructor(openParenToken, parametersWithCommas, closeParenToken) {
    super(openParenToken, ...parametersWithCommas, closeParenToken)
    this.parameters = parametersWithCommas.filter(/** @return {x is DeclarationParameterExpressionSyntaxNode} */ x => x instanceof DeclarationParameterExpressionSyntaxNode)

    // Must resolve the canonical tokens.
    this.openParenToken = this.resolveToken(openParenToken)
    this.closeParenToken = this.resolveToken(closeParenToken)
  }
}
exports.DeclarationParameterListExpressionSyntaxNode = DeclarationParameterListExpressionSyntaxNode

// -----------------

/**
 * @typedef _ReturnDeclarationSyntaxNode
 * @property {Token} returnKeyword `RETURN`
 * @property {TypeExpressionSyntaxNode} type The return type.
 *
 * @typedef {SyntaxNode & _ReturnDeclarationSyntaxNode} ReturnDeclarationSyntaxNode
 */

/**
 * @implements {ReturnDeclarationSyntaxNode}
 */
class ReturnDeclarationExpressionSyntaxNodeBase extends ExpressionSyntaxNode {
  /** @type {Token} `RETURN` */ returnKeyword
  /** @type {TypeExpressionSyntaxNode?} The return type. */ type

  /**
   *
   * @param {TokenLike} returnKeyword
   * @param  {...SyntaxNodeOrTokenLike} params
   */
  constructor(returnKeyword, ...params) {
    super(returnKeyword, ...params)
    this.returnKeyword = this.resolveToken(returnKeyword)
  }
}
exports.ReturnDeclarationExpressionSyntaxNodeBase = ReturnDeclarationExpressionSyntaxNodeBase

/**
 * Standard RETURN declaration that indicate it returns a type, not a special keyword.
 */
class ReturnDeclarationExpressionSyntaxNode extends ReturnDeclarationExpressionSyntaxNodeBase {
  /**
   * @param {TokenLike} returnKeyword The `RETURN` keyword.
   * @param {TypeExpressionSyntaxNode} type The return type.
   */
  constructor(returnKeyword, type) {
    super(returnKeyword, type)
    this.type = type
  }
}
exports.ReturnDeclarationExpressionSyntaxNode = ReturnDeclarationExpressionSyntaxNode

/**
 * Constructor return declaration (`RETURN SELF AS RESULT`).
 *
 * @remarks
 * The `type` field is set by the object type owning the constructor.
 */
class ConstructorReturnDeclarationExpressionSyntaxNode extends ReturnDeclarationExpressionSyntaxNodeBase {

  /**
   * @param {TokenLike} returnKeyword `RETURN`
   * @param {...TokenLike} selfAsResultKeywords `SELF`, `AS`, `RESULT`
   */
  constructor(returnKeyword, ...selfAsResultKeywords) {
    super(returnKeyword, ...selfAsResultKeywords)
  }
}
exports.ConstructorReturnDeclarationExpressionSyntaxNode = ConstructorReturnDeclarationExpressionSyntaxNode

// ---------

class UnitModifierExpressionSyntaxNode extends ExpressionSyntaxNode {
}
exports.UnitModifierExpressionSyntaxNode = UnitModifierExpressionSyntaxNode

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
   * @param {(AccessorExpressionSyntaxNode | TokenLike)[]} accessorsWithCommas
   * @param {TokenLike} closeParenToken
   */
  constructor(openParenToken, accessorsWithCommas, closeParenToken) {
    super(openParenToken, ...accessorsWithCommas, closeParenToken)
    this.accessors = accessorsWithCommas.filter(/** @returns {x is AccessorExpressionSyntaxNode} */ x => x instanceof AccessorExpressionSyntaxNode)
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
class AccessibleByExpressionSyntaxNode extends UnitModifierExpressionSyntaxNode {
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
exports.AccessibleByExpressionSyntaxNode = AccessibleByExpressionSyntaxNode

// ---------

/**
 * Object type attributes.
 *
 * ```text
 * <attribute> <datatype>
 * ```
 */
class ObjectAttributeDeclarationExpressionSyntaxNode extends MemberExpressionSyntaxNode {
  /** @type {TypeExpressionSyntaxNode} */ type

  /**
   * @param {IdentifierSyntaxNode} name
   * @param {TypeExpressionSyntaxNode} type
   */
  constructor(name, type) {
    super('attribute', name, type)
    this.type = type
  }
}
exports.ObjectAttributeDeclarationExpressionSyntaxNode = ObjectAttributeDeclarationExpressionSyntaxNode

/**
 * @typedef {ObjectMethodDeclarationExpressionSyntaxNode | ObjectAttributeDeclarationExpressionSyntaxNode} ObjectMemberDeclarationExpressionSyntaxNode
 * Interface for object members.
 */

/**
 * List of object type members, along with punctuation.
 */
class ObjectMemberListDeclarationExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {DocumentCommentSyntaxNode?} The type's doc comment */ docComment
  /** @type {ObjectAttributeDeclarationExpressionSyntaxNode[]} */ attributes
  /** @type {ObjectMethodDeclarationExpressionSyntaxNode[]} */ methods
  /** @type {Token} */ openParenToken
  /** @type {Token} */ closeParenToken

  /**
   * @param {TokenLike} openParenToken
   * @param {DocumentCommentSyntaxNode?} docComment
   * @param {(ObjectMemberDeclarationExpressionSyntaxNode | TokenLike)[]} membersWithCommas
   * @param {TokenLike} closeParenToken
   */
  constructor(openParenToken, docComment, membersWithCommas, closeParenToken) {
    super(openParenToken, docComment, ...membersWithCommas, closeParenToken)
    this.docComment = docComment

    this.attributes = membersWithCommas.filter(/** @return {x is ObjectAttributeDeclarationExpressionSyntaxNode} */ x => x instanceof ObjectAttributeDeclarationExpressionSyntaxNode)
    this.methods = membersWithCommas.filter(/** @return {x is ObjectMethodDeclarationExpressionSyntaxNode} */ x => x instanceof ObjectMethodDeclarationExpressionSyntaxNode)
    console.assert(membersWithCommas.length === this.members.length + membersWithCommas.filter(x => x.toString('V') === ',').length, 'oops')
    // Must resolve the canonical tokens.
    this.openParenToken = this.resolveToken(openParenToken)
    this.closeParenToken = this.resolveToken(closeParenToken)
  }

  /** @type {ObjectMemberDeclarationExpressionSyntaxNode[]} */
  get members() {
    return [].concat(this.attributes, this.methods)
  }
}
exports.ObjectMemberListDeclarationExpressionSyntaxNode = ObjectMemberListDeclarationExpressionSyntaxNode

// dumb syntax node, do not export
class PreprocessorSyntaxNode extends SyntaxNode {
}

/**
 * Represents one of the inheritance flags on a declared type.
 */
class InheritanceFlagSyntaxNode extends SyntaxNode {
  /** @type {Token?} The `NOT` keyword */ notKeyword
  /** @type {Token} The flag name token (e.g., `INHERITED`, `FINAL`) */ nameToken

  /**
   * @param  {...TokenLike} tokens
   */
  constructor(...tokens) {
    super(...tokens)
    this.nameToken = this.lastNontrivialToken
    if (this.tokens.length === 2) {
      this.notKeyword = this.firstNontrivialToken
    }
  }

  /** @type {boolean} Whether this flag is true or false. */
  get value() {
    return !this.notKeyword
  }
}

/**
 * Represents a `PRAGMA` compiler instruction.
 * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/plsql-language-fundamentals.html#GUID-D6EFD7E8-39DF-4430-B625-B6D37E49F6F4
 */
class PragmaDeclarationStatementSyntaxNode extends MemberStatementSyntaxNode {
  /** @type {Token} `PRAGMA` */ pragmaKeyword
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

  /** @type {{ [key: string]: SearchHint[]}} */
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
    'SUPPRESSES_WARNING_6009': ['parent'],
    /** @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/UDF-pragma.html */
    'UDF': ['parent']
  }

  /**
   * @param {TokenLike} pragmaKeyword
   * @param {IdentifierSyntaxNode} name
   * @param {InvocationParameterListExpressionSyntaxNode?} parameterList
   * @param {TokenLike?} semicolonToken
   * @param {SearchHint[]?} searchHints
   */
  constructor(pragmaKeyword, name, parameterList, semicolonToken, searchHints = null) {
    super('pragma', pragmaKeyword, name, parameterList, semicolonToken)
    this.pragmaKeyword = this.resolveToken(pragmaKeyword)
    console.assert(this.name === name)
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
   * @param {NamedSyntaxNode} target The target node.
   * @returns {AnnotationNode}
   */
  createAnnotationNode(target) {
    return new AnnotationNode(this.name, target)
  }

  /**
   * @param {NamedSyntaxNode} node
   * @returns {boolean}
   */
  isMatch(node) {
    return !this.name || this.name.value === node.name.value
  }

  /**
   * Adds an annotation to `node` if it matches this pragma.
   * @param {NamedSyntaxNode} node
   * @returns {AnnotationNode?} The annotation if matched, otherwise `null`
   */
  tryAnnotate(node) {
    if (!this.isMatch(node)) {
      return null
    }

    const annotation = this.createAnnotationNode(node)
    node.annotations.push(annotation)
    return annotation
  }
}
exports.PragmaDeclarationStatementSyntaxNode = PragmaDeclarationStatementSyntaxNode

/**
 * `PRAGMA DEPRECATE`
 * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/DEPRECATE-pragma.html
 */
class DeprecatePragmaDeclarationStatementSyntaxNode extends PragmaDeclarationStatementSyntaxNode {
  /** @override @type {SearchHint[]} */
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
   * @param {TokenLike} pragmaKeyword
   * @param {IdentifierSyntaxNode} name
   * @param {InvocationParameterListExpressionSyntaxNode} parameterList
   * @param {TokenLike?} semicolonToken The terminating semicolon (`;`), if any.
   */
  constructor(pragmaKeyword, name, parameterList, semicolonToken) {
    super(pragmaKeyword, name, parameterList, semicolonToken)

    // JSCRAP: I can decompose to variables but not members. Is that a real limitation or...?
    const [elementName, message] = this.parameters.map(p => p.value)
    mustBeInstanceOf(elementName, IdentifierSyntaxNode, 'parameterList.parameters[0]')
    this.elementName = elementName
    this.message = message

    console.assert(semicolonToken ? this.semicolonToken?.start === semicolonToken.start : !this.semicolonToken, 'oops;')
  }

  /**
   * @override
   * @param {NamedSyntaxNode} node
   * @returns {boolean}
   */
  isMatch(node) {
    mustBeNamedSyntaxNode(node, 'node')
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
   * @param {NamedSyntaxNode} target
   * @returns {AnnotationNode}
   */
  createAnnotationNode(target) {
    // ORACRAP: They called the deprecated annotation `DEPRECATE` not `DEPRECATED`.  Thanks guys.
    return new AnnotationNode('deprecated', this.name, target, this.message)
  }
}
exports.DeprecatePragmaDeclarationStatementSyntaxNode = DeprecatePragmaDeclarationStatementSyntaxNode

/**
 * `PRAGMA EXCEPTION_INIT`
 * @see https://docs.oracle.com/en/database/oracle/oracle-database/23/lnpls/EXCEPTION_INIT-pragma.html
 */
class ExceptionInitPragmaDeclarationStatementSyntaxNode extends PragmaDeclarationStatementSyntaxNode {
  /** @override @type {SearchHint[]} */
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
   * @param {TokenLike} pragmaKeyword
   * @param {IdentifierSyntaxNode} name
   * @param {InvocationParameterListExpressionSyntaxNode} parameterList
   * @param {TokenLike} semicolonToken
   */
  constructor(pragmaKeyword, name, parameterList, semicolonToken) {
    super(pragmaKeyword, name, parameterList, semicolonToken)

    // JSCRAP: I can decompose to variables but not members. Is that a real limitation or...?
    const [exception, errorCode] = this.parameters.map(p => p.value)
    mustBeInstanceOf(exception, IdentifierSyntaxNode, 'exception')
    this.exception = exception
    this.errorCode = errorCode
    this.errorId = ExceptionInitPragmaDeclarationStatementSyntaxNode.#toErrorId(Number(errorCode.toString()))

    console.assert(semicolonToken ? this.semicolonToken?.start === semicolonToken.start : !this.semicolonToken, 'oops;')
  }

  /**
   * @param {number} value
   * @returns {string} Gets an appropriate error code ID.
   */
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
   * @param {NamedSyntaxNode} node
   * @returns {boolean}
   */
  isMatch(node) {
    return node instanceof ExceptionDeclarationStatementSyntaxNode && this.exception.value === node.name.value
  }

  /**
   * @override
   * @param {ExceptionDeclarationStatementSyntaxNode} target
   * @returns {AnnotationNode}
   */
  createAnnotationNode(target) {
    const { name, exception, errorCode, errorId } = this
    return new ExceptionInitAnnotationNode(name, target, exception, errorCode, errorId)
  }
}
exports.ExceptionInitPragmaDeclarationStatementSyntaxNode = ExceptionInitPragmaDeclarationStatementSyntaxNode

class ExceptionInitAnnotationNode extends AnnotationNode {
  /**
   * @param {IdentifierSyntaxNode} name
   * @param {DeclarationStatementSyntaxNode} target
   * @param {IdentifierSyntaxNode} exception
   * @param {ExpressionSyntaxNode} errorCode
   * @param {string} errorId
   */
  constructor(name, target, exception, errorCode, errorId) {
    super(name, target)
    this.exception = exception
    this.errorCode = errorCode
    this.errorId = errorId
  }
}


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
   * @param {(InvocationParameterExpressionSyntaxNode | TokenLike)[]} parametersWithCommas
   * @param {TokenLike} closeParenToken
   */
  constructor(openParenToken, parametersWithCommas, closeParenToken) {
    super(openParenToken, ...parametersWithCommas, closeParenToken)
    this.parameters = parametersWithCommas.filter(/** @returns {x is InvocationParameterExpressionSyntaxNode} */ x => x instanceof InvocationParameterExpressionSyntaxNode)
    // Must resolve the canonical tokens.
    this.openParenToken = this.resolveToken(openParenToken)
    this.closeParenToken = this.resolveToken(closeParenToken)
  }
}
exports.InvocationParameterListExpressionSyntaxNode = InvocationParameterListExpressionSyntaxNode

/**
 * Represents an invocation of a function, procedure, or similar.
 * ```bnf
 * [procedure_name | function_name] [ ( [ parameter [, parameter ]... ] ) ] ;
 * ```
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
exports.InvocationExpressionSyntaxNode = InvocationExpressionSyntaxNode

/**
 * Top-level SQL*Plus statement.
 */
class SqlPlusStatementSyntaxNode extends StatementSyntaxNodeBase {
}
exports.SqlPlusStatementSyntaxNode = SqlPlusStatementSyntaxNode

/**
 * Represents an expression with a unary operator.
 */
class UnaryExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {Token} */ operatorToken
  /** @type {AnyExpressionSyntaxNode} */ expression

  /**
   * @param {TokenLike} operatorToken
   * @param {AnyExpressionSyntaxNode} expression
   */
  constructor(operatorToken, expression) {
    super(operatorToken, expression)

    this.operatorToken = this.resolveToken(operatorToken)
    this.expression = expression
  }
}
exports.UnaryExpressionSyntaxNode = UnaryExpressionSyntaxNode

/**
 * Represents a compound expression consisting of two expressions compbined with a binary operator.
 */
class BinaryExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {AnyExpressionSyntaxNode} */ left
  /** @type {Token} */ operatorToken
  /** @type {AnyExpressionSyntaxNode} */ right

  /**
   * @param {AnyExpressionSyntaxNode} left
   * @param {TokenLike} operatorToken
   * @param {AnyExpressionSyntaxNode} right
   */
  constructor(left, operatorToken, right) {
    super(left, operatorToken, right)

    this.left = left
    this.operatorToken = this.resolveToken(operatorToken)
    this.right = right
  }

  /**
   * @override
   * @param {TokenFormat} format
   * @returns {string}
   */
  toString(format) {
    return `${this.left.toString(format)} ${this.operatorToken.toString(format)} ${this.right.toString(format)}`
  }

  /**
   * @override
   * @param {TokenFormat} format
   * @returns {string}
   */
  toStructuredString(format) {
    return `${this.left.toStructuredString(format)} ${this.operatorToken.toString(format)} ${this.right.toStructuredString(format)}`
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
    super(openParenToken, expression, closeParenToken)
    this.expression = expression
    // Must resolve the canonical tokens.
    this.openParenToken = this.resolveToken(openParenToken)
    this.closeParenToken = this.resolveToken(closeParenToken)
  }
}
exports.ParenthesizedExpressionSyntaxNode = ParenthesizedExpressionSyntaxNode

class LiteralExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {Token} */ keyword
  /** @type {LiteralSyntaxNode} The literal string value in the compound literal. */ literal

  /**
   * @param {TokenLike} keyword
   * @param {LiteralSyntaxNode} literal
   * @param {...SyntaxNodeOrTokenLikeOrIterable} nodesOrTokens
   */
  constructor(keyword, literal, ...nodesOrTokens) {
    super(keyword, literal, ...nodesOrTokens)
    this.keyword = this.resolveToken(keyword)
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
   * @param {TokenLike} intervalKeyword `INTERVAL`
   * @param {LiteralSyntaxNode} literal
   * @param {IntervalLeadingTypeRestrictionExpressionSyntaxNode} leadingRestriction
   * @param {IntervalTrailingTypeRestrictionExpressionSyntaxNode?} trailingRestriction
   */
  constructor(intervalKeyword, literal, leadingRestriction, trailingRestriction) {
    super(intervalKeyword, literal, leadingRestriction, trailingRestriction)

    this.leadingRestriction = this.leadingRestriction
    this.trailingRestriction = this.trailingRestriction
  }
}
exports.DSIntervalLiteralExpressionSyntaxNode = DSIntervalLiteralExpressionSyntaxNode

/**
 * `INTERVAL 'literal' [YEAR|MONTH] [(precision)]? [TO [YEAR|MONTH]]?`
 */
class YMIntervalLiteralExpressionSyntaxNode extends LiteralExpressionSyntaxNode {
  /** @type {IntervalLeadingTypeRestrictionExpressionSyntaxNode?} */ leadingRestriction
  /** @type {IntervalTrailingTypeRestrictionExpressionSyntaxNode?} */ trailingRestriction

  /**
   * @param {TokenLike} intervalKeyword `INTERVAL`
   * @param {LiteralSyntaxNode} literal
   * @param {IntervalLeadingTypeRestrictionExpressionSyntaxNode?} leadingRestriction
   * @param {IntervalTrailingTypeRestrictionExpressionSyntaxNode?} trailingRestriction
   */
  constructor(intervalKeyword, literal, leadingRestriction, trailingRestriction) {
    super(intervalKeyword, literal, leadingRestriction, trailingRestriction)

    this.leadingRestriction = this.leadingRestriction
    this.trailingRestriction = this.trailingRestriction
  }

}
exports.YMIntervalLiteralExpressionSyntaxNode = YMIntervalLiteralExpressionSyntaxNode

/**
 * `DATE 'literal'`
 */
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


/**
 * `TIMESTAMP 'literal' [WITH LOCAL? TIME ZONE]?`
 */
class TimestampLiteralExpressionSyntaxNode extends LiteralExpressionSyntaxNode {
  /** @type {PrecisionTypeRestrictionExpressionSyntaxNode?} */ precision
  /** @type {SyntaxNode?} */ timezoneSpecifier

  /**
   * @param {TokenLike} timestampKeyword
   * @param {LiteralSyntaxNode} literal
   * @param {PrecisionTypeRestrictionExpressionSyntaxNode?} precision
   * @param {SyntaxNode} timezoneSpecifier
   */
  constructor(timestampKeyword, literal, precision, timezoneSpecifier) {
    super(timestampKeyword, literal, precision, timezoneSpecifier)
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
exports.LengthTypeRestrictionExpressionSyntaxNode = LengthTypeRestrictionExpressionSyntaxNode

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
  /** @type {Token?} */ commaToken
  /** @type {Token} */ closeParenToken

  /**
   * @param {TokenLike} openParenToken
   * @param {ExpressionSyntaxNode} precision
   * @param {TokenLike?} commaToken
   * @param {ExpressionSyntaxNode?} scale
   * @param {TokenLike} closeParenToken
   */
  constructor(openParenToken, precision, commaToken, scale, closeParenToken) {
    super(openParenToken, precision, commaToken, scale, closeParenToken)
    this.precision = precision
    this.scale = scale
    // Must resolve the canonical tokens.
    this.openParenToken = this.resolveToken(openParenToken)
    this.closeParenToken = this.resolveToken(closeParenToken)
    this.commaToken = this.resolveToken(commaToken)
  }
}
exports.PrecisionAndScaleTypeRestrictionExpressionSyntaxNode = PrecisionAndScaleTypeRestrictionExpressionSyntaxNode

class RangeTypeRestrictionExpressionSyntaxNode extends TypeRestrictionExpressionSyntaxNode {
  /** @override */
  restrictionKind = 'range'
  /** @type {Token} `RANGE` */ rangeKeyword
  /** @type {ExpressionSyntaxNode} */ lower
  /** @type {ExpressionSyntaxNode} */ upper

  /**
   *
   * @param {TokenLike} rangeKeyword `RANGE`
   * @param {ExpressionSyntaxNode} lower
   * @param {TokenLike} dotdot
   * @param {ExpressionSyntaxNode} upper
   */
  constructor(rangeKeyword, lower, dotdot, upper) {
    super(rangeKeyword, lower, dotdot, upper)
    this.rangeKeyword = this.resolveToken(rangeKeyword)
    this.lower = lower
    this.upper = upper
  }
}
exports.RangeTypeRestrictionExpressionSyntaxNode = RangeTypeRestrictionExpressionSyntaxNode

class IntervalTypeRestrictionExpressionSyntaxNode extends TypeRestrictionExpressionSyntaxNode {
}
exports.IntervalTypeRestrictionExpressionSyntaxNode = IntervalTypeRestrictionExpressionSyntaxNode

class IntervalLeadingTypeRestrictionExpressionSyntaxNode extends IntervalTypeRestrictionExpressionSyntaxNode {
  /**
   * @param {TokenLike} fieldToken `DAY` | `HOUR` | `MINUTE` | `SECOND`
   * @param {(PrecisionTypeRestrictionExpressionSyntaxNode | PrecisionAndScaleTypeRestrictionExpressionSyntaxNode)?} precision
   */
  constructor(fieldToken, precision) {
    super(fieldToken, precision)
  }
}
exports.IntervalLeadingTypeRestrictionExpressionSyntaxNode = IntervalLeadingTypeRestrictionExpressionSyntaxNode

class IntervalTrailingTypeRestrictionExpressionSyntaxNode extends IntervalTypeRestrictionExpressionSyntaxNode {
  /**
   * @param {TokenLike} toKeyword `TO`
   * @param {TokenLike} fieldToken `DAY` | `HOUR` | `MINUTE` | `SECOND`
   * @param {TypeRestrictionExpressionSyntaxNode?} restriction
   */
  constructor(toKeyword, fieldToken, restriction = null) {
    super(toKeyword, fieldToken, restriction)
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
  /** @type {TypeRestrictionExpressionSyntaxNode[]} The restrictions. */ restrictions

  /**
   * @param  {...SyntaxNodeOrTokenLikeOrIterable} params
   */
  constructor(...params) {
    super(...params)
    this.restrictions = params.filter(/** @returns {p is TypeRestrictionExpressionSyntaxNode} */p => p instanceof TypeRestrictionExpressionSyntaxNode)
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
   * @param {new(...any) => TRestriction} type
   * @returns {TRestriction?}
   */
  getFirstRestrictionByType(type) {
    return this.restrictions.find(/** @returns {x is TRestriction} */ x => x instanceof type)
  }

  /** @type {NullabilityTypeRestrictionExpressionSyntaxNode?} The `NULL`/`NOT NULL` restriction. */
  get nullability() {
    return this.getFirstRestrictionByType(NullabilityTypeRestrictionExpressionSyntaxNode)
  }
}
exports.TypeExpressionSyntaxNode = TypeExpressionSyntaxNode

class IdentifierTypeExpressionSyntaxNode extends TypeExpressionSyntaxNode {
  /** @type {IdentifierSyntaxNode} */ identifier

  /**
   * @param {IdentifierSyntaxNode} identifier
   * @param  {...TypeRestrictionExpressionSyntaxNode} restrictions
   */
  constructor(identifier, ...restrictions) {
    super(identifier, ...restrictions)

    this.identifier = identifier
  }
}
exports.IdentifierTypeExpressionSyntaxNode = IdentifierTypeExpressionSyntaxNode

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

// -----------------

/**
 * Represents a `RECORD` type expression.
 */
class RecordTypeExpressionSyntaxNode extends TypeExpressionSyntaxNode {
  /** @type {Token} The `RECORD` keyword */ recordKeyword
  /** @type {RecordFieldListDeclarationExpressionSyntaxNode} */ fieldList

  /**
   * @param {TokenLike} recordKeyword The `RECORD` keyword
   * @param {RecordFieldListDeclarationExpressionSyntaxNode} fieldList
   */
  constructor(recordKeyword, fieldList) {
    super(recordKeyword, fieldList)
    this.recordKeyword = this.resolveToken(recordKeyword)
    this.fieldList = fieldList
  }

  get openParenToken() {
    return this.fieldList.openParenToken
  }
  get closeParenToken() {
    return this.fieldList.closeParenToken
  }
  get fields() {
    return this.fieldList.fields
  }
}
exports.RecordTypeExpressionSyntaxNode = RecordTypeExpressionSyntaxNode

/**
 * Represents a field in a record type declaration.
 */
class RecordFieldDeclarationExpressionSyntaxNode extends MemberExpressionSyntaxNode {
  /** @type {TypeExpressionSyntaxNode} */ type
  /** @type {Token?} The `DEFAULT` keyword or symbol (`:=`) */ defaultToken
  /** @type {AnyExpressionSyntaxNode?} */ defaultValue

  /**
   * @param {IdentifierSyntaxNode} name
   * @param {TypeExpressionSyntaxNode} type
   * @param {TokenLike?} defaultToken The `DEFAULT` keyword or symbol (`:=`)
   * @param {AnyExpressionSyntaxNode?} defaultValue
   */
  constructor(name, type, defaultToken, defaultValue) {
    super('field', name, type, defaultToken, defaultValue)
    this.type = type
    this.defaultToken = this.resolveToken(defaultToken)
    this.defaultValue = defaultValue
  }
}
exports.RecordFieldDeclarationExpressionSyntaxNode = RecordFieldDeclarationExpressionSyntaxNode

/**
 * Represents the list of    in a record type declaration, with attendant punctuation.
 */
class RecordFieldListDeclarationExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {RecordFieldDeclarationExpressionSyntaxNode[]} */ fields
  /** @type {Token} */ openParenToken
  /** @type {Token} */ closeParenToken

  /**
   * @param {TokenLike} openParenToken
   * @param {(RecordFieldDeclarationExpressionSyntaxNode | TokenLike)[]} fieldsWithCommas
   * @param {TokenLike} closeParenToken
   */
  constructor(openParenToken, fieldsWithCommas, closeParenToken) {
    super(openParenToken, ...fieldsWithCommas, closeParenToken)
    this.fields = fieldsWithCommas.filter(/** @return {x is RecordFieldDeclarationExpressionSyntaxNode} */ x => x instanceof RecordFieldDeclarationExpressionSyntaxNode)

    // Must resolve the canonical tokens.
    this.openParenToken = this.resolveToken(openParenToken)
    this.closeParenToken = this.resolveToken(closeParenToken)
  }
}
exports.RecordFieldListDeclarationExpressionSyntaxNode = RecordFieldListDeclarationExpressionSyntaxNode

// -----------------

/**
 * Base class of collection type expressions.
 */
class CollectionTypeExpressionSyntaxNode extends TypeExpressionSyntaxNode { }
exports.CollectionTypeExpressionSyntaxNode = CollectionTypeExpressionSyntaxNode

/**
 * Nested table type.
 */
class NestedTableTypeExpressionSyntaxNode extends CollectionTypeExpressionSyntaxNode {
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
class AssociativeArrayTypeExpressionSyntaxNode extends CollectionTypeExpressionSyntaxNode {
  /** @type {TypeExpressionSyntaxNode} */ keyType
  /** @type {TypeExpressionSyntaxNode} */ valueType

  /**
   *
   * @param {SyntaxNode} tableOf `TABLE OF`
   * @param {TypeExpressionSyntaxNode} valueType
   * @param {SyntaxNode} indexBy `INDEX BY`
   * @param {TypeExpressionSyntaxNode} keyType
   * @param {...TypeRestrictionExpressionSyntaxNode} restrictions
   */
  constructor(tableOf, valueType, indexBy, keyType, ...restrictions) {
    super(tableOf, valueType, indexBy, keyType, ...restrictions)
    this.valueType = valueType
    this.keyType = keyType
  }
}
exports.AssociativeArrayTypeExpressionSyntaxNode = AssociativeArrayTypeExpressionSyntaxNode

/**
 * Base class of collection type expressions.
 */
class RefCursorTypeExpressionSyntaxNode extends TypeExpressionSyntaxNode {
  /** @type {Token} `REF` */ refKeyword
  /** @type {Token} `CURSOR` */ cursorKeyword
  /** @type {Token?} `RETURN` */ returnKeyword
  /** @type {TypeExpressionSyntaxNode?} The returned row type. */ rowType

  /**
   * @param {TokenLike} refKeyword `REF`
   * @param {TokenLike} cursorKeyword `CURSOR`
   * @param {TokenLike?} returnKeyword `RETURN`
   * @param {TypeExpressionSyntaxNode?} rowType The returned row type.
   */
  constructor(refKeyword, cursorKeyword, returnKeyword, rowType) {
    super(refKeyword, cursorKeyword, returnKeyword, rowType)
    this.refKeyword = this.resolveToken(refKeyword)
    this.cursorKeyword = this.resolveToken(cursorKeyword)
    this.returnKeyword = this.resolveToken(returnKeyword)
    this.rowType = rowType
  }
}
exports.RefCursorTypeExpressionSyntaxNode = RefCursorTypeExpressionSyntaxNode

// -------------------------------------

/**
 * Marker type for document comments.
 */
class DocumentCommentSyntaxNode extends StructuredTriviaSyntaxNode {

  /**
   *
   * @param  {...Token} tokens
   */
  constructor(...tokens) {
    super(...tokens)
  }
}
exports.DocumentCommentSyntaxNode = DocumentCommentSyntaxNode
