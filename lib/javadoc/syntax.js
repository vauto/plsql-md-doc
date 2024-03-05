const { SyntaxNode, SyntaxNodeFactory, SyntaxNodeOrToken, TokenIterator } = require('../syntax')

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
   *
   * @param {TokenIterator} iterator
   */
  #readType(iterator) {
    let lb = iterator.next()
    console.assert(!lb.done && lb.value.value === '{')

    let buffer = []
    let curr = iterator.next()
    while (!curr.done) {
      const token = curr.value
      if (token.value === '}') {
        return new TypeExpressionSyntaxNode(lb.value, buffer, token)
      }
    }

    // Malformed token
    return new SyntaxNode(lb, ...buffer)
  }

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
   * @param {Generator<Token>} iterator
   * @returns {Generator<SyntaxNode>}
   */
  *toSyntax(iterator) {
    let /** @type {Token[]} */ buffer = []
    if (!(iterator instanceof TokenIterator)) {
      iterator = new TokenIterator(iterator)
    }
    while (true) {
      const curr = iterator.next()
      if (curr.done) {
        break
      }

      const token = curr.value
      switch (token.type) {
        case 'tag':
          if (buffer.length) {
            console.warn('flushing buffer', buffer)
            yield this.create(buffer)
            buffer = []
          }

          // tag
          switch (token.value) {
            case 'property':
            case 'template':
            case 'param':
              let type = null
              if (curr.peek().value === '{') {
                // Open type
                type = this.#readType(iterator)
              }

              let description = null
              if (curr.peek().type === 'content') {
                description = this.#readContent(iterator)
              }

              yield new TypeTagSyntaxNode(token, type, description)

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
              // tag.visibility = parts.shift();
              break;
            case 'public':
            case 'private':
            case 'protected':
            case 'internal':
              yield new VisibilityTagSyntaxNode(token)
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
              console.log('.....', 'other tag', token)
              break
          }
          break;
        case 'char':
          console.log('plain char', token)
          break
      }

      buffer.push(token)

      switch (token.type) {
        case 'star':
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

        case 'tag':
          // tag
          switch (token.value) {
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
            case 'api':
              // tag.visibility = parts.shift();
              break;
            case 'public':
            case 'private':
            case 'protected':
            case 'internal':
              yield new VisibilityTagSyntaxNode(token)
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
              console.log('.....', 'other tag', token)
              break
          }
          break;
        case 'char':
          console.log('plain char', token)
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

class TypeExpressionSyntaxNode extends SyntaxNode {
  lbrace
  name

  /**
   *
   * @param {Token} lbrace
   * @param {SyntaxNode} name
   * @param {Token} rbrace
   */
  constructor(lbrace, name, rbrace) {
    super(lbrace, ...name, rbrace)
    this.lbrace = lbrace
    this.name = name
    this.rbrace = rbrace
  }
}

class TypeTagSyntaxNode extends TagSyntaxNode {
  kind = 'type'

  type
  /** @type {TypeExpressionSyntaxNode} */
  definition
  description

  /**
   *
   * @param {Token} type
   * @param {SyntaxNode?} definition
   * @param {ContentSyntaxNode?} description
   */
  constructor(type, definition, description) {
    super(type, definition?.tokens, description?.tokens)

    this.type = type
    this.definition = definition
    this.description = description
  }
}

class ContentSyntaxNode extends SyntaxNode {

}
