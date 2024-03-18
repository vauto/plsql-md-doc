const { console } = require('./debug')
const { mustBeObject } = require("./guards")
const { Position, TextSpan } = require("./position")
const { flattenTokens, isTokenLike, isToken, mustBeToken, Token, TokenIterator, TokenLike, TokenSyntaxError, stringifyTokenArray, TokenGroup } = require("./token")
/**
 * @typedef {SyntaxNode | Token} SyntaxNodeOrToken
 * @typedef {SyntaxNode | TokenLike | SyntaxNodeOrTokenLike[] } SyntaxNodeOrTokenLike
 * @typedef { [key: string]: SyntaxNodeOrTokenLike? } SyntaxNodeOrTokenDictionary
 * @typedef {SyntaxNodeOrTokenDictionary | SyntaxNodeOrTokenLike} SyntaxNodeOrTokenOrParams
 */

/**
 * Base syntax node class.
 */
class SyntaxNode {
  /** @type {string} */ kind
  /** @type {Token[]} All tokens. */ allTokens = []
  /** @type {SyntaxNode?} */ parent

  /**
   * @param  {...TokenLike} tokens
   */
  constructor(...tokens) {
    if (tokens.length) {
      this.push(...tokens)
    }
    this.kind = this.constructor.name.replace(/SyntaxNode$/, '') || this.firstNontrivialToken?.type || 'trivia'
  }

  /**
   *
   * @param {SyntaxNodeOrToken?} value
   * @returns {SyntaxNode?} undefined/null => null, all else is a SyntaxNode
   */
  static asSyntaxNode(value) {
    switch (value) {
      case null:
      case undefined:
        return null;
      default:
        return SyntaxNode.from(value)
    }
  }

  /**
   *
   * @param {SyntaxNodeOrToken} value
   * @returns {SyntaxNode}
   */
  static from(value) {
    mustBeObject(value, 'value')
    if (value instanceof SyntaxNode) {
      return value
    }

    if (isTokenLike(value)) {
      return new SyntaxNode(value)
    }

    if (Symbol.iterator in value) {
      // This can be a sequence of tokens, nodes, OR both.
      value = [...value]
      if (value.length === 0) {
        // Don't construct a node around an empty array.
        return null
      }

      if (value.every(isTokenLike)) {
        return new SyntaxNode(...value)
      } else {
        return new ContainerSyntaxNode(...value)
      }
    }

    throw new TokenSyntaxError(value, `Not a syntax node, token, or iterable: ${value}`)
  }

  /**
   *
   * @param  {...TokenLike} tokens
   */
  push(...tokens) {
    this.assertTokenContinuity()
    console.assert(!this.parent, "parent should not be attached")

    for (const token of flattenTokens(tokens)) {
      console.assert(isToken(token), `Not a token: ${token}`)
      // It's a token
      this.allTokens.push(token)
    }

    this.assertTokenContinuity()
  }

  /** @protected */
  assertTokenContinuity() {
    const discontinuity = this.allTokens
      .map((value, index) => ({ index, current: value, previous: this.allTokens[index - 1] }))
      .filter(entry => entry.previous && !entry.previous.end.equals(entry.current.start))
    if (discontinuity.length > 0) {
      const details = discontinuity.map(({ index, current, previous }) => `- [${index}]: expected ${previous.end.toString('LC')} but got ${current.start.toString('LC')}\n    - previous: ${previous.textSpan}\n    - current:  ${current.textSpan}`)
      console.assert(discontinuity.length === 0, `Token discontinuity! ${this.constructor.name}\n${details.join('\n')}`)
    }
  }

  /** @returns {Token?} The first token. */
  get firstToken() {
    return this.allTokens.at(0)
  }

  /** @returns {Token?} The last token. */
  get lastToken() {
    return this.allTokens.at(-1)
  }

  /** @returns {Token?} The first nontrivial token. */
  get firstNontrivialToken() {
    return this.allTokens.find(t => !t.isTrivia)
  }

