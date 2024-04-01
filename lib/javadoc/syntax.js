// @ts-check
const console = require('../debug').child(__filename)
const { ArgumentValueError, mustBeInstanceOf, mustBeObject, mustBeNonEmptyArray } = require('../guards')
const {
  ExpressionSyntaxNode,
  IdentifierSyntaxNode,
  SyntaxNode,
  SyntaxNodeReader,
  LiteralSyntaxNode,
  ContentSyntaxNode
} = require('../syntax')
const { Token, mustBeTokenLike, isTokenLike, TokenSyntaxError } = require('../token')

/**
 * @typedef {import("../token").TokenFormat} TokenFormat
 * @typedef {import("../token").TokenLike} TokenLike
 * @typedef {import("../token").TokenPattern} TokenPattern
 * @typedef {import("../syntax").AnyExpressionSyntaxNode} AnyExpressionSyntaxNode
 * @typedef {import("../syntax").SyntaxNodeOrToken} SyntaxNodeOrToken
 * @typedef {import("../syntax").SyntaxNodeOrTokenLike} SyntaxNodeOrTokenLike
 * @typedef {import("../syntax").SyntaxNodeOrTokenLikeOrIterable} SyntaxNodeOrTokenLikeOrIterable
 */

class Patterns {
  static OPEN_BRACE = { type: 'brace.open' }
  static CLOSE_BRACE = { type: 'brace.close' }
  static OPEN_BRACKET = { type: 'bracket.open' }
  static CLOSE_BRACKET = { type: 'bracket.close' }
  static OPEN_PAREN = { value: '(' }
  static CLOSE_PAREN = { value: ')' }

  static IDENTIFIER = { type: 'identifier' }

  static TAG = { type: 'tag' }
  static URL = { type: 'url' }
  static HASH = { value: '#' }
  static PERIOD = { value: '.' }

  static TEXT_CONTENT = { type: 'text.content' }
  static WHITESPACE = { type: 'whitespace' }
  static NEWLINE = { type: 'newline' }
  static STRING_LITERAL = { type: 'string' }
  static NUMBER_LITERAL = { type: 'number' }
  static HTMLTAG_OPEN = { type: 'htmlTag.open' }
  static MARKDOWN_CODEFENCE = { type: 'markdown.codeFence' }
  static STAR = { type: 'star' }
  static AT = { type: 'at' }
  static SLASH = { type: 'SLASH' }

  /**
   * Represents a pattern matching any of the identifier delimiters.
   *  - period (`.`)
   *  - hash (`#`), mainly included because Javadoc supports it
   *  - at sign (`@`), because of database links.
   */
  static IDENTIFIER_DELIMITERS = [this.PERIOD, this.HASH, this.AT]

  /** Signifies token types allowed in a {@link ContentSyntaxNode} that takes a single-line description */
  static INLINE_CONTENT = [
    this.IDENTIFIER,
    this.TEXT_CONTENT,
    this.HASH,
    this.PERIOD,
    this.WHITESPACE,
    this.NEWLINE,
    this.STAR,
    this.AT,
    this.SLASH
  ]

  /** Signifies tokens that may be mixed in with {@link INLINE_CONTENT}. */
  static INLINE_CONTENT_ADJACENT = [
    // These signify things inline with content that can be inside content without custom logic
    this.OPEN_BRACE,
    this.OPEN_BRACKET,
    this.URL,
    this.STRING_LITERAL,
    this.NUMBER_LITERAL
  ]

  static INLINE_CONTENT_LIKE = [
    ...this.INLINE_CONTENT,
    ...this.INLINE_CONTENT_ADJACENT
  ]

  /** Signifies token types allowed in a {@link ContentSyntaxNode} that allows a multi-line description. */
  static BLOCK_CONTENT = [
    ...this.INLINE_CONTENT
  ]

  /** Signifies tokens that may be mixed in with {@link BLOCK_CONTENT}. */
  static BLOCK_CONTENT_ADJACENT = [
    ...this.INLINE_CONTENT_ADJACENT,
    this.HTMLTAG_OPEN,
    this.MARKDOWN_CODEFENCE
  ]

  /** CONTENT or things inline with CONTENT */
  static BLOCK_CONTENT_LIKE = [
    ...this.BLOCK_CONTENT,
    ...this.BLOCK_CONTENT_ADJACENT
  ]

  static ANY_HTMLTAG_CLOSE = [
    { type: 'htmlTag.close' },
    { type: 'htmlTag.close.self' }
  ]
}

class JavadocNodeReader extends SyntaxNodeReader {

  // ---------------

