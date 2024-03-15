const { console } = require('../debug')
const { SyntaxNode, SyntaxNodeOrToken, TokenLike, IdentifierSyntaxNode, StatementSyntaxNode, SyntaxNodeReader, ExpressionSyntaxNode } = require('../syntax')

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
    const token = this.tryReadNextToken([Patterns.ANY_LEFT_BRACE, Patterns.CONTENT])
    if (token) {
      yield* this.#readAsAllContentOrExpressions(token)
    }
  }

  /**
   * @returns {Generator<SyntaxNode>}
   * @yields {SyntaxNode}
   */
  *#readAsAllContentOrExpressions(token) {
    this.verify([Patterns.ANY_LEFT_BRACE, Patterns.CONTENT], token)

    do {
      switch (token.type) {
        case 'operator':
          switch (token.value) {
            case '{':
            case '[':
              yield this.readAsBraceExpression(token)
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

  #readAsVisibilityTag(token) {
    this.verify('api', token)
    return new VisibilityTagSyntaxNode(token, this.readNextToken())
  }

  #tryReadNextAsBareReference() {
    const name = this.#tryReadNextAsIdentifier()
    if (!name) {
      return null
    }

    const lparen = this.tryReadNextToken('(')
    if (lparen) {
      return new ExpressionSyntaxNode({
        name, lparen, rest: this.readNextTokensUntil(')')
      })
    }

    return new ExpressionSyntaxNode({ name })
  }

  #readAsSeeTag(token) {
    // @see url
    // @see {...}
    // @see identifier
    return new TagSyntaxNode(token, {
      expression: this.#tryReadNextAsBraceExpression() ?? this.#tryReadNextAsBareReference() ?? this.tryReadNextToken(Patterns.URL),
      content: [...this.#tryReadNextAllContentOrExpressions()]
    })
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
   * Reads the `@param` tag.
   * @param {TokenLike} token
   */
  #readAsParamTag(token) {
    const brace = this.#tryReadNextAsBraceExpression()

    let name, type, eq, defaultValue
    // LATER: handle square braces
    // if (brace.braceType === '[') {
    //   //
    //   name = brace.expression.children.find(t => t instanceof IdentifierSyntaxNode)
    //   if (name) {
    //     console.assert(false, 'here')
    //     const index = brace.expression.children.indexOf(name)
    //   }
    //   eq = this.tryReadNextToken('=')
    //   defaultValue = eq ? this.#tryReadNextAsIdentifier() : null
    // } else {
    //   // Assume {} means "type"

    type = brace
    name = this.#tryReadNextAsIdentifier()
    eq = this.tryReadNextToken('=')
    defaultValue = eq ? this.#tryReadNextAsIdentifier() : null

    // }

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
                type: this.#tryReadNextAsBraceExpression(),
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
                type: this.#tryReadNextAsBraceExpression(),
                content: [...this.#tryReadNextAllContentOrExpressions()]
              })

            case 'see':
            case 'seealso':
            case 'include':
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
            case 'deprecated':
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
            case 'remarks':
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

  /** @type {string}  The visibility value. */ value

  /**
   * @overload
   * @param {Token} name
   * @param {Token} visibility
   * @overload
   * @param {Token} visibility
   */
  constructor(nameOrVisibility, visibility = null) {
    super(nameOrVisibility, { visibility })
    this.value = (visibility ?? nameOrVisibility).value
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

  /** @type {string} */ braceType
  /** @type {SyntaxNode} */ expression

  constructor(lbrace, expression, rbrace) {
    console.assert((lbrace.value === '{' && rbrace.value === '}') || (lbrace.value === '[' && rbrace.value === ']'), 'oops')
    super(lbrace, expression, rbrace)
    this.braceType = lbrace.value
    this.expression = expression
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
      this.push(eq, defaultValue)
      this.defaultExpression = eq // TODO rename eq
      this.defaultValue = defaultValue
    }

    this.push(content)
    this.content = content
  }
}