  /** @returns {Token?} The last nontrivial token. */
  get lastNontrivialToken() {
    return this.allTokens.findLast(t => !t.isTrivia)
  }

  /** @returns {Token[]} Nontrivial or structured tokens. */
  get structuredTokens() {
    return this.allTokens.filter(t => t.isTrivia !== true)
  }

  /** @returns {Token[]} Nontrivial tokens. */
  get tokens() {
    return this.allTokens.filter(t => !t.isTrivia)
  }

  /**
   * @override
   * @param {TokenFormat} format
   * @return {string}
   */
  toString(format = null) {
    return stringifyTokenArray(this.tokens, format)
  }

  /**
   * String of all structured tokens.
   * @param {TokenFormat} format
   * @return {string}
   */
  toStructuredString(format = null) {
    return stringifyTokenArray(this.structuredTokens, format)
  }

  /**
   * String of all tokens.
   * @param {TokenFormat} format
   * @return {string}
   */
  toFullString(format = null) {
    return stringifyTokenArray(this.allTokens, format)
  }

  /** @type {integer?} */
  get line() {
    return this.allTokens[0]?.line
  }
  /** @type {integer?} */
  get col() {
    return this.allTokens[0]?.col
  }
  /** @type {Position?} */
  get start() {
    return this.allTokens[0]?.start
  }
  /** @type {Position?} */
  get end() {
    return this.allTokens.at(-1)?.end
  }

  /** @type {TextSpan?} */
  get textSpan() {
    return TextSpan.from(this.start, this.end)
  }

  /**
   * @generator
   * @yields {Token} A trivial (whitespace, comment) token.
   * @returns {Generator<Token>}
   */
  *getAllTrivia() {
    yield* this.allTokens.filter(t => t.isTrivia)
  }

  /**
   * @generator
   * @yields {Token} A trivial (whitespace, comment) token.
   * @returns {Generator<Token>}
   */
  *getLeadingTrivia() {
    for (const token of this.allTokens) {
      if (!token.isTrivia) {
        break
      }
      yield token
    }
  }

  /**
   * @generator
   * @yields {Token} A trivial (whitespace, comment) token.
   * @returns {Generator<Token>}
   */
  *getTrailingTrivia() {
    const lastNonTrivialIndex = this.allTokens.findLastIndex(t => !t.isTrivia)
    yield* lastNonTrivialIndex >= 0 ? this.allTokens.slice(lastNonTrivialIndex + 1) : this.allTokens
  }

  *getDocumentComments() {
    // generators and filter/map don't work together?!?!
    for (const token of this.getLeadingTrivia()) {
      if (token.type === 'comment.doc') {
        yield token
      }
    }
  }
}
exports.SyntaxNode = SyntaxNode

class ContainerSyntaxNode extends SyntaxNode {
  /** @type {SyntaxNode[]} Child nodes. */ children = []

  /**
   * @param {...SyntaxNodeOrToken?} nodesOrTokens
   */
  constructor(...nodesOrTokens) {
    super()
    this.push(...nodesOrTokens)
  }

  /**
   * @param {SyntaxNode} node
   */
  #addChildNode(node) {
    this.#assertContents()

    console.assert(!node.parent)
    node.parent = this
    this.children.push(node)
    super.push(...node.allTokens)