  /**
   * Tries reading the next token as an open curly brace (`{`)
   * @returns {TokenLike?}
   */
  #tryReadNextAsOpenBraceToken() {
    return this.tryReadNextToken(Patterns.OPEN_BRACE)
  }

  /**
   * Reads the next token as an open curly brace (`{`).
   * @returns {TokenLike}
   */
  #readNextAsOpenBraceToken() {
    return this.readNextToken(Patterns.OPEN_BRACE)
  }

  /**
   * Reads the next token as a close curly brace (`}`).
   * @returns {TokenLike}
   */
  #readNextAsCloseBraceToken() {
    return this.readNextToken(Patterns.CLOSE_BRACE)
  }

  // ---------------

  /**
   * Reads starting with the given token as a simple or compound identifier.
   * @param {...TokenLike} tokens  The first tokens.  The last in the sequence MUST be of type 'Identifier'.
   * @returns {IdentifierSyntaxNode}
   */
  #readAsIdentifier(...tokens) {
    mustBeNonEmptyArray(tokens, 'tokens')
    this.verify(Patterns.IDENTIFIER, tokens.at(-1))

    let /** @type {TokenLike[]?} */ nextTokens
    while (nextTokens = this.tryReadNextTokens(Patterns.IDENTIFIER_DELIMITERS, Patterns.IDENTIFIER)) {
      tokens.push(...nextTokens)
    }

    return new IdentifierSyntaxNode(...tokens)
  }

  /**
   * Tries reading the next item as a simple or compound identifier.
   * @returns {IdentifierSyntaxNode?}
   */
  #tryReadNextAsIdentifier() {
    const token = this.tryReadNextToken(Patterns.IDENTIFIER)
    return token ? this.#readAsIdentifier(token) : null
  }

  // ---------------

  /**
   * Tries reading the next item as a single parameter from an invocation.
   * @returns {AnyExpressionSyntaxNode?}
   */
  #tryReadNextAsInvocationParameter() {
    // LATER: parameter name?
    // Try just value.
    return this.#tryReadNextAsValueExpression()
  }

  /**
   * Reads the next item as a single parameter from an invocation.
   * @returns {AnyExpressionSyntaxNode}
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
    while (param && (comma = this.tryReadNextToken(','))) {
      yield SyntaxNode.asSyntaxNode(comma)
      yield param = this.#readNextAsInvocationParameter()
    }
  }

  /**
   * Reads starting with the given token as a parameter list from a declaration or name path.
   * @param {TokenLike} openParenToken
   * @returns {ExpressionSyntaxNode}
   */
  #readAsInvocationParameterList(openParenToken) {
    this.verify(Patterns.OPEN_PAREN, openParenToken)

    return new ExpressionSyntaxNode(
      openParenToken,
      [...this.#readNextAsInvocationParametersWithCommas()],
      this.readNextToken(Patterns.CLOSE_PAREN)
    )
  }

  /**
   * Tries reading the next item as a parameter list from a declaration.
   * @returns {ExpressionSyntaxNode?}
   */
  #tryReadNextAsInvocationParameterList() {
    const openParenToken = this.tryReadNextToken(Patterns.OPEN_PAREN)
    return openParenToken ? this.#readAsInvocationParameterList(openParenToken) : null

  }

  // ---------------

  /**
   * Tries reading the next item as a name path.
   *
   * Name paths are either
   * - compound identifiers
   * - identifiers starting with a delimiter (e.g. `#`)
   * - a simple identifier followed by an invocation expression
   * @returns {NamePathExpressionSyntaxNode?}
   */
  #tryReadNextAsNamePath() {
    // Try reading it as an identifier, but only compound.
    // (Simple identifiers MAY be part of text.)
    const tokens = this.tryReadNextTokens(Patterns.HASH, Patterns.IDENTIFIER)
      ?? this.tryReadNextTokens(Patterns.IDENTIFIER, Patterns.IDENTIFIER_DELIMITERS, Patterns.IDENTIFIER)
      ?? this.tryReadNextTokens(Patterns.IDENTIFIER, Patterns.OPEN_PAREN)

    if (!tokens) {
      return null
    }

    if (this.matches(Patterns.IDENTIFIER, tokens.at(-1))) {
      // Compound identifier, optional parameter list
      return new NamePathExpressionSyntaxNode(
        this.#readAsIdentifier(...tokens),
        this.#tryReadNextAsInvocationParameterList()
      )
    }

    // Simple identifier, required parameter list
    console.assert(tokens.length === 2, 'oops')
    return new NamePathExpressionSyntaxNode(
      new IdentifierSyntaxNode(tokens[0]),
      this.#readAsInvocationParameterList(tokens[1])
    )
  }

  /**
   * Tries reading the next item as a name path or a URL.
   * @returns {NamePathOrUrlLiteralSyntaxNode?}
   */
  #tryReadNextAsNamePathOrUrl() {
    return this.#tryReadNextAsNamePath() ?? this.#tryReadNextAsUrl()
  }

  /**
   * @returns {AnyExpressionSyntaxNode?}
   */
  #tryReadNextAsBraceContent() {
    return this.#tryReadNextAsTag()
      ?? this.#tryReadNextAsNamePathOrUrl()
  }

  /**
   * Reads a sequence of curly-brace expression contents.
   * @returns {Generator<AnyExpressionSyntaxNode>}
   * @yields {AnyExpressionSyntaxNode}
   */
  *#readNextAllAsBraceContents() {
    let content
    while (content = this.#tryReadNextAsBraceContent()) {
      yield content
    }
  }

  /**
   * ```text
   * { <tag> }
   * { [namePathOrUrl] [content] }
   * ```
   *
   * @param {TokenLike} openBraceToken
   * @returns {BraceExpressionSyntaxNode}
   */
  #readAsBraceExpression(openBraceToken) {
    this.verify(Patterns.OPEN_BRACE, openBraceToken)

    // A brace SHOULD contain one of the following:
    //  - a tag (the whole content)
    //  - a namePathOrUrl followed by optional content
    //  - optional content
    const tag = this.#tryReadNextAsTag()
    if (tag) {
      const closeBraceToken = this.#readNextAsCloseBraceToken()
      return new InlineTagSyntaxNode(openBraceToken, tag, closeBraceToken)
    }

    // Not a tag.  namePathOrUrl, or simple identifier.
    const namePathOrUrlOrIdentifier = this.#tryReadNextAsNamePathOrUrl() ?? this.#tryReadNextAsIdentifier()
    if (namePathOrUrlOrIdentifier) {
      return new BraceNamePathExpressionSyntaxNode(
        openBraceToken,
        namePathOrUrlOrIdentifier,
        [...this.#readNextAllAsInlineContentLike()],
        this.#readNextAsCloseBraceToken()
      )
    }

    return new BraceContentExpressionSyntaxNode(
      openBraceToken,
      [...this.#readNextAllAsInlineContentLike()],
      this.#readNextAsCloseBraceToken()
    )
  }

  /**
   * @returns {BraceExpressionSyntaxNode?}
   */
  #tryReadNextAsBraceExpression() {
    const openBraceToken = this.#tryReadNextAsOpenBraceToken()
    if (!openBraceToken) {
      return null
    }

    return this.#readAsBraceExpression(openBraceToken)
  }

  // ---------------

  /**
   * This is expensive
   * @param {TokenPattern} pattern
   * @returns {Generator<TokenLike>}
   * @yields {TokenLike}
   */
  * #readUpTo(pattern) {
    while (!this.iterator.nextNonTrivialIs(pattern)) {
      yield this.readNextToken()
    }
    console.assert(this.iterator.done || this.iterator.nextNonTrivialIs(pattern), 'whoops pattern')
  }

  /**
   * @returns {AnyExpressionSyntaxNode?}
   */
  #tryReadNextAsBracketContent() {
    return this.#tryReadNextAsTag() ?? this.#tryReadNextAsNamePathOrUrl() ?? this.#tryReadNextAsIdentifier()
  }

  /**
   * Reads a sequence of square-brace expression contents.
   * @returns {Generator<AnyExpressionSyntaxNode>}
   * @yields {AnyExpressionSyntaxNode}
   */
  * #readNextAsBracketContents() {
    let content
    while (content = this.#tryReadNextAsBracketContent()) {
      yield content
    }
  }

  /**
   * @param {TokenLike} openBracketToken
   * @returns {BracketExpressionSyntaxNode}
   */
  #readAsBracketExpression(openBracketToken) {
    this.verify(Patterns.OPEN_BRACKET, openBracketToken)
    const expression = this.#tryReadNextAsBracketContent()
    const content = [...this.#readNextAsBracketContents()]

    const orphan = SyntaxNode.asSyntaxNode(this.#readUpTo(Patterns.CLOSE_BRACKET))
    const closeBracketToken = this.readNextToken(Patterns.CLOSE_BRACKET)
    // LATER: this won't be detectable as a tag.
    return new BracketExpressionSyntaxNode(
      openBracketToken,
      new ExpressionSyntaxNode(expression, content, orphan),
      closeBracketToken
    )
  }

  /**
   * @returns {BracketExpressionSyntaxNode?}
   */
  #tryReadNextAsBracketExpression() {
    const openBracketToken = this.tryReadNextToken(Patterns.OPEN_BRACKET)
    if (!openBracketToken) {
      return null
    }

    return this.#readAsBracketExpression(openBracketToken)
  }

  // ---------------

  /**
   * Reads starting with the given token as inline content node, until EOF / another type of token is reached.
   * @param {TokenLike} token
   * @returns {ContentSyntaxNode}
   */
  #readAsInlineContent(token) {
    this.verify(Patterns.INLINE_CONTENT, token)
    return new ContentSyntaxNode(token, ...this.readNextTokensWhile(Patterns.INLINE_CONTENT))
  }

  /**
   * @param {TokenLike} token
   * @returns {ContentSyntaxNode}
   */
  #readAsInlineContentLike(token) {
    // Inline expressions
    switch (token.type) {
      case Patterns.OPEN_BRACE.type:
        return this.#readAsBraceExpression(token)
      case Patterns.OPEN_BRACKET.type:
        return this.#readAsBracketExpression(token)
      case Patterns.URL.type:
        return this.#readAsUrl(token)
      case Patterns.STRING_LITERAL.type:
        return this.#readAsStringLiteral(token)
      default:
        return this.#readAsInlineContent(token)
    }
  }

  /**
   * @returns {ContentSyntaxNode?}
   */
  #tryReadNextAsInlineContentLike() {
    const token = this.tryReadNextToken(Patterns.INLINE_CONTENT_LIKE)
    return token ? this.#readAsInlineContentLike(token) : null
  }

  /**
   * @returns {Generator<ContentSyntaxNode>}
   * @yields {ContentSyntaxNode}
   */

  *#readNextAllAsInlineContentLike() {
    let node
    while (node = this.#tryReadNextAsInlineContentLike()) {
      yield node
    }
  }

  // ---------------

  /**
   * @param {TokenLike} token
   * @returns {ContentSyntaxNode?}
   */
  #readAsBlockContentLike(token) {
    // Inline expressions
    switch (token.type) {
      case Patterns.HTMLTAG_OPEN.type:
        return this.#readAsHtmlTag(token)
      case Patterns.MARKDOWN_CODEFENCE.type:
        return this.#readAsMarkdownCodeBlock(token)
      default:
        return this.#readAsInlineContentLike(token)
    }

  }

  /**
   * @returns {ContentSyntaxNode?}
   */
  #tryReadNextAsBlockContentLike() {
    const token = this.tryReadNextToken(Patterns.BLOCK_CONTENT_LIKE)
    return token ? this.#readAsBlockContentLike(token) : null
  }

  /**
   * @returns {Generator<ContentSyntaxNode>}
   * @yields {ContentSyntaxNode}
   */

  *#readNextAllAsBlockContentLike() {
    let node
    while (node = this.#tryReadNextAsBlockContentLike()) {
      yield node
    }
  }

  // ---------------

  /**
   * @param {TokenLike} token
   * @returns {ContentTagSyntaxNode}
   */
  #readAsImplicitDescriptionTag(token) {
    return new ContentTagSyntaxNode('description', this.#readAsBlockContentLike(token), ...this.#readNextAllAsBlockContentLike())
  }

  /**
   * @param {TokenLike} tagToken
   * @returns {ContentTagSyntaxNode}
   */
  #readAsExplicitContentTag(tagToken) {
    return new ContentTagSyntaxNode(tagToken, ...this.#readNextAllAsBlockContentLike())

  }

  /**
   * Reads starting with the given token as a URL literal.
   * @param {TokenLike} token
   * @returns {UrlLiteralSyntaxNode}
   */
  #readAsUrl(token) {
    return new UrlLiteralSyntaxNode(token)
  }

  /**
   * Tries reading the next item as a URL literal.
   * @returns {UrlLiteralSyntaxNode?}
   */
  #tryReadNextAsUrl() {
    const token = this.tryReadNextToken(Patterns.URL)
    return token ? this.#readAsUrl(token) : null
  }

  // ---------------

  /**
   * Reads starting with the given token as a tag with link information.
   * Valid arguments are
   * ```text
   * <@tag> [namePathOrUrl]? [text]?
   * <@tag> [namePathOrUrl]? "text"
   * ```
   * If text is surrounded by double quotes, they will be stripped.
   *
   * @param {TokenLike} tagToken A token of type `tag` (e.g. `link`, `linkcode`, `linkplain`, `see`).
   * @returns {LinkTagSyntaxNode}
   */
  #readAsLinkTag(tagToken) {
    return new LinkTagSyntaxNode(
      tagToken,
      this.#tryReadNextAsNamePathOrUrl(),
      ...this.#readNextAllAsInlineContentLike()
    )
  }

  // ---------------

  /**
   * Reads starting with the given token as a literal.
   * @param {TokenLike} token
   * @returns {LiteralSyntaxNode}
   */
  #readAsStringLiteral(token) {
    return new LiteralSyntaxNode(token)
  }

  /**
   * Tries reading the next item as a literal PL/SQL expression.
   * @returns {LiteralSyntaxNode?}
   */
  #tryReadNextAsLiteralExpression() {
    const token = this.tryReadNextToken([Patterns.NUMBER_LITERAL, Patterns.STRING_LITERAL])
    return token ? this.#readAsStringLiteral(token) : null
  }

  /**
   * Tries reading the next item as a single PL/SQL value expression.
   * @returns {AnyExpressionSyntaxNode?}
   */
  #tryReadNextAsValueExpression() {
    return this.#tryReadNextAsLiteralExpression()
      ?? this.#tryReadNextAsIdentifier()
  }

  /**
   * Reads the `@param` tag.
   * @param {TokenLike} tagToken
   */
  #readAsParamTag(tagToken) {
    this.verify({ type: 'tag', value: 'param' }, tagToken)

    // Because of JSDoc and others, we have to support:
    //  - type expressions (e.g. `{varchar2}`)
    //  - default values
    //  - [name=defaultValue]

    const type = this.#tryReadNextAsBraceExpression()

    const bracketExpression = this.#tryReadNextAsBracketExpression()
    if (bracketExpression) {
      return new ParamTagSyntaxNode(
        tagToken,
        type,
        bracketExpression,
        ...this.#readNextAllAsInlineContentLike()
      )
    }

    const name = this.#tryReadNextAsIdentifier()
    const defaultExpression = this.tryReadNextToken(['=', 'DEFAULT'])
    const defaultValue = defaultExpression ? this.#tryReadNextAsValueExpression() : null
    const contentLike = [...this.#readNextAllAsInlineContentLike()]

    return new ParamTagSyntaxNode(tagToken, type, name, defaultExpression, defaultValue, ...contentLike)
  }

  /**
   * Reads starting with the given token as a `@throws` tag.
   * @param {TokenLike} tagToken
   * @returns {ThrowsExceptionTagSyntaxNode}
   */
  #readAsThrowsExceptionTag(tagToken) {
    return new ThrowsExceptionTagSyntaxNode(tagToken, this.#tryReadNextAsIdentifier(), ...this.#readNextAllAsInlineContentLike())
  }

  /**
   * @param {TokenLike} tagToken
   * @return {TagSyntaxNode}
   */
  #readAsTag(tagToken) {
    switch (tagToken.value.toLowerCase()) {
      case 'param':
        return this.#readAsParamTag(tagToken)
      case 'return':
      case 'returns':
        // @return(s)? <{type}>? <content>?
        return new ReturnTagSyntaxNode(tagToken, this.#tryReadNextAsBraceExpression(), ...this.#readNextAllAsInlineContentLike())

      case 'see':
      case 'seealso':
      case 'include':
      case 'inheritdoc':
      case 'link':
      case 'linkcode': // known from JSDoc
      case 'linkplain':
        return this.#readAsLinkTag(tagToken)

      case 'api':
        // @api <visibility>
        return new VisibilityTagSyntaxNode(tagToken, this.readNextToken())

      case 'public':
      case 'private':
      case 'protected':
      case 'internal':
        return new VisibilityTagSyntaxNode(tagToken)

      case 'throws':
      case 'exception':
        return this.#readAsThrowsExceptionTag(tagToken)
      case 'deprecated':
        // @deprecated [message]?
        return new ContentTagSyntaxNode(tagToken, ...this.#readNextAllAsInlineContentLike())
      case 'description':
        return this.#readAsExplicitContentTag(tagToken)

      // other content
      case 'example':
      case 'notes':
      case 'remarks':
      case 'since':
        return new ContentTagSyntaxNode(tagToken, ...this.#readNextAllAsInlineContentLike())

      // annotations
      case 'autonomous_transaction':
      case 'commit':
      case 'commits':
      case 'enum':
      case 'override':
      case 'virtual':
        return new ContentTagSyntaxNode(tagToken, ...this.#readNextAllAsInlineContentLike())

      case 'link': // Javadoc, JSDoc
      case 'linkcode': // known from JSDoc
      case 'linkplain': // Javadoc, JSDoc
        return this.#readAsLinkTag(tagToken)

      // unknown
      default:
        // All other tags, treat as extra content / possible annotations.
        console.warnOnce(tagToken.value, `Unknown tag ${tagToken.text}`)
        return this.#readAsExplicitContentTag(tagToken)
    }
  }

  /**
   * Tries reading the next item as a tag token.
   * @returns {TagSyntaxNode?}
   */
  #tryReadNextAsTag() {
    const token = this.tryReadNextToken(Patterns.TAG)
    return token ? this.#readAsTag(token) : null
  }

  /**
   * Reads starting with the given token as an HTML tag (e.g., `<p>, `<a href=...>`).
   * NOTE: does not read contents of the tag, just the tag.
   * @param {TokenLike} token The first token.
   */
  #readAsHtmlTag(token) {
    this.verify(Patterns.HTMLTAG_OPEN, token)
    return new HtmlTagSyntaxNode(token, ...this.readNextTokensUntil(Patterns.ANY_HTMLTAG_CLOSE))
  }

  /**
   * Reads a markdown code expression between two fences of equal length.
   * Assumption is everything therein is literal to the expression and not part of the Javadoc.
   * @param {TokenLike} token The first token.
   */
  #readAsMarkdownCodeBlock(token) {
    this.verify(Patterns.MARKDOWN_CODEFENCE, token)
    return new MarkdownCodeSyntaxNode(token, ...this.readNextTokensUntil({ type: 'markdown.codeFence', value: token.value }))
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
        case 'tag':
          return this.#readAsTag(token)
        default:
          // Catchall for content.
          if (this.matches(Patterns.BLOCK_CONTENT_LIKE, token)) {
            return this.#readAsImplicitDescriptionTag(token)
          }

          console.assert(false, `${token.textSpan} unexpected token ${token.type}:${JSON.stringify(token.value)}`, token)
          return this.#readAsImplicitDescriptionTag(token)
      }
    }
  }
}
exports.JavadocNodeReader = JavadocNodeReader

