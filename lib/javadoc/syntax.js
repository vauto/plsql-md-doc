// @ts-check
const console = require('../debug').child(__filename)
const { ArgumentValueError, mustBeInstanceOf, InvalidNumberOfArgumentsError, mustBeObject, mustBeGreaterThanOrEqualTo } = require('../guards')
const {
  ExpressionSyntaxNode,
  IdentifierSyntaxNode,
  StatementSyntaxNode,
  SyntaxNode,
  SyntaxNodeReader,
  LiteralSyntaxNode
} = require('../syntax')
const { Token, mustBeTokenLike, isTokenLike } = require('../token')

/**
 * @typedef {import("../token").TokenFormat} TokenFormat
 * @typedef {import("../token").TokenLike} TokenLike
 * @typedef {import("../token").TokenPattern} TokenPattern
 * @typedef {import("../syntax").AnyExpressionSyntaxNode} AnyExpressionSyntaxNode
 * @typedef {import("../syntax").SyntaxNodeOrTokenLike} SyntaxNodeOrTokenLike
 * @typedef {import("../syntax").SyntaxNodeOrTokenLikeOrIterable} SyntaxNodeOrTokenLikeOrIterable
 */

class Patterns {
  static OPERATOR = { type: 'operator' }
  /**
   * @param {string} value
   * @returns {TokenPattern}
   */
  static operator = (value) => ({ type: 'operator', value })

  static OPEN_BRACE = { type: 'brace.open' }
  static CLOSE_BRACE = { type: 'brace.close' }
  static OPEN_BRACKET = { type: 'bracket.open' }
  static CLOSE_BRACKET = { type: 'bracket.close' }
  static OPEN_PAREN = Patterns.operator('(')
  static CLOSE_PAREN = Patterns.operator(')')

  static TAG_INLINE_START = { type: 'tag.inline.start' }
  static TAG_INLINE_END = Patterns.CLOSE_BRACE

  static IDENTIFIER = { type: 'identifier' }
  static TAG = { type: 'tag' }
  static URL = { type: 'url' }
  static HASH = { type: 'hash' }
  static PERIOD = { type: 'operator', value: '.' }

  static CONTENT = { type: 'content' }
  static WHITESPACE = { type: 'whitespace' }
  static NEWLINE = { type: 'newline' }
  static STRING_LITERAL = { type: 'string' }

  static ANY_CONTENT = [
    this.IDENTIFIER,
    this.CONTENT,
    this.HASH, this.PERIOD, this.OPERATOR,
    this.WHITESPACE, this.NEWLINE,
    this.STRING_LITERAL
  ]

  static ANY_HTML_CLOSE_TAG = [
    { type: 'html.tag.close' },
    { type: 'html.tag.close.self' }
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
   * Try reading one content item.
   * @param {TokenLike} token
   * @returns {SyntaxNode?}
   */
  #readAsStrictContent(token) {
    return new SyntaxNode(token, ...this.readNextTokensWhile(Patterns.CONTENT))
  }