    this.#assertContents()
  }

  /**
   * @param {SyntaxNodeOrTokenDictionary} param
   * @returns {Generator<SyntaxNode>}
   * @yields {SyntaxNode}
   */
  *#addNamedParams(param) {
    console.assert(param && typeof param === 'object' && !isTokenLike(param) && !(param instanceof SyntaxNode) && !(Symbol.iterator in param), 'these do not belong here')
    console.assert(Object.keys(param).length, 'empty param?')

    for (const [key, value] of Object.entries(param)) {
      console.assert(key !== 'value', 'value wil not work')
      try {
        if (value === undefined || value === null) {
          this[key] = null
        } else if (value instanceof Array && (value.length === 0 || value[0] instanceof SyntaxNode)) {
          // SyntaxNode[]
          this[key] = value
          yield* this.#push(...this[key])
        } else {
          this[key] = SyntaxNode.asSyntaxNode(value)
          this.#addChildNode(this[key])
          yield this[key]
        }
      } catch (e) {
        if (e instanceof TokenSyntaxError) {
          throw e.constructor(`For key '${key}', value ${value}`, e)
        } else {
          throw new TokenSyntaxError(this, `For key '${key}', value ${value}`, e)
        }
      }
    }
  }

  /**
   * @param  {...SyntaxNodeOrToken?} nodesOrTokens
   * @returns {Generator<SyntaxNode>}
   * @yields {SyntaxNode}
   */
  *#push(...nodesOrTokens) {
    this.#assertContents()

    for (const nodeOrToken of nodesOrTokens.flat()) {
      if (nodeOrToken === undefined || nodeOrToken === null) {
        continue
      }

      if (nodeOrToken instanceof SyntaxNode) {
        this.#addChildNode(nodeOrToken)
        yield nodeOrToken
        continue
      }

      if (isTokenLike(nodeOrToken)) {
        const node = SyntaxNode.from(nodeOrToken)
        this.#addChildNode(node)
        yield node
        continue
      }

      if (Symbol.iterator in nodeOrToken) {
        yield* this.#push(...nodeOrToken)
        continue
      }

      console.assert(false, `${Object.values(nodeOrToken).at(0)?.start ?? this.start} named params`, this.constructor.name, Object.keys(nodeOrToken).sort())
      yield* this.#addNamedParams(nodeOrToken)
    }

    this.#assertContents()
  }

  /**
   * @param  {...SyntaxNodeOrToken?} nodesOrTokens
   * @returns {SyntaxNode[]}
   */
  push(...nodesOrTokens) {
    return [...this.#push(...nodesOrTokens)]
  }

  #assertContents() {
    const discontinuity = this.children
      .map((value, index) => ({ index, current: value, previous: this.children[index - 1] }))
      .filter(entry => entry.previous && !entry.previous.end.equals(entry.current.start))
    if (discontinuity.length > 0) {
      const details = discontinuity.map(({ index, current, previous }) => `- [${index}]: expected ${previous.end} but got ${current.start?.toString('LC')}\n    - previous: ${previous.textSpan}\n    - current:  ${current.textSpan?.toString('NAME')}`)
      console.assert(discontinuity.length === 0, `Children discontinuity! ${this.constructor.name}\n${details.join('\n')}`)
    }
    console.assert(this.allTokens.length === this.children.reduce((sum, node) => sum + node.allTokens.length, 0), 'parent == sum of parts of children')
  }

  toString(format = null) {
    return stringifyTokenArray(this.children.flatMap(c => c.tokens), format)
  }

  toStructuredString(format = null) {
    return stringifyTokenArray(this.children.flatMap(c => c.structuredTokens), format)
  }

  toFullString(format = null) {
    return stringifyTokenArray(this.children.flatMap(c => c.allTokens), format)
  }
}
exports.ContainerSyntaxNode = ContainerSyntaxNode

class ExpressionSyntaxNode extends ContainerSyntaxNode {
  /** @type {string} */
  get value() {
    console.assert(this.hasOwnProperty('value'), 'who', this.constructor.name)
    return this.toString('V')
  }
}
exports.ExpressionSyntaxNode = ExpressionSyntaxNode

class StatementSyntaxNode extends ContainerSyntaxNode { }
exports.StatementSyntaxNode = StatementSyntaxNode

/**
 * Represents an identifier (simple or compound).
 */
class IdentifierSyntaxNode extends SyntaxNode {

  /** @type {Token[]} The identifier parts. */
  get parts() {
    return this.tokens.filter(t => t.type !== 'operator')
  }

  /** @returns {string} The canonical identifier */
  get value() {
    return this.toString('V')
  }
}
exports.IdentifierSyntaxNode = IdentifierSyntaxNode

