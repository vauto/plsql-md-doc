// @ts-check
const console = require('../debug').child(__filename)
const { ArgumentValueError } = require('../guards')
const {
  ExpressionSyntaxNode,
  IdentifierSyntaxNode,
  StatementSyntaxNode,
  SyntaxNode,
  SyntaxNodeReader,
  LiteralSyntaxNode
} = require('../syntax')
const { Token, mustBeTokenLike } = require('../token')

/**
 * @typedef {import("../token").TokenFormat} TokenFormat
 * @typedef {import("../token").TokenLike} TokenLike
 * @typedef {import("../token").TokenPattern} TokenPattern
 * @typedef {import("../syntax").AnyExpressionSyntaxNode} AnyExpressionSyntaxNode
 * @typedef {import("../syntax").SyntaxNodeOrTokenLike} SyntaxNodeOrTokenLike
 * @typedef {import("../syntax").SyntaxNodeOrTokenLikeOrIterable} SyntaxNodeOrTokenLikeOrIterable
 */

class Patterns {
  static operator = (value) => ({ type: 'operator', value })

  static CONTENT = { type: 'content' }
  static OPEN_BRACE = Patterns.operator('{')
  static CLOSE_BRACE = Patterns.operator('}')
  static OPEN_BRACKET = Patterns.operator('[')
  static CLOSE_BRACKET = Patterns.operator(']')

  static IDENTIFIER = { type: 'identifier' }
  static PERIOD = { type: 'operator', value: '.' }
  static TAG = { type: 'tag' }
  static URL = { type: 'url' }
  static HASH = Patterns.operator('#')
}

class JavadocNodeReader extends SyntaxNodeReader {

