const { InvalidArgumentError } = require('commander')
const { SyntaxNode, SyntaxNodeOrToken, TokenIterator, StatementSyntaxNode, SyntaxNodeReader } = require('../syntax')

class JavadocNodeReader extends SyntaxNodeReader {

  /**
   * @param {TokenIterator} iterator
   * @returns {SyntaxNode?}
   */
  #tryReadNextWhenBracesExpression() {
    const lbrace = this.tryReadNextToken('{')
    if (!lbrace) {
      return null
    }

    return new SyntaxNode(lbrace, ...this.readNextTokensUntil('}'))
  }

  /**
   * Try reading one content item.
   * @returns {SyntaxNode}
   */
  #tryReadNextIfContent() {
    const content = this.tryReadNextToken({ type: 'content' })
    return content ? new SyntaxNode(content) : null
  }

  /**
   * Try reading all content.
   * @returns {SyntaxNode?}
   */
  #readNextTokensWhileContent() {
    return [...this.readNextTokensWhile({ type: 'content' })]
  }

  /**
   * Try reading all content.
   * @returns {SyntaxNode?}
   */
  #tryReadNextAllContent() {
    const buffer = this.#readNextTokensWhileContent()
    return buffer.length ? new SyntaxNode(buffer) : null
  }

  /**
   * @param {TokenIterator} iterator
   * @returns {SyntaxNode?}
   */
  #readAsAllContent(token) {
    this.verify({ type: 'content' }, token)
    return new SyntaxNode(token, ...this.#readNextTokensWhileContent())
  }

  #readAsVisibilityTag(token) {
    this.verify('api', token)
    return new VisibilityTagSyntaxNode(token, this.readNextToken())
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
            case 'param':
              // <tag> <{type}>? <name> <content>?
              return new TagSyntaxNode(token, {
                type: this.#tryReadNextWhenBracesExpression(),
                name: this.#tryReadNextIfContent(),
                content: this.#tryReadNextAllContent()
              })

            case 'define':
            case 'return':
            case 'returns':
              // <tag> <{type}>? <content>?
              return new TagSyntaxNode(token, {
                type: this.#tryReadNextWhenBracesExpression(),
                content: this.#tryReadNextAllContent()
              })

            case 'see':
              return new TagSyntaxNode(token, {
                expression: this.#tryReadNextWhenBracesExpression(),
                content: this.#tryReadNextAllContent()
              })

              case 'api':
              // @api <visibility>
              return this.#readAsVisibilityTag(token)

              break
            case 'public':
            case 'private':
            case 'protected':
            case 'internal':
              return new VisibilityTagSyntaxNode(token)

            case 'enum':
            case 'typedef':
            case 'type':
              return new TagSyntaxNode(token, {
                type: this.#tryReadNextIfContent(),
                content: this.#tryReadNextAllContent()
              })
            case 'throws':
            case 'exception':
              return new TagSyntaxNode(token, {
                name: this.#tryReadNextIfContent(),
                content: this.#tryReadNextAllContent()
              })
            case 'description':
              return new DescriptionTagSyntaxNode(token, this.#tryReadNextAllContent())

            case 'example':
              return new TagSyntaxNode(token, {
                content: this.#tryReadNextAllContent()
              })

            default:
              // slurp up the rest
              console.warn('.....', 'unknown tag', token.value)
              return new TagSyntaxNode(token, {
                content: this.#tryReadNextAllContent()
              })
          }
          break;
        case 'content':
          // Standalone content: this is @description with the tag omitted.
          return new DescriptionTagSyntaxNode(this.#readAsAllContent(token))

        default:
          console.warn('unexpected type', token.type, token)
          return new SyntaxNode(token)
      }
    }
  }
}
exports.JavadocNodeReader = JavadocNodeReader
class TagSyntaxNode extends StatementSyntaxNode {
  /** @type {string} The tag name */
  kind
  /** @type {SyntaxNode?} The tag content */
  content

  get description () {
    console.assert(false)
    return this.content?.toString()
  }

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
    super(nameOrVisibility, {visibility})
    this.visibility = (visibility ?? nameOrVisibility).value
  }
}

class DescriptionTagSyntaxNode extends TagSyntaxNode {

  /**
   * @overload Description tag omitted.
   * @param {SyntaxNode} content
   * @overload
   * @param {Token} name  The tag token
   * @param {SyntaxNode} content
   */

  constructor() {
    switch (arguments.length) {
      case 0:
        throw new InvalidArgumentError('At least one argument required')
      case 1:
        super('description', { content: arguments[0] })
        break
      case 2:
        super(arguments[0], { content: arguments[1] })
        break
      default:
        super(...arguments)
        break
    }
  }
}