// -------------------------------------

/**
 * Represents a Javadoc name path.
 */
class NamePathExpressionSyntaxNode extends ExpressionSyntaxNode {
  /** @type {IdentifierSyntaxNode} */ identifier
  /** @type {ExpressionSyntaxNode?} */ parameterList

  /**
   * @param {IdentifierSyntaxNode} identifier
   * @param {ExpressionSyntaxNode?} parameterList
   */
  constructor(identifier, parameterList) {
    super(identifier, parameterList)
    this.identifier = identifier
    this.parameterList = parameterList
  }
}
exports.NamePathExpressionSyntaxNode = NamePathExpressionSyntaxNode

/**
 * @typedef {NamePathExpressionSyntaxNode | UrlLiteralSyntaxNode} NamePathOrUrlLiteralSyntaxNode
 */


// -------------------------------------




class UrlLiteralSyntaxNode extends LiteralSyntaxNode { }
exports.UrlLiteralSyntaxNode = UrlLiteralSyntaxNode

class HtmlTagSyntaxNode extends ContentSyntaxNode { }
exports.HtmlTagSyntaxNode = HtmlTagSyntaxNode

class MarkdownCodeSyntaxNode extends ContentSyntaxNode { }
exports.MarkdownCodeSyntaxNode = MarkdownCodeSyntaxNode

