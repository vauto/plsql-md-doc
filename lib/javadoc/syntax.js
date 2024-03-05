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
  #tryReadTypeConstraint(iterator) {
    if (iterator.expect('{')) {
      // Type constraint
      return this.#readTypeConstraint(iterator)
    }

    return null
  }

  /**
   * @param {TokenIterator} iterator
   * @returns {SyntaxNode}
   */
  #readTypeConstraint(iterator) {
    let curr = iterator.next()
    console.assert(!lb.done && lb.value.value === '{')

    let lb = new SyntaxNode(curr.tokens)

    let buffer = []

    curr = iterator.next()
    while (!curr.done) {
      const token = curr.value
      if (token.value === '}') {
        return new TypeConstraintSyntaxNode(lb, new SyntaxNode(buffer), new SyntaxNode(curr.tokens))
      }
    }

    // Malformed token
    return new SyntaxNode(...lb.tokens, ...buffer)
  }

  /**
   * Try reading one content item.
   * @param {TokenIterator} iterator
   * @returns {SyntaxNode}
   */
  #tryReadContent(iterator) {
    if (iterator.expect({ type: 'content' })) {
      return new ContentSyntaxNode(iterator.next().value)
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

    return buffer.length ? new ContentSyntaxNode(buffer) : null
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

    return new ContentSyntaxNode(buffer)
  }

  /**
   *
   * @param {Iterator<Token>} tokens
   * @returns {Generator<SyntaxNode>}
   */
  *toSyntax(tokens) {
    let /** @type {Token[]} */ buffer = []

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
              const tagNode = new TagSyntaxNode(token)

              let type = this.#tryReadTypeConstraint(tokenIterator)
              let name = this.#tryReadContent(tokenIterator)
              let description = this.#tryReadAllContent(tokenIterator)

              tagNode.push(type, name, description)
              console.log(token.value, { type: type?.toString(), name: name.toString(), description: description?.toString() })
              break

            // var typeString = matchTypeStr.test(parts[0]) ? parts.shift() : "";
            // tag.name = parts.shift() || '';
            // tag.description = parts.join(' ');
            // exports.parseTagTypes(typeString, tag);
            // break;
            case 'define':
            case 'return':
            case 'returns':
            // var typeString = matchTypeStr.test(parts[0]) ? parts.shift() : "";
            // exports.parseTagTypes(typeString, tag);
            // tag.description = parts.join(' ');
            // break;
            case 'see':
              // if (~str.indexOf('http')) {
              //   tag.title = parts.length > 1
              //     ? parts.shift()
              //     : '';
              //   tag.url = parts.join(' ');
              // } else {
              //   tag.local = parts.join(' ');
              // }
              break;
            case 'api':
              // @api <visibility>
              if (tokenIterator.expect({})) {
                yield new VisibilityTagSyntaxNode(token, tokenIterator.next())
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
              // exports.parseTagTypes(parts.shift(), tag);
              break;
            case 'lends':
            case 'memberOf':
              // tag.parent = parts.shift();
              break;
            case 'extends':
            case 'implements':
            case 'augments':
              // tag.otherClass = parts.shift();
              break;
            case 'borrows':
              // tag.otherMemberName = parts.join(' ').split(' as ')[0];
              // tag.thisMemberName = parts.join(' ').split(' as ')[1];
              break;
            case 'throws':
              // var typeString = matchTypeStr.test(parts[0]) ? parts.shift() : "";
              // tag.types = exports.parseTagTypes(typeString);
              // tag.description = parts.join(' ');
              break;
            case 'description':
              yield new DescriptionTagSyntaxNode(token, this.#tryReadAllContent(tokenIterator))
              break;
            default:
              // tag.string = parts.join(' ').replace(/\s+$/, '');
              console.log('.....', 'other tag', value)
              break
          }
          break;
        case 'char':
          console.log('plain char', token)
          break
        case 'content':
          // Standalone content: this is @description with the tag omitted.
          yield new DescriptionTagSyntaxNode(this.#readAllContent(tokenIterator))
      }

      buffer.push(token)

      switch (token.type) {
        case 'star':
          console.warn('star nontrivial?', token.isTrivia, token)
          if (token.col === 1) {
            yield this.create(buffer)
            buffer = []
          } else if (buffer.length) {
            const prevToken = buffer.at(-1)
            if (prevToken?.type === 'whitespace' && prevToken.col === 1) {
              yield this.create(buffer)
              buffer = []
            }
          }
          break

      }
    }

    if (buffer.length) {
      yield this.create(buffer)
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
  name

  /**
   *
   * @param {SyntaxNodeOrToken|string} name
   * @param  {SyntaxNodeOrToken} args
   */
  constructor(name, ...args) {
    super()
    this.name = name.toString()
    if (typeof name === 'object') {
      this.push(name)
    }

    this.push(...args)
  }
}
exports.TagSyntaxNode = TagSyntaxNode

class EmptyTagSyntaxNode extends TagSyntaxNode {
  /**
   * @param {Token} name
   */
  constructor(name) {
    super(name)
  }
}

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
    super(nameOrVisibility, visibility)
    this.visibility = (visibility ?? nameOrVisibility).value
  }
}

class TypeConstraintSyntaxNode extends SyntaxNode {
  lbrace
  name
  rbrace

  /**
   *
   * @param {SyntaxNode} lbrace
   * @param {SyntaxNode} name
   * @param {SyntaxNode} rbrace
   */
  constructor(lbrace, name, rbrace) {
    super(lbrace, name, rbrace)
    this.lbrace = lbrace
    this.name = name
    this.rbrace = rbrace
  }
}

class TypeTagSyntaxNode extends TagSyntaxNode {
  type
  /** @type {TypeConstraintSyntaxNode} */
  definition
  description

  /**
   *
   * @param {SyntaxNode} type
   * @param {SyntaxNode?} definition
   * @param {ContentSyntaxNode?} description
   */
  constructor(type, definition, description) {
    super(type.tokens, definition?.tokens, description?.tokens)

    this.type = type
    this.definition = definition
    this.description = description
  }
}

class DescriptionTagSyntaxNode extends TagSyntaxNode {
  /**
   * @overload Description tag omitted.
   * @param {ContentSyntaxNode} content
   * @overload
   * @param {Token} name  The tag token
   * @param {ContentSyntaxNode} content
   */

  constructor() {
    switch (arguments.length) {
      case 0:
        throw new InvalidArgumentError('At least one argument required')
      case 1:
        super('description', arguments[0])
        break
      default:
        super(...arguments)
        break
    }

    // tag.full = parts.join(' ').trim();
    // tag.summary = tag.full.split('\n\n')[0];
    // tag.body = tag.full.split('\n\n').slice(1).join('\n\n');
  }
}

class ContentSyntaxNode extends SyntaxNode {

}
