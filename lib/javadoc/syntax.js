// @ts-check
const console = require('../debug').child(__filename)
const { ArgumentValueError, mustBeInstanceOf, mustBeObject } = require('../guards')
const {
  ExpressionSyntaxNode,
  IdentifierSyntaxNode,
  StatementSyntaxNode,
  SyntaxNode,
  SyntaxNodeReader,
  LiteralSyntaxNode
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
  static HASH = { type: 'hash' }
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

  static ANY_CONTENT = [
    this.IDENTIFIER,
    this.TEXT_CONTENT,
    this.HASH,
    this.PERIOD,
    this.WHITESPACE,
    this.NEWLINE,
    this.STRING_LITERAL,
    this.NUMBER_LITERAL,
    this.STAR,
    this.AT,
    this.SLASH
  ]

  /** Things inline with CONTENT */
  static CONTENT_ADJACENT = [
    // These signify things inline with content that can be inside content without custom logic
    this.OPEN_BRACE,
    this.OPEN_BRACKET,
    this.URL
  ]

  /** CONTENT or things inline with CONTENT */
  static CONTENT_LIKE = [
    ...this.ANY_CONTENT,
    ...this.CONTENT_ADJACENT
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
   * Tries reading the next item as a parameter list from a declaration.
   * @returns {AnyExpressionSyntaxNode?}
   */
  #tryReadNextAsInvocationParameterList() {
    const openParenToken = this.tryReadNextToken(Patterns.OPEN_PAREN)
    if (!openParenToken) {
      return null
    }

    return new ExpressionSyntaxNode(
      openParenToken,
      [...this.#readNextAsInvocationParametersWithCommas()],
      this.readNextToken(Patterns.CLOSE_PAREN)
    )
  }


  /**
   * @returns {AnyExpressionSyntaxNode?}
   */
  #tryReadNextAsNamePath() {
    const identifier = this.#tryReadNextAsIdentifier() ?? this.#tryReadNextAsHashExpression()
    if (!identifier) {
      return null
    }

    const parameterList = this.#tryReadNextAsInvocationParameterList()
    return parameterList ? new ExpressionSyntaxNode(identifier, parameterList) : identifier
  }

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

    // Not a tag.  namePathOrUrl?
    const namePathOrUrl = this.#tryReadNextAsNamePathOrUrl()
    if (namePathOrUrl) {
      return new BraceNamePathExpressionSyntaxNode(
        openBraceToken,
        namePathOrUrl,
        [...this.#readNextAllAsContentLike()],
        this.#readNextAsCloseBraceToken()
      )
    }

    return new BraceContentExpressionSyntaxNode(
      openBraceToken,
      [...this.#readNextAllAsContentLike()],
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
    return this.#tryReadNextAsTag() ?? this.#tryReadNextAsIdentifier()
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

  /**
   * Reads from the current token as a bunch of decorative stars.
   * @param {TokenLike} token
   * @returns {SyntaxNode?}
   */
  #readAsStarExpression(token) {
    return new SyntaxNode(token, ...this.readNextTokensWhile('*'))
  }

  #tryReadNextAsStarExpression() {
    const token = this.tryReadNextToken('*')
    // I forget what this is.
    return token ? this.#readAsStarExpression(token) : null
  }


  /**
   * Reads starting with the given token as content, until EOF / a non-content token is reached.
   * @param {TokenLike} token
   * @returns {ContentSyntaxNode}
   */
  #readAsContent(token) {
    this.verify(Patterns.ANY_CONTENT, token)
    return new ContentSyntaxNode(token, ...this.readNextTokensWhile(Patterns.ANY_CONTENT))
  }

  /**
   * Tries reading the next item as a content node, until EOF / a non-content token is reached.
   * @returns {ContentSyntaxNode?}
   */
  #tryReadNextAsContent() {
    const token = this.tryReadNextToken(Patterns.ANY_CONTENT)
    return token ? this.#readAsContent(token) : null
  }

  // ---------------

  /**
   * @param {TokenLike} token
   * @returns {ContentSyntaxNode}
   */
  #readAsContentAdjacent(token) {
    // Inline expressions
    switch (token.type) {
      case Patterns.OPEN_BRACE.type:
        return this.#readAsBraceExpression(token)
      case Patterns.OPEN_BRACKET.type:
        return this.#readAsBracketExpression(token)
      // case Patterns.HTMLTAG_OPEN.type:
      //   return this.#readAsHtmlTag(token)
      // case Patterns.MARKDOWN_CODEFENCE.type:
      //   return this.#readAsMarkdownCodeExpression(token)
      case Patterns.URL.type:
        return this.#readAsUrl(token)
      default:
        throw new TokenSyntaxError(token, `Unhandled content-adjacent token type: '${token.type}'`)
    }
  }

  /**
   * @returns {ContentSyntaxNode?}
   */
  #tryReadNextAsContentAdjacent() {
    const token = this.tryReadNextToken(Patterns.CONTENT_ADJACENT)
    return token ? this.#readAsContentAdjacent(token) : null
  }

  // ---------------

  /**
   * Reads any with the given token as content or content-like expressions,
   * until EOF / a non-content-like token is reached.
   * @param {TokenLike} token
   * @returns {ContentSyntaxNode}
   */
  #readAsContentLike(token) {
    this.verify(Patterns.CONTENT_LIKE, token)
    if (this.matches(Patterns.CONTENT_ADJACENT, token)) {
      return this.#readAsContentAdjacent(token)
    }

    console.assert(this.matches(Patterns.ANY_CONTENT, token), `${token.start} Token type is not content: '${token.type}'`, token)
    return this.#readAsContent(token)
  }

  /**
   * @returns {ContentSyntaxNode?}
   */
  #tryReadNextAsContentLike() {
    return this.#tryReadNextAsContent() ?? this.#tryReadNextAsContentAdjacent()
  }

  /**
   * @returns {Generator<ContentSyntaxNode>}
   * @yields {ContentSyntaxNode}
   */

  *#readNextAllAsContentLike() {
    let node
    while (node = this.#tryReadNextAsContentLike()) {
      yield node
    }
  }

  // ---------------

  /**
   * @param {TokenLike} token
   * @returns {ContentTagSyntaxNode}
   */
  #readAsImplicitDescriptionTag(token) {
    return new ContentTagSyntaxNode('description', this.#readAsContentLike(token), ...this.#readNextAllAsContentLike())
  }

  /**
   * @returns {ReferenceExpressionSyntaxNode?}
   */
  #tryReadNextAsBareReference() {
    const name = this.#tryReadNextAsIdentifier()
    if (!name) {
      return null
    }

    const hash = this.#tryReadNextAsHashExpression()
    const parameterList = this.#tryReadNextAsInvocationParameterList()
    return new ReferenceExpressionSyntaxNode(name, hash, parameterList)
  }

  #readAsUrl(token) {
    return new UrlSyntaxNode(token)
  }

  /**
   * @returns {UrlSyntaxNode?}
   */
  #tryReadNextAsUrl() {
    const token = this.tryReadNextToken(Patterns.URL)
    return token ? this.#readAsUrl(token) : null
  }

  #readAsHashExpression(hash) {
    return new ExpressionSyntaxNode(hash, this.#tryReadNextAsIdentifier())
  }

  #tryReadNextAsHashExpression() {
    const hash = this.tryReadNextToken(Patterns.HASH)
    return hash ? this.#readAsHashExpression(hash) : null
  }

  /**
   * @returns {AnyExpressionSyntaxNode?}
   */
  #tryReadNextAsLinkExpression() {
    return this.#tryReadNextAsBraceExpression()
      ?? this.#tryReadNextAsUrl()
      ?? this.#tryReadNextAsHashExpression()
      ?? this.#tryReadNextAsBareReference()
  }

  /**
   * @param {TokenLike} tagToken `link`, `linkcode`, `linkplain`
   * @returns {LinkTagSyntaxNode}
   */
  #readAsLinkTag(tagToken) {
    // @see url
    // @see {...}
    // @see identifier
    return new LinkTagSyntaxNode(
      tagToken,
      this.#tryReadNextAsLinkExpression(),
      ...this.#readNextAllAsContentLike()
    )
  }

  /**
   * @param {TokenLike} tagToken `see`
   * @returns {LinkTagSyntaxNode}
   */
  #readAsSeeTag(tagToken) {
    // @see url
    // @see {...}
    // @see identifier
    return new SeeTagSyntaxNode(
      tagToken,
      this.#tryReadNextAsLinkExpression(),
      ...this.#readNextAllAsContentLike()
    )
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
    let /** @type {TokenLike[]?} */ nextTokens
    while (nextTokens = this.tryReadNextTokens(delimiters, Patterns.IDENTIFIER)) {
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
   * Tries reading the next item as a literal PL/SQL expression.
   * @returns {AnyExpressionSyntaxNode?}
   */
  #tryReadNextAsLiteralExpression() {
    const token = this.tryReadNextToken([Patterns.NUMBER_LITERAL, Patterns.STRING_LITERAL])
    return token ? new LiteralSyntaxNode(token) : null
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
        ...this.#readNextAllAsContentLike()
      )
    }

    const name = this.#tryReadNextAsIdentifier()
    const defaultExpression = this.tryReadNextToken(['=', 'DEFAULT'])
    const defaultValue = defaultExpression ? this.#tryReadNextAsValueExpression() : null
    const contentLike = [...this.#readNextAllAsContentLike()]

    return new ParamTagSyntaxNode(tagToken, type, name, defaultExpression, defaultValue, ...contentLike)
  }

  /**
   * Reads starting with the given token as a `@throws` tag.
   * @param {TokenLike} tagToken
   * @returns {ThrowsExceptionTagSyntaxNode}
   */
  #readAsThrowsExceptionTag(tagToken) {
    return new ThrowsExceptionTagSyntaxNode(tagToken, this.#tryReadNextAsIdentifier(), ...this.#readNextAllAsContentLike())
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
        return new ReturnTagSyntaxNode(tagToken, this.#tryReadNextAsBraceExpression(), ...this.#readNextAllAsContentLike())

      case 'see':
      case 'seealso':
      case 'include':
      case 'inheritdoc':
        return this.#readAsSeeTag(tagToken)

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
        return new ContentTagSyntaxNode(tagToken, ...this.#readNextAllAsContentLike())
      case 'description':
        return new ContentTagSyntaxNode(tagToken, ...this.#readNextAllAsContentLike())

      // other content
      case 'example':
      case 'notes':
      case 'remarks':
      case 'since':
        return new ContentTagSyntaxNode(tagToken, ...this.#readNextAllAsContentLike())

      // annotations
      case 'autonomous_transaction':
      case 'commit':
      case 'commits':
      case 'enum':
      case 'override':
      case 'virtual':
        return new ContentTagSyntaxNode(tagToken, ...this.#readNextAllAsContentLike())

      case 'link': // Javadoc, JSDoc
      case 'linkcode': // known from JSDoc
      case 'linkplain': // Javadoc, JSDoc
        return this.#readAsLinkTag(tagToken)

      // unknown
      default:
        // All other tags, treat as extra content / possible annotations.
        console.warnOnce(tagToken.value, `Unknown tag ${tagToken.text}`)
        return new ContentTagSyntaxNode(tagToken, ...this.#readNextAllAsContentLike())
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
    return new ContentSyntaxNode(token, ...this.readNextTokensUntil(Patterns.ANY_HTMLTAG_CLOSE))
  }

  /**
   * Reads a markdown code expression between two fences of equal length.
   * Assumption is everything therein is literal to the expression and not part of the Javadoc.
   * @param {TokenLike} token The first token.
   */
  #readAsMarkdownCodeExpression(token) {
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
        case 'brace.open':
          return this.#readAsBraceExpression(token)
        case 'bracket.open':
          return this.#readAsBracketExpression(token)
        default:
          // Catchall for content.
          if (this.matches(Patterns.CONTENT_LIKE, token)) {
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


class ContentSyntaxNode extends SyntaxNode {

  /**
   * @override
   * @param {TokenFormat} format
   * @returns  {string}
   */
  toString(format = 'T') {
    return super.toStructuredString(format)
  }

  /**
   * @override
   * @param {TokenFormat} format
   * @returns  {string}
   */
  toStructuredString(format = 'T') {
    return super.toStructuredString(format)
  }

  /** @type {string} */
  get text() {
    return this.toString('T')
  }

  /** @type {string} */
  get value() {
    return this.toString('V')
  }
}
class UrlSyntaxNode extends ContentSyntaxNode { }
class MarkdownCodeSyntaxNode extends ContentSyntaxNode { }

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
    this.name = name
    this.content = content
    console.assert(this.content.every(c => c instanceof SyntaxNode))
  }
}

class SeeTagSyntaxNode extends TagSyntaxNode {
  /** @type {AnyExpressionSyntaxNode?} */ expression
  /** @type {ContentSyntaxNode[]} */ content

  /**
   * @param {TokenLike} kind
   * @param {AnyExpressionSyntaxNode?} expression
   * @param {...ContentSyntaxNode} content
   */
  constructor(kind, expression, ...content) {
    super(kind, expression, ...content)
    this.expression = expression
    const c = this.children.filter(c => c !== this.tagToken && c != this.expression)
    mustBeArrayOfContentLike(content, 'content')
    mustBeArrayOfContentLike(c, 'c')
    this.content = c
  }
}
exports.SeeTagSyntaxNode = SeeTagSyntaxNode

// -------------------------------------
class LinkTagSyntaxNode extends TagSyntaxNode {
  /** @type {AnyExpressionSyntaxNode?} */ expression
  /** @type {ContentSyntaxNode[]} */ content

  /**
   * @param {TokenLike} tagToken
   * @param {AnyExpressionSyntaxNode?} expression
   * @param {...ContentSyntaxNode} content
   */
  constructor(tagToken, expression, ...content) {
    super(tagToken, expression, ...content)
    this.expression = expression
    this.content = this.children.filter(c => c !== this.tagToken && c != this.expression)
  }

  get text() {
    return this.content.map(c => c.toString('T')).join('')
  }

  get value() {
    return this.content.map(c => c.toString('V')).join('')
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