// -----------------

class TagSyntaxNode extends ContentSyntaxNode {
  /** @type {Token?} The tag token (optional) */ tagToken

  /**
   * @param {string | TokenLike} kindOrTagToken
   * @param {...SyntaxNodeOrTokenLikeOrIterable} params
   */
  constructor(kindOrTagToken, ...params) {
    if (typeof kindOrTagToken === 'string') {
      super(...params)
      this.kind = kindOrTagToken
    } else {
      mustBeTokenLike(kindOrTagToken, 'kindOrTagToken')
      super(kindOrTagToken, ...params)
      this.tagToken = this.resolveToken(kindOrTagToken)
      this.kind = this.tagToken.value.toLowerCase()
    }

    if ('content' in this) {
      console.assert(Array.isArray(this.content) && this.content.every(c => c instanceof SyntaxNode))
    }
  }

  /**
   * @param {TokenFormat} format
   * @returns {string}
   */
  toString(format = 'T') {
    return super.toString(format)
  }

  /**
   * @param {TokenFormat} format
   * @returns {string}
   */
  toStructuredString(format = 'T') {
    return super.toStructuredString(format)
  }

  /**
   * @param {TokenFormat} format
   * @returns {string}
   */
  toFullString(format = 'T') {
    return super.toFullString(format)
  }
}
exports.TagSyntaxNode = TagSyntaxNode

