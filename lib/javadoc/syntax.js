const { SyntaxNode, SyntaxNodeFactory, TokenIterator } = require('../syntax')

class JavadocSyntaxNodeFactory extends SyntaxNodeFactory {

  /**
   * @param  {...{Token | Token[]}} tokens
   * @returns {SyntaxNode}
   */
  create(...tokens) {
    switch (tokens[0].type) {
      case 'tag':
        console.log('tag', tokens[0])
        break
    }

    return super.create(...tokens)
  }

  /**
   * @param {TokenIterator} iterator
   * @returns {SyntaxNode?}
   */
  #tryReadTypeConstraint(iterator) {
    debugger;
    if (iterator.peek()?.value === '{') {
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
   * @param {Token?} peek
   * @param {TokenIterator} iterator
   * @returns {SyntaxNode?}
   */
  #tryReadContent(peek, iterator) {
    if (peek?.value === '{') {
      // Open type
      return this.#readContent(iterator)
    }

    return null
  }

  /**
   * @param {TokenIterator} iterator
   * @returns {SyntaxNode}
   */
  #readContent(iterator) {
    const buffer = []
    while (true) {
      const curr = iterator.next()
      if (curr.done) {
        // Malformed
        return new SyntaxNode(buffer)
      }

      const token = curr.value
      console.assert(token.type === 'content')
      buffer.push(curr.value)

      if (curr.peek().type !== 'content') {
        // No more content after this
        return new ContentSyntaxNode(buffer)
      }
    }
  }

  /**
   *
   * @param {Iterator<Token>} tokens
   * @returns {Generator<SyntaxNode>}
   */
  *toSyntax(iterator) {
    let /** @type {Token[]} */ buffer = []

    const tokenIterator = iterator instanceof TokenIterator
      ? iterator : new TokenIterator(iterator)

    while (true) {
      let curr = tokenIterator.next()
      if (curr.done) {
        break
      }

      const tokenGroup = curr.value
      if (tokenGroup.isTrivia) {
        // The content is of trivia tokens only, and probably the last one.
        yield new SyntaxNode(tokenGroup)
        continue
      }

      switch (tokenGroup.type) {
        case 'tag':
          switch (tokenGroup.value) {
            case 'property':
            case 'template':
            case 'param':
              // <tag> <{type}>? <name> <description>?
              const tagNode = new TagSyntaxNode(tokenGroup.tokens)

              curr = nodeIterator.next()
              if (curr.done) {
                // malformed
                yield node;
                return
              }

              curr.value.firstToken

              let type = this.#tryReadTypeConstraint(tokenIterator)
              let description = this.#tryReadContent(curr.peek(), nodeIterator)

              yield new TypeTagSyntaxNode(new SyntaxNode(curr.tokens), type, description)

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
              const buffer = [...curr.tokens]
              curr = nodeIterator.next()
              if (!curr.done) {
                buffer.push(...curr.tokens)
              }

              yield new VisibilityTagSyntaxNode(...buffer)
              break;
            case 'public':
            case 'private':
            case 'protected':
            case 'internal':
              yield new VisibilityTagSyntaxNode(value)
              // tag.visibility = type;
              break;
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
              // tag.full = parts.join(' ').trim();
              // tag.summary = tag.full.split('\n\n')[0];
              // tag.body = tag.full.split('\n\n').slice(1).join('\n\n');
              break;
            default:
              // tag.string = parts.join(' ').replace(/\s+$/, '');
              console.log('.....', 'other tag', value)
              break
          }
          break;
        case 'char':
          console.log('plain char', value)
          break
        case null:
        case undefined:
          // trivia
          if (buffer.length) {
            console.warn('flushing buffer', buffer)
            yield this.create(buffer)
            buffer = []
          }

          yield new SyntaxNode(curr.tokens)
          continue
      }

      buffer.push(value)

      switch (value.type) {
        case 'star':
          if (value.col === 1) {
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

        case 'tag':
          // tag
          switch (value.value) {
            case 'property':
            case 'template':
            case 'param':
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
            case 'public':
            case 'private':
            case 'protected':
            case 'internal':
              yield new VisibilityTagSyntaxNode(...curr.tokens)
              break;
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
              // tag.full = parts.join(' ').trim();
              // tag.summary = tag.full.split('\n\n')[0];
              // tag.body = tag.full.split('\n\n').slice(1).join('\n\n');
              break;
            default:
              // tag.string = parts.join(' ').replace(/\s+$/, '');
              console.log('.....', 'other tag', value)
              break
          }
          break;
        case 'char':
          console.log('plain char', value)
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
  name
  kind

  /**
   *
   * @param {Token} name
   * @param  {...Token} args
   */
  constructor(name, ...args) {
    super(name, ...args)
    this.name = new IdentifierSyntaxNode(name)
    this.kind ??= this.name.value
  }
}

class EmptyTagSyntaxNode extends TagSyntaxNode {
  /**
   * @param {Token} name
   */
  constructor(name) {
    super(name)
  }
}

class VisibilityTagSyntaxNode extends EmptyTagSyntaxNode {
  kind = 'visibility'
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
  kind = 'type'

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

    console.log('CONTENT', description.toString())
  }
}

class ContentSyntaxNode extends SyntaxNode {

}
