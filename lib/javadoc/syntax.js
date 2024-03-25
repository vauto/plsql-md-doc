const console = require('../debug').child(__filename)
const { ArgumentValueError } = require('../guards')
const {
  AnyExpressionSyntaxNode,
  ExpressionSyntaxNode,
  IdentifierSyntaxNode,
  StatementSyntaxNode,
  SyntaxNode,
  SyntaxNodeOrTokenLike,
  SyntaxNodeOrToken,
  SyntaxNodeReader
} = require('../syntax')
const { TokenLike, mustBeTokenLike } = require('../token')

class Patterns {
  static operator = (value) => ({ type: 'operator', value })

  static CONTENT = { type: 'content' }
  static LBRACE = Patterns.operator('{')
  static RBRACE = Patterns.operator('}')
  static LBRACKET = Patterns.operator('[')
  static RBRACKET = Patterns.operator(']')

  static ANY_LEFT_BRACE = [Patterns.LBRACE, Patterns.LBRACKET]
  static ANY_RIGHT_BRACE = [Patterns.RBRACE, Patterns.RBRACKET]

  static IDENTIFIER = { type: 'identifier' }
  static PERIOD = { type: 'operator', value: '.' }
  static URL = { type: 'url' }
}

class JavadocNodeReader extends SyntaxNodeReader {

  /**
   * @param {TokenLike} lbrace
   * @returns {BraceExpressionSyntaxNode}
   */
  readAsBraceExpression(lbrace) {
    const pattern = lbrace.value == '[' ? Patterns.RBRACKET : Patterns.RBRACE
    const expression = [...this.readNextTokensUntil(pattern)]
    const rbrace = expression.pop()
    return new BraceExpressionSyntaxNode(lbrace, expression, rbrace)
  }

  /**
   * @returns {BraceExpressionSyntaxNode?}
   */
  #tryReadNextAsBraceExpression() {
    const lbrace = this.tryReadNextToken(Patterns.ANY_LEFT_BRACE)
    if (!lbrace) {
      return null
    }