/** Tag with just content. */
class ContentTagSyntaxNode extends TagSyntaxNode {
  /** @type {IdentifierSyntaxNode} */ name
  /** @type {ContentSyntaxNode[]} */ content

  /**
   * @param {string|TokenLike} kindOrTagToken
   * @param  {...ContentSyntaxNode} content
   */
  constructor(kindOrTagToken, ...content) {
    super(kindOrTagToken, ...content)
    this.content = content
    console.assert(this.content.every(c => c instanceof ContentSyntaxNode))
  }
}
exports.ContentTagSyntaxNode = ContentTagSyntaxNode

class VisibilityTagSyntaxNode extends TagSyntaxNode {
  /** @type {Token} The visibility token. */ visibilityToken

  /**
   * @overload
   * @param {TokenLike} tagToken
   * @param {TokenLike} visibilityToken
   * @overload
   * @param {TokenLike} visibilityToken
   */
  constructor(tagToken, visibilityToken = null) {
    super(tagToken, visibilityToken)
    this.visibilityToken = this.resolveToken(visibilityToken ?? tagToken)
  }

  get visibility() {
    return this.visibilityToken.value
  }
}
exports.VisibilityTagSyntaxNode = VisibilityTagSyntaxNode

class ParamTagSyntaxNode extends TagSyntaxNode {
  /** @type {IdentifierSyntaxNode} */ name
  /** @type {ContentSyntaxNode[]} */ content