  /**
   * @returns {AnyExpressionSyntaxNode?}
   */
  #tryReadNextAsBraceContent() {
    return this.#tryReadNextAsTag()
  }

  /**
   * Reads a sequence of curly-brace expression contents.
   * @returns {Generator<AnyExpressionSyntaxNode>}
   * @yields {AnyExpressionSyntaxNode}
   */
  *#readNextAsBraceContents() {
    let content
    while (content = this.#tryReadNextAsBraceContent()) {
      yield content
    }
  }

  /**
   * @param {TokenLike} openBraceToken
   * @returns {BraceExpressionSyntaxNode}
   */
  #readAsBraceExpression(openBraceToken) {
    const expression = this.#tryReadNextAsBraceContent()
    const closeBraceToken = this.readNextToken(Patterns.CLOSE_BRACE)
    return new BraceExpressionSyntaxNode(openBraceToken, expression, closeBraceToken)
  }

  /**
   * @returns {BraceExpressionSyntaxNode?}
   */
  #tryReadNextAsBraceExpression() {
    const openBraceToken = this.tryReadNextToken(Patterns.OPEN_BRACE)
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
  *#readUpTo(pattern) {
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
  *#readNextAsBracketContents() {
    let content
    while (content = this.#tryReadNextAsBracketContent()) {
      yield content
    }
  }

  /**
   *
   * @param {TokenLike} openBracketToken
   * @returns {TagSyntaxNode | ExpressionSyntaxNode}
   */
  #readAsBracketExpression(openBracketToken) {
    const expression = this.#tryReadNextAsBracketContent()
    const content = [...this.#readNextAsBracketContents()]

    const orphan = SyntaxNode.asSyntaxNode(this.#readUpTo(Patterns.CLOSE_BRACKET))
    const closeBracketToken = this.readNextToken(Patterns.CLOSE_BRACKET)
    // LATER: this won't be detectable as a tag.
    return new ExpressionSyntaxNode(openBracketToken, expression, content, orphan, closeBracketToken)
  }

  /**
   * @returns {(TagSyntaxNode | ExpressionSyntaxNode)?}
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

  #readAsContentOrExpression(token) {
    switch (token.type) {
      case 'operator':
        switch (token.value) {
          case '{':
            return this.#readAsBraceExpression(token)
          case '[':
            return this.#readAsBracketExpression(token)
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
    return this.#tryReadNextAsBraceExpression() ?? this.#tryReadNextAsHashReference() ?? this.#tryReadNextAsBracketExpression() ?? this.#tryReadNextAsStrictContent() ?? this.#tryReadNextAsStarExpression()
  }

  /**
   * Try reading all content.
   * @returns {Generator<SyntaxNode>}
   * @yields {SyntaxNode}
   */
  *#readNextAllContentOrExpressions() {
    let item
    while (item = this.#tryReadNextAsContentOrExpression()) {
      yield item
    }
  }


  /**
   * @param {TokenLike} token
   * @returns {Generator<SyntaxNode>}
   * @yields {SyntaxNode}
   */
  *#readAsAllContentOrExpressions(token) {
    yield this.#readAsContentOrExpression(token)
    yield* this.#readNextAllContentOrExpressions()
  }


  /**
   * @returns {ReferenceExpressionSyntaxNode?}
   */
  #tryReadNextAsBareReference() {
    const name = this.#tryReadNextAsIdentifier()
    if (!name) {
      return null
    }

    const hash = this.tryReadNextToken('#')
    if (hash) {

    }

    const openParenToken = this.tryReadNextToken('(')
    if (openParenToken) {
      // LATER: parse signature
      const parametersWithCommas = [...this.readNextTokensUntil(')')]
      const closeParenToken = parametersWithCommas.pop()
      return new ReferenceExpressionSyntaxNode(name, new ExpressionSyntaxNode(openParenToken, parametersWithCommas, closeParenToken))
    }

    return new ReferenceExpressionSyntaxNode(name)
  }

  #tryReadNextAsUrl() {
    const token = this.tryReadNextToken(Patterns.URL)
    return token ? new LiteralSyntaxNode(token) : null
  }

  #readAsHashExpression(hash) {
    return new ExpressionSyntaxNode(hash, this.#tryReadNextAsIdentifier())
  }

  #tryReadNextAsHashReference() {
    const hash = this.tryReadNextToken(Patterns.HASH)
    return hash ? this.#readAsHashExpression(hash) : null
  }

  /**
   * @returns {AnyExpressionSyntaxNode?}
   */
  #tryReadNextAsSeeExpression() {
    return this.#tryReadNextAsBraceExpression()
      ?? this.#tryReadNextAsUrl()
      ?? this.#tryReadNextAsHashReference()
      ?? this.#tryReadNextAsBareReference()
  }

  #readAsSeeTag(tagToken) {
    // @see url
    // @see {...}
    // @see identifier
    return new SeeTagSyntaxNode(
      tagToken,
      this.#tryReadNextAsSeeExpression(),
      ...this.#readNextAllContentOrExpressions()
    )
  }

  /**
   * @param {TokenLike} token
   * @returns {IdentifierSyntaxNode}
   */
  #readAsIdentifier(token) {
    const tokens = [token]
    let /** @type {Token[]?} */ nextTokens
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
    const brace = this.#tryReadNextAsBraceExpression()

    const type = brace

    // We should have @param <identifier> but we MAY have others:
    //  - @param <identifier>=<default-value>
    //  - @param [<identifier>=<default-value>]
    const openBracketToken = this.tryReadNextToken(Patterns.OPEN_BRACKET)
    const name = this.#tryReadNextAsIdentifier()
    const defaultExpression = this.tryReadNextToken('=')
    const defaultValue = defaultExpression ? this.#tryReadNextAsValueExpression() : null
    const closeBracketToken = openBracketToken ? this.readNextToken(Patterns.CLOSE_BRACKET) : null

    // }

    const result = new ParamTagSyntaxNode(
      tagToken, type,
      openBracketToken,
      name, defaultExpression, defaultValue,
      closeBracketToken,
      ...this.#readNextAllContentOrExpressions()
    )

    return result
  }

  /**
   *
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
        return new ReturnTagSyntaxNode(tagToken, this.#tryReadNextAsBraceExpression(), ...this.#readNextAllContentOrExpressions())

      case 'see':
      case 'seealso':
      case 'include':
      case 'inheritdoc':
        return this.#readAsSeeTag(tagToken)

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
        return new ThrowsExceptionTagSyntaxNode(tagToken, this.#tryReadNextAsIdentifier(), ...this.#readNextAllContentOrExpressions())
      case 'deprecated':
        // @deprecated [message]?
        return new ContentTagSyntaxNode(tagToken, ...this.#readNextAllContentOrExpressions())
      case 'description':
        return new ContentTagSyntaxNode(tagToken, ...this.#readNextAllContentOrExpressions())

      // other content
      case 'example':
      case 'notes':
      case 'remarks':
      case 'since':
        return new ContentTagSyntaxNode(tagToken, ...this.#readNextAllContentOrExpressions())

      // annotations
      case 'autonomous_transaction':
      case 'commit':
      case 'commits':
      case 'enum':
      case 'override':
      case 'virtual':
        return new ContentTagSyntaxNode(tagToken, ...this.#readNextAllContentOrExpressions())

      // unknown
      default:
        // All other tags, treat as extra content / possible annotations.
        return new ContentTagSyntaxNode(tagToken, ...this.#readNextAllContentOrExpressions())
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

        case 'content':
          // Standalone content: this is @description with the tag omitted.
          return new ContentTagSyntaxNode('description', ...this.#readAsAllContentOrExpressions(token))

        case 'operator':
          switch (token.value) {
            case '[':
              // This is probably an C-ish tag.
              return this.#readAsBracketExpression(token)
            case '#':
              return this.#readAsHashExpression(token)
            case '{':
              return this.#readAsBraceExpression(token)
            case '*':
              // Some kind of content.
              return new DescriptionTagSyntaxNode(null, ...this.#readAsAllContentOrExpressions(token))
          }

        default:
          console.info(`${token.textSpan} unexpected token ${token.type}:${JSON.stringify(token.value)}`, token)
          return new DescriptionTagSyntaxNode(null, ...this.#readAsAllContentOrExpressions(token))
      }
    }
  }
}
exports.JavadocNodeReader = JavadocNodeReader

class TagSyntaxNode extends ExpressionSyntaxNode {
  /** @type {TokenLike?} The tag token (optional) */ tagToken

  /**
   * @param {string | TokenLike} kindOrTagToken
   * @param {...SyntaxNodeOrTokenLike} params
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

class DescriptionTagSyntaxNode extends TagSyntaxNode {

  /**
   * @param {Token?} tagToken  The tag token (may be omitted)
   * @param {SyntaxNode[]} content
   */
  constructor(tagToken, ...content) {
    super('description', tagToken, ...content)
    this.content = content
    console.assert(this.content.every(c => c instanceof SyntaxNode))
  }
}
exports.DescriptionTagSyntaxNode = DescriptionTagSyntaxNode

