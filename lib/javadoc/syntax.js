const { InvalidArgumentError } = require('commander')
const { SyntaxNode, SyntaxNodeOrToken, SyntaxNodeFactory, TokenIterator } = require('../syntax')

class JavadocSyntaxNodeFactory extends SyntaxNodeFactory {

  /**
   * @param  {...{Token | Token[]}} tokens
   * @returns {SyntaxNode}
   */
  create(...tokens) {
    return super.create(...tokens)
  }

  /**
   * @param {TokenIterator} iterator
   * @returns {SyntaxNode?}
   */
  #tryReadBracesExpression(iterator) {
    if (iterator.expect('{')) {
      // Type constraint
      return this.#readBracesExpression(iterator)
    }

    return null
  }

  /**
   * @param {TokenIterator} iterator
   * @returns {SyntaxNode}
   */
  #readBracesExpression(iterator) {
    console.assert(iterator.expect('{'))

    iterator.next()
    const lbrace = new SyntaxNode(iterator.value)

    const buffer = []

    while (!iterator.done && !iterator.expect('}')) {
      buffer.push(iterator.next().value)
    }

    if (iterator.done) {
      // Malformed token
      return new SyntaxNode(lbrace, ...buffer)
    }

    const rbrace = new SyntaxNode(curr.value)
    return new BracesSyntaxNode(lbrace, new SyntaxNode(buffer), rbrace)
  }

  /**
   * Try reading one content item.
   * @param {TokenIterator} iterator
   * @returns {SyntaxNode}
   */
  #tryReadContent(iterator) {
    if (iterator.expect({ type: 'content' })) {
      return new SyntaxNode(iterator.next().value)
    }

    return null
  }

  /**
   * @param {TokenIterator} iterator
   * @returns {SyntaxNode?}
   */
  #tryReadAllContent(iterator) {
    const buffer = []
    while (iterator.expect({ type: 'content' })) {
      buffer.push(iterator.next().value)
    }

    return buffer.length ? new SyntaxNode(buffer) : null
  }

  /**
   * @param {TokenIterator} iterator
   * @returns {SyntaxNode?}
   */
  #readAllContent(iterator) {
    console.assert(iterator && !iterator.done && iterator.value && iterator.value.type === 'content')
    const buffer = [iterator.value]
    while (iterator.expect({ type: 'content' })) {
      buffer.push(iterator.next().value)
    }

    return new SyntaxNode(buffer)
  }

  /**
   *
   * @param {Iterator<Token>} tokens
   * @returns {Generator<SyntaxNode>}
   */
  *toSyntax(tokens) {
    const tokenIterator = tokens instanceof TokenIterator
      ? tokens : new TokenIterator(tokens)

    while (!tokenIterator.next().done) {
      let curr = tokenIterator

      const token = curr.value
      if (token.isTrivia) {
        // The content is of trivia tokens only, and probably the last one.
        yield new SyntaxNode(token)
        continue
      }

      switch (token.type) {
        case 'tag':
          switch (token.value) {
            case 'property':
            case 'template':
            case 'param':
              // <tag> <{type}>? <name> <description>?
              yield new TagSyntaxNode(token, {
                type: this.#tryReadBracesExpression(tokenIterator),
                name: this.#tryReadContent(tokenIterator),
                description: this.#tryReadAllContent(tokenIterator)
              })

              break

            case 'define':
            case 'return':
            case 'returns':
              // <tag> <{type}>? <description>?
              yield new TagSyntaxNode(token, {
                type: this.#tryReadBracesExpression(tokenIterator),
                description: this.#tryReadAllContent(tokenIterator)
              })
              break

            case 'see':
              yield new TagSyntaxNode(token, {
                expression: this.#tryReadBracesExpression(tokenIterator),
                description: this.#tryReadAllContent(tokenIterator)
              })
              break
            case 'api':
              // @api <visibility>
              if (tokenIterator.expect({})) {
                yield new VisibilityTagSyntaxNode(token, tokenIterator.next())
              } else {
                // malformed
                yield new SyntaxNode(token)
              }

              break
            case 'public':
            case 'private':
            case 'protected':
            case 'internal':
              yield new VisibilityTagSyntaxNode(token)
              break
            case 'enum':
            case 'typedef':
            case 'type':
              yield new TagSyntaxNode(token, {
                type: this.#tryReadContent(tokenIterator),
                description: this.#tryReadAllContent(tokenIterator)
              })
              break;
            case 'throws':
            case 'exception':
              yield new TagSyntaxNode(token, {
                name: this.#tryReadContent(tokenIterator),
                description: this.#tryReadAllContent(tokenIterator)
              })
              break;
            case 'description':
              yield new DescriptionTagSyntaxNode(token, this.#tryReadAllContent(tokenIterator))
              break;
            default:
              // slurp up the rest
              console.warn('.....', 'unknown tag', value)
              yield new TagSyntaxNode(token, {
                description: this.#tryReadAllContent(tokenIterator)
              })
              break
          }
          break;
        case 'content':
          // Standalone content: this is @description with the tag omitted.
          yield new DescriptionTagSyntaxNode(this.#readAllContent(tokenIterator))
          break
        default:
          console.warn('unexpected type', token.type, token)
          break
      }
    }
  }
}

exports.JavadocSyntaxNodeFactory = JavadocSyntaxNodeFactory

class IdentifierSyntaxNode extends SyntaxNode {
  toString() {
    return [...this.getTokens()].join('')
  }
}

class TagSyntaxNode extends SyntaxNode {
  /** @type {string} The tag name */
  tag
  /** @type {string?} The tag description text */
  description

  /**
   * @param {SyntaxNodeOrToken|string} tag
   * @param {{ [x:string]: object }} params
   * @property {SyntaxNodeOrToken|string} name
   * @property  {SyntaxNodeOrToken|string} description
   */
  constructor(tag, params = {}) {
    super()
    this.tag = tag.toString()
    if (typeof tag === 'object') {
      this.push(tag)
    }

    for (const [key, value] of Object.entries(params)) {
      this[key] = value?.toString()
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
   * @param {Token|string} name
   * @param {Token} visibility
   * @overload
   * @param {Token} visibility
   */
  constructor(nameOrVisibility, visibility = null) {
    super(nameOrVisibility)
    this.visibility = (visibility ?? nameOrVisibility).value
  }
}

class BracesSyntaxNode extends SyntaxNode {
  lbrace
  expression
  rbrace

  /**
   *
   * @param {SyntaxNode} lbrace
   * @param {SyntaxNode} expression
   * @param {SyntaxNode} rbrace
   */
  constructor(lbrace, expression, rbrace) {
    super(lbrace, expression, rbrace)
    this.lbrace = lbrace
    this.expression = expression
    this.rbrace = rbrace
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
        super('description', { description: arguments[0] })
        break
      case 2:
        super(arguments[0], { description: arguments[1] })
        break
      default:
        super(...arguments)
        break
    }

    // tag.full = parts.join(' ').trim();
    // tag.summary = tag.full.split('\n\n')[0];
    // tag.body = tag.full.split('\n\n').slice(1).join('\n\n');
    // this.description =
  }
}