  /**
   * Try reading one content item.
   * @returns {SyntaxNode?}
   */
  #tryReadNextAsStrictContent() {
    const content = this.tryReadNextToken(Patterns.CONTENT)
    return content ? this.#readAsStrictContent(content) : null
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
   * @param {TokenLike} token
   * @returns {SyntaxNode}
   */
  #readAsContentOrExpression(token) {
    switch (token.type) {
      case 'brace.open':
        return this.#readAsBraceExpression(token)
      case 'bracket.open':
        return this.#readAsBracketExpression(token)
      case 'identifier':
        return this.#readAsIdentifier(token)
      case 'operator':
        switch (token.value) {
          case '{':
          case '}':
          case '[':
          case ']':
            console.assert(false, 'not operator anymore!')
            throw this.syntaxError(token, 'These are not operators anymore, whyyy')
          case '#':
            return this.#readAsHashExpression(token)
          case '*':
            // Pops out of semistructured, into content.
            return this.#readAsStarExpression(token)
          default:
            throw this.syntaxError(token, 'Guard assertion failed')
        }
        break
      case 'content':
        // plain content
        return this.#readAsStrictContent(token)
      default:
        throw this.syntaxError(token, 'Guard assertion failed')
    }
  }

  #tryReadNextAsContentOrExpression() {
    return this.#tryReadNextAsBraceExpression()
      ?? this.#tryReadNextAsBracketExpression()
      ?? this.#tryReadNextAsTag()
      ?? this.#tryReadNextAsHashExpression()
      ?? this.#tryReadNextAsIdentifier()
      ?? this.#tryReadNextAsStrictContent()
      ?? this.#tryReadNextAsStarExpression()
  }

  /**
   * Try reading all content.
   * @returns {Generator<SyntaxNode>}
   * @yields {SyntaxNode}
   */
  * #readNextAllContentOrExpressions() {
    let item
    while (item = this.#tryReadNextAsContentOrExpression()) {
      yield item
    }
  }

  /**
   * Reads starting with the given token as any content, until EOF / a non-content token is reached.
   * @param {TokenLike} token
   * @returns {ContentSyntaxNode}
   */
  #readAsAnyContent(token) {
    this.verify(Patterns.ANY_CONTENT, token)
    return new ContentSyntaxNode(token, ...this.readNextTokensWhile(Patterns.ANY_CONTENT))
  }

  /**
   * Tries reading the next item as any content.
   * @returns {ContentSyntaxNode?}
   */
  #tryReadNextAsAnyContent() {
    const token = this.tryReadNextToken(Patterns.ANY_CONTENT)
    return token ? this.#readAsAnyContent(token) : null
  }

  // ---------------

  /**
   * Reads any with the given token as any content, until EOF / a non-content token is reached.
   * @param {TokenLike} token
   * @returns {ContentLikeSyntaxNode}
   */
  #readAsContentLike(token) {
    if (this.matches(Patterns.OPEN_BRACE, token)) {
      return this.#readAsBraceExpression(token)
    }

    return this.#readAsAnyContent(token)
  }

  /**
   * @returns {ContentLikeSyntaxNode?}
   */
  #tryReadNextAsContentLike() {
    const token = this.tryReadNextToken([Patterns.OPEN_BRACE, Patterns.ANY_CONTENT])
    return token ? this.#readAsContentLike(token) : null
  }

  /**
   * @returns {Generator<ContentLikeSyntaxNode>}
   * @yields {ContentLikeSyntaxNode}
   */

  * #readNextAllAsContentLike() {
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

  /**
   * @returns {UrlSyntaxNode?}
   */
  #tryReadNextAsUrl() {
    const token = this.tryReadNextToken(Patterns.URL)
    return token ? new LiteralSyntaxNode(token) : null
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

  /**
   * @param {TokenLike} token
   * @returns {IdentifierSyntaxNode}
   */
  #readAsIdentifier(token) {
    const tokens = [token]
    let /** @type {TokenLike[]?} */ nextTokens
    while (nextTokens = this.tryReadNextTokens(Patterns.PERIOD, Patterns.IDENTIFIER)) {
      tokens.push(...nextTokens)
    }

    return new IdentifierSyntaxNode(...tokens)
  }

  /**
   * @returns {IdentifierSyntaxNode?}
   */
  #tryReadNextAsIdentifier() {
    const token = this.tryReadNextToken(Patterns.IDENTIFIER)
    if (!token) {
      return null
    }

    return this.#readAsIdentifier(token)
  }

  #tryReadNextAsLiteralExpression() {
    const token = this.tryReadNextToken([{ type: 'number' }, { 'type': 'string' }])
    return token ? new LiteralSyntaxNode(token) : null
  }

  /**
   * @returns {AnyExpressionSyntaxNode?}
   */
  #tryReadNextAsValueExpression() {
    return this.#tryReadNextAsLiteralExpression() ?? this.#tryReadNextAsIdentifier()
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
    const defaultExpression = this.tryReadNextToken('=')
    const defaultValue = defaultExpression ? this.#tryReadNextAsValueExpression() : null

    return new ParamTagSyntaxNode(tagToken, type, name, defaultExpression, defaultValue, ...this.#readNextAllAsContentLike())
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
        return new ThrowsExceptionTagSyntaxNode(tagToken, this.#tryReadNextAsIdentifier(), ...this.#readNextAllAsContentLike())
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
   *
   * @param {TokenLike} token
   */
  #readAsHtmlTag(token) {
    return new SyntaxNode(token, ...this.readNextTokensUntil(Patterns.ANY_HTML_CLOSE_TAG))
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
        case 'identifier':
          // Identifier by itself => content (e.g., @description with the tag omitted)
          return this.#readAsImplicitDescriptionTag(token)
        case 'html.tag.open':
          return this.#readAsHtmlTag(token)
        // case 'operator':
        //   switch (token.value) {
        //     case '#':
        //       return this.#readAsHashExpression(token)
        //     case '*':
        //     // Some kind of content.
        //   }

        default:
          console.assert(false, `${token.textSpan} unexpected token ${token.type}:${JSON.stringify(token.value)}`, token)
          return this.#readAsImplicitDescriptionTag(token)
      }
    }
  }
}
exports.JavadocNodeReader = JavadocNodeReader