  /**
   * Creates a new node for a `@param` tag.
   * @overload
   * @param {TokenLike} tagToken The `@param` token.
   * @param {BraceExpressionSyntaxNode?} type An optional type expression.
   * @param {BracketExpressionSyntaxNode} bracketExpression A bracket expression containing the name and possibly a default value.
   * @param {...ContentSyntaxNode[]} content
   * @overload
   * @param {TokenLike} tagToken The `@param` token.
   * @param {BraceExpressionSyntaxNode?} type An optional type expression.
   * @param {IdentifierSyntaxNode} name The name of the parameter.
   * @param {TokenLike?} equalsToken
   * @param {SyntaxNode?} defaultValue
   * @param {...ContentSyntaxNode[]} content
   */
  constructor(/** @type {TokenLike} */ tagToken, /** @type {SyntaxNodeOrTokenLike[]} */ ...params) {
    // Send everything up to be added.
    super(tagToken, ...params)

    // We only really care about the name.
    const [_, nameOrBracketExpression, ...rest] = params

    mustBeObject(nameOrBracketExpression, 'name|bracketExpression')
    if (nameOrBracketExpression instanceof IdentifierSyntaxNode) {
      // Just a name
      this.name = nameOrBracketExpression
      const content = rest.slice(2)
      mustBeArrayOfContentLike(content)
      this.content = content
    } else {
      // [name=value]
      mustBeInstanceOf(nameOrBracketExpression, BracketExpressionSyntaxNode, 'bracketExpression')
      mustBeInstanceOf(nameOrBracketExpression.expression.children[0], IdentifierSyntaxNode, 'bracketExpression.children[0]')
      this.name = nameOrBracketExpression.expression.children[0]
      // don't really care about the default value
      mustBeArrayOfContentLike(rest)
      this.content = rest
    }
  }
}
exports.ParamTagSyntaxNode = ParamTagSyntaxNode