class ParamTagSyntaxNode extends TagSyntaxNode {
  /** @type {AnyExpressionSyntaxNode?} */ type
  /** @type {IdentifierSyntaxNode} */ name
  /** @type {Token?} */ defaultExpressionToken
  /** @type {AnyExpressionSyntaxNode?} */ defaultValue
  /** @type {SyntaxNode[]} */ content

  /**
   * @param {TokenLike} tagToken
   * @param {AnyExpressionSyntaxNode?} type
   * @param {IdentifierSyntaxNode} name
   * @param {TokenLike?} defaultExpressionToken
   * @param {AnyExpressionSyntaxNode?} defaultValue
   * @param {...SyntaxNode} content
   */
  constructor(tagToken, type, openBracketToken, name, defaultExpressionToken, defaultValue, closeBracketToken, ...content) {
    super('param', tagToken, type, openBracketToken, name, defaultExpressionToken, defaultValue, closeBracketToken, ...content)
    this.tagToken = this.resolveToken(tagToken)
    this.type = type
    this.name = name
    this.defaultExpressionToken = this.resolveToken(defaultExpressionToken)
    this.defaultValue = defaultValue
    this.content = content
    this.openBracketToken = this.resolveToken(openBracketToken)
    this.closeBracketToken = this.resolveToken(closeBracketToken)
    console.assert(this.content.every(c => c instanceof SyntaxNode))
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
   * @param {...SyntaxNode} content
   */
  constructor(kind, expression, ...content) {
    super(kind, expression, ...content)
    this.expression = expression
    this.content = content
    console.assert(this.content.every(c => c instanceof SyntaxNode))
  }
}
exports.SeeTagSyntaxNode = SeeTagSyntaxNode

class BraceExpressionSyntaxNode extends ExpressionSyntaxNode {

  /** @type {AnyExpressionSyntaxNode} */ expression
  /** @type {Token} */ openBraceToken
  /** @type {Token} */ closeBraceToken

  /**
   *
   * @param {TokenLike} openBraceToken
   * @param {AnyExpressionSyntaxNode} expression
   * @param {TokenLike} closeBraceToken
   */
  constructor(openBraceToken, expression, closeBraceToken) {
    super(openBraceToken, expression, closeBraceToken)
    this.expression = expression
    this.openBraceToken = this.resolveToken(openBraceToken)
    this.closeBraceToken = this.resolveToken(closeBraceToken)

    console.infoOnce(`${this.openBraceToken.value}: ${this.expression.toString('V')}`, `brace expression: ${this}`, this)
  }
}

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