class TagSyntaxNode extends ExpressionSyntaxNode {
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
    return this.children.map(c => c.toString(format)).join(' ')
  }
}
exports.TagSyntaxNode = TagSyntaxNode

class VisibilityTagSyntaxNode extends TagSyntaxNode {

  /** @type {TokenLike} The visibility token. */ visibilityToken
  /** @type {string}  The visibility value. */ value

  /**
   * @overload
   * @param {TokenLike} tagToken
   * @param {TokenLike} visibility
   * @overload
   * @param {TokenLike} visibilityToken
   */
  constructor(tagToken, visibilityToken = null) {
    super(tagToken, visibilityToken)
    this.visibilityToken = visibilityToken ?? tagToken
    this.value = (visibilityToken ?? tagToken).value
  }
}

class ParamTagSyntaxNode extends TagSyntaxNode {
  /** @type {IdentifierSyntaxNode} */ name
  /** @type {ContentLikeSyntaxNode[]} */ content

  /**
   * Creates a new node for a `@param` tag.
   * @overload
   * @param {TokenLike} tagToken The `@param` token.
   * @param {BraceExpressionSyntaxNode?} type An optional type expression.
   * @param {BracketExpressionSyntaxNode} bracketExpression A bracket expression containing the name and possibly a default value.
   * @param {...ContentLikeSyntaxNode[]} content
   * @overload
   * @param {TokenLike} tagToken The `@param` token.
   * @param {BraceExpressionSyntaxNode?} type An optional type expression.
   * @param {IdentifierSyntaxNode} name The name of the parameter.
   * @param {TokenLike?} equalsToken
   * @param {SyntaxNode?} defaultValue
   * @param {...ContentLikeSyntaxNode[]} content
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
    } else {
      // [name=value]
      mustBeInstanceOf(nameOrBracketExpression, BracketExpressionSyntaxNode, 'bracketExpression')
      mustBeInstanceOf(nameOrBracketExpression.children[0], IdentifierSyntaxNode, 'bracketExpression.children[0]')
      this.name = nameOrBracketExpression.children[0]
      // don't really care about the default value
    }

    this.content = rest.filter(isContentLike);
  }
}
exports.ParamTagSyntaxNode = ParamTagSyntaxNode

class ReturnTagSyntaxNode extends TagSyntaxNode {
  /** @type {AnyExpressionSyntaxNode?} */ type
  /** @type {SyntaxNode[]}} */ content

  /**
   * @param {TokenLike} tagToken
   * @param {AnyExpressionSyntaxNode?} type
   * @param {...SyntaxNode} content
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
  /**
   * @param {TokenLike} tagToken
   * @param {IdentifierSyntaxNode} name
   * @param {...SyntaxNode} content
   */
  constructor(tagToken, name, ...content) {
    super('throws', tagToken, name, ...content)
    this.name = name
    this.content = content
    console.assert(this.content.every(c => c instanceof SyntaxNode))
  }
}