    return this.readAsBraceExpression(lbrace)
  }

  /**
   * Try reading one content item.
   * @returns {SyntaxNode?}
   */
  #tryReadNextAsStrictContent() {
    const content = this.tryReadNextToken(Patterns.CONTENT)
    return content ? new SyntaxNode(content) : null
  }

  /**
   * Try reading all content.
   * @returns {Generator<SyntaxNode>}
   * @yields {SyntaxNode}
   */
  *#tryReadNextAllContentOrExpressions() {
    const token = this.tryReadNextToken([Patterns.ANY_LEFT_BRACE, '#', '*', Patterns.CONTENT])
    if (token) {
      yield* this.#readAsAllContentOrExpressions(token)
    }
  }

  /**
   * @returns {Generator<SyntaxNode>}
   * @yields {SyntaxNode}
   */
  *#readAsAllContentOrExpressions(token) {
    this.verify([Patterns.ANY_LEFT_BRACE, '#', '*', Patterns.CONTENT], token)

    do {
      switch (token.type) {
        case 'operator':
          switch (token.value) {
            case '{':
            case '[':
              yield this.readAsBraceExpression(token)
              break
            case '#':
              yield new ExpressionSyntaxNode(token, this.#tryReadNextAsBareReference())
              break
            case '*':
              // Pops out of semistructured, into content.
              yield new SyntaxNode(token)
              break
            default:
              throw this.syntaxError(token, 'Guard assertion failed')
          }
          break
        case 'content':
          // plain content
          yield new SyntaxNode(token, ...this.readNextTokensWhile(Patterns.CONTENT))
          break
        default:
          throw this.syntaxError(token, 'Guard assertion failed')
      }

      token = this.tryReadNextToken([Patterns.ANY_LEFT_BRACE, Patterns.CONTENT])
    }
    while (token)
  }

  #tryReadNextAsBareReference() {
    const name = this.#tryReadNextAsIdentifier()
    if (!name) {
      return null
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

  #readAsSeeTag(tagToken) {
    // @see url
    // @see {...}
    // @see identifier
    return new SeeTagSyntaxNode(
      tagToken,
      this.#tryReadNextAsBraceExpression() ?? this.#tryReadNextAsBareReference() ?? this.tryReadNextToken(Patterns.URL),
      ...this.#tryReadNextAllContentOrExpressions()
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
   * @param {TokenLike} token
   * @returns {IdentifierSyntaxNode?}
   */
  #tryReadNextAsIdentifier() {
    const token = this.tryReadNextToken(Patterns.IDENTIFIER)
    if (!token) {
      return null
    }

    return this.#readAsIdentifier(token)
  }

  /**
   * @param {TokenLike} token
   * @returns {AnyExpressionSyntaxNode?}
   */
  #tryReadNextAsValueExpression() {
    return this.tryReadNextToken([{ type: 'number' }, { 'type': 'string' }, Patterns.IDENTIFIER])
  }

  /**
   * Reads the `@param` tag.
   * @param {TokenLike} tagToken
   */
  #readAsParamTag(tagToken) {
    const brace = this.#tryReadNextAsBraceExpression()

    // LATER: handle square braces
    // if (brace.braceType === '[') {
    //   //
    //   name = brace.expression.children.find(t => t instanceof IdentifierSyntaxNode)
    //   if (name) {
    //     console.assert(false, 'here')
    //     const index = brace.expression.children.indexOf(name)
    //   }
    //   defaultExpression = this.tryReadNextToken('=')
    //   defaultValue = defaultExpression ? this.#tryReadNextAsIdentifier() : null
    // } else {
    //   // Assume {} means "type"

    const type = brace
    const name = this.#tryReadNextAsIdentifier()
    const defaultExpression = SyntaxNode.asSyntaxNode(this.tryReadNextToken('='))
    const defaultValue = defaultExpression ? this.#tryReadNextAsValueExpression() : null

    // }

    const result = new ParamTagSyntaxNode(
      tagToken, type, name, defaultExpression, defaultValue,
      ...this.#tryReadNextAllContentOrExpressions()
    )

    return result
  }

  /** @override */
  readInternal() {
    while (!this.iterator.nextNonTrivial().done) {
      const tagToken = this.iterator.value
      if (tagToken.isTrivia) {
        // The content is of trivia tokens only, and probably the last one.
        return new SyntaxNode(tagToken)
      }

      switch (tagToken.type) {
        case 'tag':
          switch (tagToken.value.toLowerCase()) {
            case 'param':
              return this.#readAsParamTag(tagToken)
            case 'return':
            case 'returns':
              // @return(s)? <{type}>? <content>?
              return new ReturnTagSyntaxNode(tagToken, this.#tryReadNextAsBraceExpression(), ...this.#tryReadNextAllContentOrExpressions())

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
              return new ThrowsExceptionTagSyntaxNode(tagToken, this.#tryReadNextAsIdentifier(), ...this.#tryReadNextAllContentOrExpressions())
            case 'deprecated':
              // @deprecated [message]?
              return new ContentTagSyntaxNode(tagToken, ...this.#tryReadNextAllContentOrExpressions())
            case 'description':
              return new DescriptionTagSyntaxNode(tagToken, ...this.#tryReadNextAllContentOrExpressions())

            // other content
            case 'example':
            case 'notes':
            case 'remarks':
            case 'since':
              return new ContentTagSyntaxNode(tagToken, ...this.#tryReadNextAllContentOrExpressions())

            // annotations
            case 'autonomous_transaction':
            case 'commit':
            case 'commits':
            case 'enum':
            case 'override':
            case 'virtual':
              return new ContentTagSyntaxNode(tagToken, ...this.#tryReadNextAllContentOrExpressions())

            // unknown
            default:
              // All other tags, treat as extra content / possible annotations.
              return new ContentTagSyntaxNode(tagToken, ...this.#tryReadNextAllContentOrExpressions())
          }

        case 'content':
          // Standalone content: this is @description with the tag omitted.
          return new DescriptionTagSyntaxNode(null, ...this.#readAsAllContentOrExpressions(tagToken))

        case 'operator':
          switch (tagToken.value) {
            case '{':
            case '[':
            case '#':
            case '*':
              // Some kind of content.
              return new DescriptionTagSyntaxNode(null, ...this.#readAsAllContentOrExpressions(tagToken))
          }

        default:
          console.info(`${tagToken.textSpan} unexpected token ${tagToken.type}:${JSON.stringify(tagToken.value)}`, tagToken)
          return new DescriptionTagSyntaxNode(null, ...this.#readAsAllContentOrExpressions(tagToken))
      }
    }
  }
}
exports.JavadocNodeReader = JavadocNodeReader

class TagSyntaxNode extends ExpressionSyntaxNode {
  /** @type {string} The tag name */ kind
  /** @type {TokenLike?} The tag token (optional) */ tagToken

  /**
   * @overload
   * @param {string} kind
   * @param {...SyntaxNodeOrTokenLike} params
   * @overload
   * @param {TokenLike} tagToken
   * @param {...SyntaxNodeOrTokenLike} params
   */
  constructor(kindOrTagToken, ...params) {
    if (typeof kindOrTagToken === 'string') {
      super(...params)
      this.kind = kindOrTagToken
    } else {
      mustBeTokenLike(kindOrTagToken, 'kind')
      super(kindOrTagToken, ...params)
      this.tagToken = this.resolveToken(kindOrTagToken)
      this.kind = this.tagToken.value.toLowerCase()
    }

    if (this.content) {
      console.assert(Array.isArray(this.content) && this.content.every(c => c instanceof SyntaxNode))
    }
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
  constructor(token, ...content) {
    super('description', token, ...content)
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
  constructor(tagToken, type, name, defaultExpressionToken, defaultValue, ...content) {
    super('param', tagToken, type, name, defaultExpressionToken, defaultValue, ...content)
    this.tagToken = this.resolveToken(tagToken)
    this.type = type
    this.name = name
    this.defaultExpressionToken = this.resolveToken(defaultExpressionToken)
    this.defaultValue = defaultValue
    this.content = content
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
  constructor(tagKind, name, ...content) {
    super('throws', tagKind, name, ...content)
    this.name = name
    this.content = content
    console.assert(this.content.every(c => c instanceof SyntaxNode))
  }
}

/** Tag with just content. */
class ContentTagSyntaxNode extends TagSyntaxNode {
  /** @type {IdentifierSyntaxNode} */ name

  constructor(name, ...content) {
    super(name)
    this.name = name
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
    super(kind, expression, content)
    this.expression = expression
    this.content = content
    console.assert(this.content.every(c => c instanceof SyntaxNode))
  }
}
exports.SeeTagSyntaxNode = SeeTagSyntaxNode

class BraceExpressionSyntaxNode extends ExpressionSyntaxNode {

  /** @type {string} */ braceType
  /** @type {SyntaxNode} */ expression

  constructor(lbrace, expression, rbrace) {
    // console.assert((lbrace.value === '{' && rbrace.value === '}') || (lbrace.value === '[' && rbrace.value === ']'), 'oops')
    super(lbrace, expression, rbrace)
    this.braceType = lbrace.value
    this.expression = expression
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
