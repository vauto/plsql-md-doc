const { SyntaxNode, SyntaxNodeOrToken, TokenLike, IdentifierSyntaxNode, StatementSyntaxNode, SyntaxNodeReader, ExpressionSyntaxNode } = require('../syntax')

class Patterns {
  static CONTENT = { type: 'content' }
  static LBRACE = { value: '{' }
  static RBRACE = { value: '}' }

  static IDENTIFIER = { type: 'identifier' }
  static PERIOD = { type: 'operator', value: '.' }
  static URL = { type: 'url' }
}

class JavadocNodeReader extends SyntaxNodeReader {

  /**
   * @param {TokenLike} lbrace
   * @returns {BraceExpressionSyntaxNode}
   */
  #readCurrentAsBracesExpression(lbrace) {
    const expression = [...this.readNextTokensUntil(Patterns.RBRACE)]
    const rbrace = expression.pop()
    return new BraceExpressionSyntaxNode(lbrace, expression, rbrace)
  }

  /**
   * @returns {BraceExpressionSyntaxNode?}
   */
  #tryReadNextWhenBracesExpression() {
    const lbrace = this.tryReadNextToken(Patterns.LBRACE)
    if (!lbrace) {
      return null
    }

    return this.#readCurrentAsBracesExpression(lbrace)
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
    const token = this.tryReadNextToken([Patterns.LBRACE, Patterns.CONTENT])
    if (token) {
      yield* this.#readAsAllContentOrExpressions(token)
    }
  }

  /**
   * @returns {Generator<SyntaxNode>}
   * @yields {SyntaxNode}
   */
  *#readAsAllContentOrExpressions(token) {
    this.verify([Patterns.LBRACE, Patterns.CONTENT], token)

    do {
      if (this.matches(Patterns.LBRACE, token)) {
        // lbrace
        yield this.#readCurrentAsBracesExpression(token)
      } else {
        // plain content
        yield new SyntaxNode(token, ...this.readNextTokensWhile(Patterns.CONTENT))
      }

      token = this.tryReadNextToken([Patterns.LBRACE, Patterns.CONTENT])
    }
    while (token)
  }

  #readAsVisibilityTag(token) {
    this.verify('api', token)
    return new VisibilityTagSyntaxNode(token, this.readNextToken())
  }

  #readAsSeeTag(token) {
    // @see url
    // @see {...}
    // @see identifier
    return new TagSyntaxNode(token, {
      expression: this.#tryReadNextWhenBracesExpression() ?? this.#tryReadNextAsIdentifier() ?? this.tryReadNextToken(Patterns.URL),
      content: [...this.#tryReadNextAllContentOrExpressions() ]
    })
  }


  /**
   * @param {TokenLike} token
   * @returns {IdentifierSyntaxNode}
   */
  #readCurrentAsIdentifier(token) {
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

    return this.#readCurrentAsIdentifier(token)
  }
  /**
   * Reads the `@param` tag.
   * @param {TokenLike} token
   */
  #readAsParamTag(token) {
    const type = this.#tryReadNextWhenBracesExpression()
    const name = this.#tryReadNextAsIdentifier()
    const eq = this.tryReadNextToken('=')
    const defaultValue = eq ? this.#tryReadNextAsIdentifier() : null

    const result = new ParamTagSyntaxNode(token, {
      type, name, eq, defaultValue,
      content: [...this.#tryReadNextAllContentOrExpressions()]
    })

    return result
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
          switch (token.value) {
            case 'property':
            case 'template':
              // <tag> <{type}>? <name> <content>?
              return new TagSyntaxNode(token, {
                type: this.#tryReadNextWhenBracesExpression(),
                name: this.#tryReadNextAsStrictContent(),
                content: [...this.#tryReadNextAllContentOrExpressions()]
              })
            case 'param':
              return this.#readAsParamTag(token)
            case 'define':
            case 'return':
            case 'returns':
              // <tag> <{type}>? <content>?
              return new TagSyntaxNode(token, {
                type: this.#tryReadNextWhenBracesExpression(),
                content: [...this.#tryReadNextAllContentOrExpressions()]
              })

            case 'see':
            case 'seealso':
              return this.#readAsSeeTag(token)

            case 'api':
              // @api <visibility>
              return this.#readAsVisibilityTag(token)

            case 'public':
            case 'private':
            case 'protected':
            case 'internal':
              return new VisibilityTagSyntaxNode(token)

            case 'enum':
            case 'typedef':
            case 'type':
              return new TagSyntaxNode(token, {
                type: this.#tryReadNextAsStrictContent(),
                content: [...this.#tryReadNextAllContentOrExpressions()]
              })
            case 'throws':
            case 'exception':
              return new TagSyntaxNode(token, {
                name: this.#tryReadNextAsIdentifier(),
                content: [...this.#tryReadNextAllContentOrExpressions()]
              })
            case 'description':
              return new DescriptionTagSyntaxNode(token, this.#tryReadNextAllContentOrExpressions())

            case 'example':
              return new TagSyntaxNode(token, {
                content: [...this.#tryReadNextAllContentOrExpressions()]
              })

            // slurp up the rest
            case 'commits':
              return new TagSyntaxNode(token, {
                content: [...this.#tryReadNextAllContentOrExpressions()]
              })

            default:
              console.warn('.....', 'unknown tag', token.value)
              return new TagSyntaxNode(token, {
                content: [...this.#tryReadNextAllContentOrExpressions()]
              })
          }
          break;
        case 'content':
          // Standalone content: this is @description with the tag omitted.
          return new DescriptionTagSyntaxNode(null, [...this.#readAsAllContentOrExpressions(token)])

        default:
          console.assert(false, `${token.start} unexpected token ${token.type}:${JSON.stringify(token.value)}`, token)
          return new SyntaxNode(token)
      }
    }
  }
}
exports.JavadocNodeReader = JavadocNodeReader
class TagSyntaxNode extends StatementSyntaxNode {
  /** @type {string} The tag name */ kind
  /** @type {SyntaxNode[]} The tag content */ content

  /**
   * @param {SyntaxNodeOrToken|string} tag
   * @param {{ [x:string]: object }} params
   * @property {SyntaxNodeOrToken|string} name
   * @property  {SyntaxNodeOrToken|string} content
   */
  constructor(tag, params = {}) {
    super()
    this.kind = tag.toString()
    if (typeof tag === 'object') {
      this.push(tag)
    }

    for (const [key, value] of Object.entries(params)) {
      this[key] = value //?.toString()
      if (typeof value === 'object' && value !== null) {
        this.push(value)
      }
    }

    // Ensure content is not null
    this.content ??= []
  }
}
exports.TagSyntaxNode = TagSyntaxNode

class VisibilityTagSyntaxNode extends TagSyntaxNode {

  /** @type {string} */
  visibility

  /**
   * @overload
   * @param {Token} name
   * @param {Token} visibility
   * @overload
   * @param {Token} visibility
   */
  constructor(nameOrVisibility, visibility = null) {
    super(nameOrVisibility, { visibility })
    this.visibility = (visibility ?? nameOrVisibility).value
  }
}

class DescriptionTagSyntaxNode extends TagSyntaxNode {

  /**
   * @param {Token?} kind  The tag token (may be omitted)
   * @param {SyntaxNode[]} content
   */
  constructor(token, content) {
    super(token ?? 'description', { content })
  }
}
exports.DescriptionTagSyntaxNode = DescriptionTagSyntaxNode

class BraceExpressionSyntaxNode extends ExpressionSyntaxNode {
  constructor(lbrace, expression, rbrace) {
    super()
    console.assert(lbrace.value === '{' && rbrace.value === '}', 'oops')
    this.push(lbrace)
    this.add({ expression })
    this.push(rbrace)
  }
}

class ParamTagSyntaxNode extends TagSyntaxNode {
  /**
   * @param {TokenLike} kind
   * @param {object} params
   * @param {ExpressionSyntaxNode?} params.type
   * @param {IdentifierSyntaxNode} params.name
   * @param {TokenLike?} params.eq
   * @param {ExpressionSyntaxNode?} params.defaultValue
   * @param {SyntaxNode[]} params.content
   */
  constructor(kind, { type, name, eq, defaultValue, content }) {
    super(kind, { type, name })
    if (eq) {
      this.push(eq)
      this.add({ defaultValue })
    }

    this.add({ content })
  }
}