class ReturnTagSyntaxNode extends TagSyntaxNode {
  /** @type {AnyExpressionSyntaxNode?} */ type
  /** @type {ContentSyntaxNode[]}} */ content

  /**
   * @param {TokenLike} tagToken
   * @param {AnyExpressionSyntaxNode?} type
   * @param {...ContentSyntaxNode} content
   */
  constructor(tagToken, type, ...content) {
    super('return', tagToken, type, ...content)
    this.tagToken = this.resolveToken(tagToken)
    this.type = type
    this.content = content
    console.assert(this.content.every(c => c instanceof SyntaxNode))
  }
}
exports.ReturnTagSyntaxNode = ReturnTagSyntaxNode

class ThrowsExceptionTagSyntaxNode extends TagSyntaxNode {
  /** @type {IdentifierSyntaxNode} */ name
  /** @type {ContentSyntaxNode[]}} */ content

  /**
   * @param {TokenLike} tagToken
   * @param {IdentifierSyntaxNode} name
   * @param {...ContentSyntaxNode} content
   */
  constructor(tagToken, name, ...content) {
    super('throws', tagToken, name, ...content)
    mustBeInstanceOf(name, IdentifierSyntaxNode, 'name')
    mustBeArrayOfContentLike(content, 'content')
    this.name = name
    this.content = content
  }
}

// -------------------------------------
class LinkTagSyntaxNode extends TagSyntaxNode {
  /** @type {NamePathOrUrlLiteralSyntaxNode?} */ href
  /** @type {ContentSyntaxNode[]} */ content

  /**
   * @param {TokenLike} tagToken
   * @param {NamePathOrUrlLiteralSyntaxNode?} href
   * @param {...ContentSyntaxNode} content
   */
  constructor(tagToken, href, ...content) {
    super(tagToken, href, ...content)
    this.href = href
    mustBeArrayOfContentLike(content, 'content')
    this.content = content
  }
}
exports.LinkTagSyntaxNode = LinkTagSyntaxNode

// -------------------------------------

/**
 * @abstract Represents a expression surrounded by curly braces (`{...}`).
 */
class BraceExpressionSyntaxNode extends ContentSyntaxNode {
  /** @type {Token} */ openBraceToken
  /** @type {Token} */ closeBraceToken

  /**
   * @overload
   * @param {TokenLike} openBraceToken
   * @param {TokenLike} closeBraceToken
   * @overload
   * @param {TokenLike} openBraceToken
   * @param  {SyntaxNodeOrTokenLikeOrIterable} content0
   * @param {TokenLike} closeBraceToken
   * @overload
   * @param {TokenLike} openBraceToken
   * @param {SyntaxNodeOrTokenLikeOrIterable} content0
   * @param {SyntaxNodeOrTokenLikeOrIterable} content1
   * @param {TokenLike} closeBraceToken
   * @protected
   */
  constructor(/** @type {TokenLike} */ openBraceToken, /** @type {SyntaxNodeOrTokenLikeOrIterable[]} */ ...params) {
    super(openBraceToken, ...params)

    const closeBraceToken = params.at(-1)
    mustBeTokenLike(openBraceToken, 'openBraceToken')
    mustBeTokenLike(closeBraceToken, 'closeBraceToken')

    this.openBraceToken = this.resolveToken(openBraceToken)
    this.closeBraceToken = this.resolveToken(closeBraceToken)
  }
}