/** Tag with just content. */
class ContentTagSyntaxNode extends TagSyntaxNode {
  /** @type {IdentifierSyntaxNode} */ name

  /**
   * @param {string|TokenLike} kindOrTagToken
   * @param  {...SyntaxNode} content
   */
  constructor(kindOrTagToken, ...content) {
    super(kindOrTagToken, ...content)
    this.content = content
    console.assert(this.content.every(c => c instanceof SyntaxNode))
  }
}

class SeeTagSyntaxNode extends TagSyntaxNode {
  /** @type {AnyExpressionSyntaxNode?} */ expression
  /** @type {SyntaxNode[]} */ content

  /**
   * @param {TokenLike} kind
   * @param {AnyExpressionSyntaxNode?} expression
   * @param {...SyntaxNodeOrTokenLike} content
   */
  constructor(kind, expression, ...content) {
    super(kind, expression, ...content)
    this.expression = expression
    this.content = this.children.slice(2)
    console.assert(this.children.length >= 2 && this.children[1] === expression, 'LinkTagSyntaxNode#expression')
    console.assert(this.content.every(c => c instanceof SyntaxNode), 'LinkTagSyntaxNode#content')
  }
}
exports.SeeTagSyntaxNode = SeeTagSyntaxNode

// -------------------------------------
class LinkTagSyntaxNode extends TagSyntaxNode {
  /** @type {AnyExpressionSyntaxNode?} */ expression
  /** @type {SyntaxNode[]} */ content

  /**
   * @param {TokenLike} tagToken
   * @param {AnyExpressionSyntaxNode?} expression
   * @param {...SyntaxNodeOrTokenLike} content
   */
  constructor(tagToken, expression, ...content) {
    super(tagToken, expression, ...content)
    this.expression = expression
    this.content = this.children.slice(2)
    console.assert(this.children.length >= 2 && this.children[1] === expression, 'LinkTagSyntaxNode#expression')
    console.assert(this.content.every(c => c instanceof SyntaxNode), 'LinkTagSyntaxNode#content')
  }
}
exports.LinkTagSyntaxNode = LinkTagSyntaxNode

// -------------------------------------

/**
 * @abstract Represents a expression surrounded by curly braces (`{...}`).
 */
class BraceExpressionSyntaxNode extends ExpressionSyntaxNode {
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
  /** @type {ContentLikeSyntaxNode[]} */ content

  /**
   * @param {TokenLike} openBraceToken
   * @param {ContentLikeSyntaxNode[]} content
   * @param {TokenLike} closeBraceToken
   */
  constructor(openBraceToken, content, closeBraceToken) {
    super(openBraceToken, content, closeBraceToken)
    this.content = content
  }
}

class BraceNamePathExpressionSyntaxNode extends BraceExpressionSyntaxNode {
  /** @type {AnyExpressionSyntaxNode} */ namePathOrUrl
  /** @type {ContentLikeSyntaxNode[]} */ content

  /**
   * @param {TokenLike} openBraceToken
   * @param {AnyExpressionSyntaxNode?} namePathOrUrl,
   * @param {ContentLikeSyntaxNode[]} content
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
}

class BracketExpressionSyntaxNode extends ExpressionSyntaxNode {

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

class ContentSyntaxNode extends LiteralSyntaxNode { }
class UrlSyntaxNode extends LiteralSyntaxNode { }

/** @typedef {ContentSyntaxNode | UrlSyntaxNode | BraceExpressionSyntaxNode} ContentLikeSyntaxNode */

/**
 *
 * @param {SyntaxNode} node
 * @returns {node is ContentLikeSyntaxNode}
 */
const isContentLike = (node) => node instanceof ContentSyntaxNode || node instanceof UrlSyntaxNode || node instanceof BraceExpressionSyntaxNode


// -------------------------------------

class ReferenceExpressionSyntaxNode extends ExpressionSyntaxNode {
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