/**
 * Represents a literal string or numeric value, without subexpressions.
 */
class LiteralSyntaxNode extends SyntaxNode {
  /**
   * @override
   * @param {TokenFormat} format
   */
  toString(format = null) {
    return super.toString(format ?? 'T')
  }

  /**
   * @override
   * @param {TokenFormat} format
   */
  toStructuredString(format = null) {
    return super.toStructuredString(format ?? 'T')
  }

  /**
   * @override
   * @param {TokenFormat} format
   */
  toFullString(format = null) {
    return super.toFullString(format ?? 'T')
  }
}
exports.LiteralSyntaxNode = LiteralSyntaxNode

/**
 * @typedef {ExpressionSyntaxNode | IdentifierSyntaxNode | LiteralSyntaxNode} AnyExpressionSyntaxNode
 */

/**
 * @implements {Iterator<SyntaxNode}
 */
class SyntaxNodeReader {
  /**
   * @param {Iterator<Token>} iterator
   */
  constructor(iterator) {
    this.iterator = iterator instanceof TokenIterator ? iterator :
      iterator instanceof Array ? new TokenIterator(iterator) :
        new TokenIterator([...iterator])
  }

  [Symbol.iterator]() { return this }

  /** @returns {boolean} */
  get done() {
    return this.iterator.done
  }

  next() {
    if (this.done) {
      // We already finished.
      return { done: true }
    }

    const value = this.read()
    console.assert(value !== undefined || this.done, 'if we receive undefined we should be done now.')
    return { done: value === undefined, value }
  }

  /**
   * Returns whether the given pattern and token match.
   * @param {TokenPattern} pattern
   * @param {Token} token
   * @returns {boolean} true if match, false if not
   */
  matches(pattern, token) {
    if (!token) {
      // can't match null/undefined
      return false
    }

    switch (typeof pattern) {
      case 'string':
        if (pattern !== token.value) {
          return false
        }
        break
      case 'object':
        if (pattern instanceof Array) {
          // array: indicates "OR" pattern
          return pattern.some(p => this.matches(p, token))
        }

        for (const k in pattern) {
          if (pattern[k] !== token[k]) {
            return false
          }
        }
        break
      default:
        throw new TokenSyntaxError(token, `Unexpected pattern type: ${typeof pattern}: ${pattern}`)
    }

    // Everything matched.
    return true
  }

  /**
   * Verifies the given pattern and token match.
   * @param {TokenPattern} pattern The pattern
   * @param {Token} token  The token
   */
  verify(pattern, token) {
    if (!this.matches(pattern, token)) {
      // remove syntactic sugar for clarity
      if (typeof pattern === 'string') {
        pattern = { value: pattern }
      }
      throw new TokenSyntaxError(token, `Expected: ${JSON.stringify(pattern)} but got ${JSON.stringify({ type: token.type, value: token.value })}`)
    }
  }

  /**
   * Reads a single next (nontrivial) token if one is present, with an optional pattern match.
   * @param {TokenPattern} pattern=undefined An optional pattern.
   * @returns {Token?}
   */
  tryReadNextToken(pattern = undefined) {
    switch (arguments.length) {
      case 0:
        // Any token, pattern doesn't matter
        return this.iterator.nextNonTrivial().value
      default:
        if (this.iterator.nextNonTrivialIs(pattern)) {
          return this.readNextToken()
        }
    }
  }

  endOfStreamError() {
    return this.syntaxError("Expected token but found EOF")
  }

  /**
   * @overload
   * @param {string} description
   * @param {Error?} innerError
   * @returns {TokenSyntaxError}
   * @overload
   * @param {TokenLike} token
   * @param {string} description
   * @param {Error?} innerError
   * @returns {TokenSyntaxError}
   */
  syntaxError() {
    let token, description, innerError
    switch (arguments.length) {
      case 0:
        console.assert(false, 'No description specified')
        break
      case 1:
        [token, description] = [this.iterator.value, arguments[0]]
        break
      case 2:
        [token, description] = arguments
        if (typeof token === 'string') {
          // no token, args are description+error
          [token, description, innerError] = [this.iterator.value, token, description]
        }
        break
      default:
        [token, description, innerError] = arguments
        break
    }

    return new TokenSyntaxError(token, description, innerError)
  }