class BraceContentExpressionSyntaxNode extends BraceExpressionSyntaxNode {
  /** @type {ContentSyntaxNode[]} */ content

  /**
   * @param {TokenLike} openBraceToken
   * @param {ContentSyntaxNode[]} content
   * @param {TokenLike} closeBraceToken
   */
  constructor(openBraceToken, content, closeBraceToken) {
    super(openBraceToken, content, closeBraceToken)
    this.content = content
  }
}

class BraceNamePathExpressionSyntaxNode extends BraceExpressionSyntaxNode {
  /** @type {AnyExpressionSyntaxNode} */ namePathOrUrl
  /** @type {ContentSyntaxNode[]} */ content

  /**
   * @param {TokenLike} openBraceToken
   * @param {AnyExpressionSyntaxNode?} namePathOrUrl,
   * @param {ContentSyntaxNode[]} content
   * @param {TokenLike} closeBraceToken
   */
  constructor(openBraceToken, namePathOrUrl, content, closeBraceToken) {
    super(openBraceToken, namePathOrUrl, content, closeBraceToken)
    this.namePathOrUrl = namePathOrUrl
    this.content = content
  }
}

/** Represents an inline tag expression. */
class InlineTagSyntaxNode extends BraceExpressionSyntaxNode {
  /** @type {TagSyntaxNode} */ tag

  /**
   * @param {TokenLike} openBraceToken
   * @param {TagSyntaxNode} tag
   * @param {TokenLike} closeBraceToken
   */
  constructor(openBraceToken, tag, closeBraceToken) {
    super(openBraceToken, tag, closeBraceToken)
    this.openBraceToken = this.resolveToken(openBraceToken)
    this.tag = tag
    this.closeBraceToken = this.resolveToken(closeBraceToken)
  }

  /**
   * @param {TokenFormat} format
   */
  toString(format = 'T') {
    return super.toString(format)
  }
  /**
   * @param {TokenFormat} format
   */
  toStructuredString(format = 'T') {
    return super.toStructuredString(format)
  }
}

class BracketExpressionSyntaxNode extends ContentSyntaxNode {

  /** @type {AnyExpressionSyntaxNode?} */ expression
  /** @type {Token} `[` */ openBrackeToken
  /** @type {Token} `]` */ closeBraceToken

  /**
   *
   * @param {TokenLike} openBracketToken `[`
   * @param {AnyExpressionSyntaxNode?} expression
   * @param {TokenLike} closeBracketToken `]`
   */
  constructor(openBracketToken, expression, closeBracketToken) {
    super(openBracketToken, expression, closeBracketToken)
    this.expression = expression
    this.openBrackeToken = this.resolveToken(openBracketToken)
    this.closeBraceToken = this.resolveToken(closeBracketToken)

    console.infoOnce(`${this.openBrackeToken.value}: ${this.expression?.toString('V')}`, `bracket expression: ${this}`, this)
  }
}


// -----------------


/**
 *
 * @param {any} value
 * @returns {value is ContentSyntaxNode}
 */
const isContentLike = (value) => value instanceof ContentSyntaxNode

/**
 * @param {any} value
 * @param {string} paramName
 * @returns {asserts node is ContentSyntaxNode}
 */
const mustBeContentLike = (value, paramName = 'value') => {
  if (!isContentLike(value)) {
    throw new ArgumentValueError(paramName, value, 'Value must be content-like.')
  }
}

/**
 * @param {any[]} array
 * @param {string} paramName
 * @returns {asserts array is ContentSyntaxNode[]}
 */
const mustBeArrayOfContentLike = (array, paramName = 'array') => {
  array.forEach((item, i) => {
    if (!isContentLike(item)) {
      throw new ArgumentValueError(`${paramName}[${i}]`, item, 'Value must be content-like.')
    }
  })
}

// -------------------------------------

class ReferenceExpressionSyntaxNode extends ContentSyntaxNode {
  /** @type {IdentifierSyntaxNode} */ name

  /**
   * @param {IdentifierSyntaxNode} name
   * @param {ExpressionSyntaxNode?} parameters
   * @param {...SyntaxNodeOrTokenLike} params
   */
  constructor(name, parameters = undefined, ...params) {
    super(name, parameters, ...params)
    this.name = name
    this.parameters = parameters
  }
}
const InvocationParameterExpressionSyntaxNode = ReferenceExpressionSyntaxNode // HACK FIXME