  /**
   * @overload
   * @returns {TokenSyntaxError}
   * @overload
   * @param {string} description
   * @returns {TokenSyntaxError}
   * @overload
   * @param {TokenLike} token
   * @param {string} description
   * @returns {TokenSyntaxError}
   */
  notImplemented() {
    switch (arguments.length) {
      case 0:
        // ()
        return this.syntaxError('This method is not implemented')
      case 1:
        // (description)
        return this.syntaxError(`${arguments[0]} is not implemented`)
      default:
        // (token, description)
        return this.syntaxError(arguments[0], `${arguments[1]} is not implemented`)
    }
  }

  /**
   * Reads a single next token, throwing an exception if not found,
   * and matching an optional pattern.
   * @param {TokenPattern} pattern=undefined An optional pattern.
   * @returns {Token}
   */
  readNextToken(pattern = undefined) {
    // Regardless of pattern match, we want to read the next token.
    const token = this.tryReadNextToken()
    if (!token) {
      console.assert(this.done)
      throw this.endOfStreamError()
    }

    if (pattern) {
      this.verify(pattern, token)
    }

    return token
  }

  /**
   * Read multiple tokens (including current) if they match the patterns.
   * @param {Token} token The current token
   * @param {TokenPattern} pattern The pattern for {@link token}
   * @param  {...TokenPattern} patterns The patterns to peek, if any
   * @returns {Token[]?}
   */
  tryReadTokensIf(token, pattern, ...patterns) {
    // Handle current.
    if (!this.matches(pattern, token)) {
      return false
    }

    if (this.iterator.nextNonTrivialIs(...patterns)) {
      return [token, ...patterns.map(() => this.readNextToken())]
    }

    return null
  }

  /**
   * Read multiple tokens if they match the patterns.
   * @param  {...TokenPattern} patterns
   * @returns {Token[]?}
   */
  tryReadNextTokens(...patterns) {
    if (this.iterator.nextNonTrivialIs(...patterns)) {
      return patterns.map(() => this.readNextToken())
    }

    return null
  }

  /**
   * Read multiple tokens if they match the patterns.
   * @param  {...TokenPattern} patterns
   * @returns {Token[]?}
   */
  readNextTokens(...patterns) {
    return patterns.map(p => this.readNextToken(p))
  }

  /**
   * Read all tokens that match pattern.
   * @param  {TokenPattern} patterns
   * @returns {Generator<Token>}
   */
  *readNextTokensWhile(pattern) {
    let token
    while (token = this.tryReadNextToken(pattern)) {
      yield token
    }
  }

  /**
   * Reads more tokens until `pattern`, inclusive, throwing an exception on EOF.
   * @param {TokenPattern} pattern
   * @returns {Generator<Token>}
   */
  *readNextTokensUntil(pattern) {
    let token
    while (token = this.tryReadNextToken()) {
      yield token
      if (this.matches(pattern, token)) {
        break
      }
    }
  }

  /**
   * @protected
   * @returns {SyntaxNode?}
   */
  readInternal() { throw new Error('abstract method not implemented') }

  /**
   * @returns {SyntaxNode?}
   */
  read() {
    try {
      return this.readInternal()
    } catch (e) {
      if (e instanceof TokenSyntaxError) {
        // rethrow
        throw e
      }

      throw this.syntaxError(e.message, e)
    }
  }
}
exports.SyntaxNodeReader = SyntaxNodeReader

class Annotation {
  /** @type {IdentifierSyntaxNode} */ name

  /**
   * @param {{[key: string]: SyntaxNode}} params
   */
  constructor(params) {
    Object.assign(this, params)
    console.assert(this.name, 'name not set')
  }
}
exports.Annotation = Annotation
