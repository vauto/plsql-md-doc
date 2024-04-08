// @ts-check
const console = require('./debug').child(__filename)
const { mustBeObject, mustBeInstanceOf, mustBeNonEmptyString, InvalidNumberOfArgumentsError } = require("./guards")
const { Identifier, mustBeItemName } = require('./name')
const { Position, TextSpan } = require("./position")
const { Token, TokenIterator, TokenSyntaxError, isTokenLike, needsWhitespace } = require("./token")
/**
 * @typedef {import("./name").ItemName} ItemName
 * @typedef {import("./token").TokenFormat} TokenFormat
 * @typedef {import("./token").TokenLike} TokenLike
 * @typedef {import("./token").TokenPattern} TokenPattern
 * @typedef {import("./token").TriviaFlag} TriviaFlag
 */

/**
 * Base syntax node class.
 */
class SyntaxNode {
  /** @type {string} */ kind
  /** @type {Token[]} All tokens. */ allTokens = []
  /** @type {SyntaxNodeOrToken[]} All children. */ allChildren = []
  /** @type {SyntaxNode?} */ parent
  /** @type {AnnotationNode[]} */ annotations = []

  /**
   * @param {...SyntaxNodeOrTokenLikeOrIterable?} nodesOrTokens
   */
  constructor(...nodesOrTokens) {
    if (nodesOrTokens.length) {
      this.add(...nodesOrTokens)
    }
    this.kind = this.constructor.name.replace(/SyntaxNode$/, '') || this.firstNontrivialToken?.type || 'trivia'
  }

  /** @type {TriviaFlag} */
  get isTrivia() {
    let /** @type {TriviaFlag} */ trueAnswer = true
    for (const t of this.allTokens) {
      if (!t.isTrivia) {
        return false
      }
      if (typeof t.isTrivia === 'string') {
        trueAnswer = t.isTrivia
      }
    }
    return trueAnswer
  }

  /**
   *
   * @param {SyntaxNodeOrTokenLikeOrIterable?} value
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
   * Returns the possibly SyntaxNode or token, or sequence thereof as a single SyntaxNode.
   * @param {SyntaxNodeOrTokenLikeOrIterable} value
   * @returns {SyntaxNode}
   * <p>
   * A {@link TokenLike} (or a sequence of such) is returned as a {@link SyntaxNode};
   * a single {@link SyntaxNode} is returned as self;
   * a sequence of {@link SyntaxNode} objects is returned as a single wrapped node.
   */
  static from(value) {
    mustBeObject(value, 'value')
    if (value instanceof SyntaxNode) {
      return value
    }

    if (isTokenLike(value)) {
      switch (value.type) {
        case 'string':
        case 'number':
          return new LiteralSyntaxNode(value)
        default:
          return new SyntaxNode(value)
      }
    }

    // Array/sequence of SyntaxNodeOrTokenLike
    if (Symbol.iterator in value) {
      const array = [...value]
      if (array.length === 0) {
        // Don't construct a node around an empty array.
        return null
      }

      if (array.every(isTokenLike)) {
        return new SyntaxNode(...array)
      } else {
        console.assert(false, 'check nodes')
        return new SyntaxNode(...array)
      }
    }

    throw new TokenSyntaxError(value, `Not a syntax node, token, or iterable: ${value}`)
  }

  /**
   * @protected
   * @param {SyntaxNode} node
   */
  addNode(node) {
    node.parent = this
    this.allChildren.push(node)
    this.allTokens.push(...node.allTokens)
  }

  /**
   * @protected
   * @param {Token} token
   */
  addToken(token) {
    this.allChildren.push(token)
    this.allTokens.push(token)
  }

  /**
   * @param {...SyntaxNodeOrTokenLikeOrIterable?} nodesOrTokens
   * @returns {void}
   */
  add(...nodesOrTokens) {
    this.assertContinuity()

    for (const nodeOrToken of nodesOrTokens.flat()) {
      if (nodeOrToken === undefined || nodeOrToken === null) {
        continue
      }

      if (nodeOrToken instanceof Token) {
        this.addToken(nodeOrToken)
        continue
      }

      if (nodeOrToken instanceof SyntaxNode) {
        this.addNode(nodeOrToken)
        continue
      }

      if (Symbol.iterator in nodeOrToken) {
        this.add(...nodeOrToken)
        continue
      }

      if (isTokenLike(nodeOrToken)) {
        console.assert(false, 'sanity check: isTokenLike')
        const node = SyntaxNode.from(nodeOrToken)
        this.addNode(node)
        continue
      }

      throw new TokenSyntaxError(Object.values(nodeOrToken).at(0) ?? this, `${this.constructor.name}: dictionary found: ${JSON.stringify(Object.keys(nodeOrToken).sort())}`)
    }

    console.assert(!this.parent, "parent should not be attached")
    this.assertContinuity()
  }

  /** @protected */
  assertContinuity() {
    this.assertTokenContinuity()
    this.assertChildrenContinuity()
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

  /** @protected */
  assertChildrenContinuity() {
    const children = this.allChildren,
      discontinuity = this.allChildren
        .map((value, index) => ({ index, current: value, previous: children[index - 1] }))
        .filter(entry => entry.previous && !entry.previous.end.equals(entry.current.start))
    if (discontinuity.length > 0) {
      const details = discontinuity.map(({ index, current, previous }) => `- [${index}]: expected ${previous.end} but got ${current.start?.toString('LC')}\n    - previous: ${previous.textSpan}\n    - current:  ${current.textSpan?.toString('NAME')}`)
      console.assert(discontinuity.length === 0, `Children discontinuity! ${this.constructor.name}\n${details.join('\n')}`)
    }
    console.assert(this.allTokens.length === this.allChildren.reduce((sum, snot) => sum + (snot instanceof Token ? 1 : snot.allTokens.length), 0), 'parent == sum of parts of children')
  }

  /** @type {Token?} The first token. */
  get firstToken() {
    return this.allTokens.at(0)
  }

  /** @type {Token?} The last token. */
  get lastToken() {
    return this.allTokens.at(-1)
  }

  /**
   * @param {SyntaxNodeOrToken} nodeOrToken
   * @returns {boolean} true if not trivia, false otherwise.
   */
  #isNotTrivia(nodeOrToken) {
    return !nodeOrToken.isTrivia
  }

  /**
   * @param {SyntaxNodeOrToken} nodeOrToken
   * @returns {boolean} true if structured, false otherwise.
   */
  #isStructured(nodeOrToken) {
    // Currently there are only 3 possible values: false, "structured", true.
    return nodeOrToken.isTrivia !== true
  }

  /** @returns {Token[]} Nontrivial tokens. */
  get tokens() {
    return this.allTokens.filter(this.#isNotTrivia)
  }

  /** @returns {Token?} The first nontrivial token. */
  get firstNontrivialToken() {
    return this.allTokens.find(this.#isNotTrivia)
  }

  /** @returns {Token?} The last nontrivial token. */
  get lastNontrivialToken() {
    return this.allTokens.findLast(this.#isNotTrivia)
  }

  /** @returns {SyntaxNodeOrToken[]} Nontrivial children. */
  get children() {
    return this.allChildren.filter(this.#isNotTrivia)
  }

  /** @returns {Token[]} Nontrivial or structured tokens. */
  get structuredTokens() {
    return this.allTokens.filter(this.#isStructured)
  }

  /** @returns {Token?} The first structured token. */
  get firstStructuredToken() {
    return this.allTokens.find(this.#isStructured)
  }

  /** @returns {Token?} The last structured token. */
  get lastStructuredToken() {
    return this.allTokens.findLast(this.#isStructured)
  }

  /** @returns {SyntaxNodeOrToken[]} Structured children. */
  get structuredChildren() {
    return this.allChildren.filter(this.#isStructured)
  }

  // ---------------

  /**
   * @protected
   * @param {Token} prevToken
   * @param {Token} nextToken
   * @returns {boolean}
   */
  needsWhitespace(prevToken, nextToken) {
    return needsWhitespace(prevToken, nextToken)
  }

  /**
   * @param {TokenFormat} format
   * @return {string}
   * <p>
   * Base class converts to string based on whether token types require whitespace between them.
   */
  toString(format = null) {
    let result = ''
    let prevToken

    for (const child of this.children) {
      const [firstToken, lastToken] = child instanceof Token
        ? [child, child]
        : [child.firstNontrivialToken, child.lastNontrivialToken]

      if (this.needsWhitespace(prevToken, firstToken)) {
        result += ' '
      }

      result += child.toString(format)
      prevToken = lastToken
    }

    return result.trimEnd()
  }

  /**
   * String of all structured tokens.
   * @param {TokenFormat} format
   * @return {string}
   * <p>
   * Base class converts to string based on whether token types require whitespace between them.
   */
  toStructuredString(format = null) {
    let result = ''

    let prevToken

    for (const child of this.structuredChildren) {
      const [firstToken, lastToken] = child instanceof Token
        ? [child, child]
        : [child.firstStructuredToken, child.lastStructuredToken]

      if (this.needsWhitespace(prevToken, firstToken)) {
        result += ' '
      }

      result += child instanceof SyntaxNode ? child.toStructuredString(format) : child.toString(format)
      prevToken = lastToken
    }

    return result.trimEnd()
  }

  /**
   * String of all tokens.
   * @param {TokenFormat} format
   * @return {string}
   * <p>
   * Base class converts it to the full string, trivial tokens and all.
   */
  toFullString(format = null) {
    return this.allTokens.map(c => c.toString(format)).join('')
  }

  /** @returns {Position?} */
  get start() {
    return this.firstToken?.start
  }
  /** @returns {Position?} */
  get end() {
    return this.lastToken?.end
  }

  /** @type {TextSpan?} */
  get textSpan() {
    return TextSpan.from(this.start, this.end)
  }

  /**
   * @returns {Token[]} All trivial tokens (e.g., whitespace, comment) .
   */
  get allTrivia() {
    return this.allTokens.filter(t => t.isTrivia)
  }

  /** @returns {boolean} Determines whether this node has any leading trivia. */
  get hasLeadingTrivia() {
    return !!this.firstToken?.isTrivia
  }

  /**
   * @returns {Token[]} The leading trivial tokens (e.g., whitespace, comment) .
   */
  get leadingTrivia() {
    const firstNonTrivialIndex = this.allTokens.findIndex(t => !t.isTrivia)
    return firstNonTrivialIndex >= 0 ? this.allTokens.slice(0, firstNonTrivialIndex) : this.allTokens
  }

  /** @type {boolean} Determines whether this node has any leading trivia. */
  get hasTrailingTrivia() {
    return !!this.lastToken?.isTrivia
  }

  /**
   * @returns {Token[]}
   */
  get trailingTrivia() {
    const lastNonTrivialIndex = this.allTokens.findLastIndex(t => !t.isTrivia)
    return lastNonTrivialIndex >= 0 ? this.allTokens.slice(lastNonTrivialIndex + 1) : this.allTokens
  }

  /** @returns {boolean} Determines whether this node has any structured trivia. */
  get hasStructuredTrivia() {
    return this.allTokens.some(this.#isStructured)
  }

  *getDocumentComments() {
    // generators and filter/map don't work together?!?!
    for (const token of this.leadingTrivia) {
      if (token.type === 'comment.doc') {
        yield token
      }
    }
  }

  /**
   * Resolves the canonical token for a given token-like object.
   * This is useful to resolve TokenGroups to the canonical token after-the-fact.
   * @param {TokenLike?} token
   * @returns {Token?} The token, or null if null/undefined
   */
  resolveToken(token) {
    return token ? this.tokens.find(t => t.start === token.start && t.value === token.value) : null
  }

}
exports.SyntaxNode = SyntaxNode

/**
 * @typedef {SyntaxNode | Token} SyntaxNodeOrToken
 * @typedef {SyntaxNode | TokenLike} SyntaxNodeOrTokenLike
 * @typedef {{ [key: string]: SyntaxNodeOrTokenLike? }} SyntaxNodeOrTokenLikeDictionary
 * @typedef {SyntaxNodeOrTokenLikeDictionary | SyntaxNodeOrTokenLike} SyntaxNodeOrTokenOrParams
 * @typedef {SyntaxNodeOrTokenLike | Iterable<SyntaxNodeOrTokenLike>} SyntaxNodeOrTokenLikeOrIterable
 * @typedef {SyntaxNode & { name: IdentifierSyntaxNode }} NamedSyntaxNode
 */

class StructuredTriviaSyntaxNode extends SyntaxNode {
  /** @override @type {TriviaFlag} */
  get isTrivia() {
    return 'structured'
  }
}
exports.StructuredTriviaSyntaxNode = StructuredTriviaSyntaxNode

class ExpressionSyntaxNode extends SyntaxNode { }
exports.ExpressionSyntaxNode = ExpressionSyntaxNode

class StatementSyntaxNode extends SyntaxNode { }
exports.StatementSyntaxNode = StatementSyntaxNode

/**
 * Represents an identifier (simple or compound).
 * @implements {ItemName}
 */
class IdentifierSyntaxNode extends SyntaxNode {

  /** @type {Token[]} The identifier parts. */
  get parts() {
    return this.tokens.filter(t => t.type !== 'operator')
  }

  /** @type {string} The identifier as specified in the code */
  get text() {
    return this.toString('T')
  }

  /** @type {string} The canonical identifier */
  get value() {
    return this.toString('V')
  }

  /** @type {number} The length of the (text) string */
  get length() {
    return this.text.length
  }

  /** @returns {object} */
  get valueOf() {
    return this.text
  }

  /**
   * @param {IdentifierSyntaxNode} other
   * @returns {boolean}
   */
  equals(other) {
    // @ts-ignore
    return other instanceof this.constructor && this.value === other.value
  }

  /**
   * @param {IdentifierSyntaxNode} other
   * @returns {number}
   */
  localeCompare(other) {
    return this.valueOf().localeCompare(other?.valueOf())
  }
}
exports.IdentifierSyntaxNode = IdentifierSyntaxNode


/**
 * Base class of nodes that represent content.
 */
class ContentSyntaxNode extends SyntaxNode {

  /**
   * @override
   * @param {TokenFormat} format
   * @returns  {string}
   */
  toString(format = 'T') {
    return super.toStructuredString(format)
  }

  /**
   * @override
   * @param {TokenFormat} format
   * @returns  {string}
   */
  toStructuredString(format = 'T') {
    return super.toStructuredString(format)
  }

  /** @type {string} */
  get text() {
    return this.toString('T')
  }

  /** @type {string} */
  get value() {
    return this.toString('V')
  }
}
exports.ContentSyntaxNode = ContentSyntaxNode

/**
 * Represents a literal string or numeric value, without subexpressions.
 */
class LiteralSyntaxNode extends ContentSyntaxNode {
  /** @type {string} */
  get type() {
    console.assert(false, 'who dat')
    return this.tokens.find(t => t.type !== 'operator').type
  }
}
exports.LiteralSyntaxNode = LiteralSyntaxNode

/**
 * @typedef {ExpressionSyntaxNode | IdentifierSyntaxNode | LiteralSyntaxNode} AnyExpressionSyntaxNode
 */

/**
 * @implements {Iterator<SyntaxNode>}
 */
class SyntaxNodeReader {
  /**
   * @param {Iterable<Token>} iterator
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

  /**
   * @returns {IteratorResult<SyntaxNode>}
   */
  next() {
    if (this.done) {
      // We already finished.
      return { done: true, value: undefined }
    }

    const value = this.read()
    console.assert(value !== undefined || this.done, 'if we receive undefined we should be done now.')
    return { done: value === undefined, value }
  }

  /**
   * Reads a single next (nontrivial) token if one is present, with an optional pattern match.
   * @param {TokenPattern} pattern=undefined An optional pattern.
   * @returns {TokenLike?}
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
   * @param {string?} [description=undefined]
   * @param {Error?} [innerError=undefined]
   * @returns {TokenSyntaxError}
   * @overload
   * @param {TokenLike} token
   * @param {string} description
   * @param {Error?} [innerError=undefined]
   * @returns {TokenSyntaxError}
   */
  syntaxError() {
    let token, description, innerError
    switch (arguments.length) {
      case 0:
        // ()
        break
      case 1:
        // (description)
        [token, description] = [this.iterator.lastValue, arguments[0]]
        break
      case 2:
        // (token, description) | (description, Error)
        [token, description] = arguments
        if (typeof token === 'string') {
          // no token, args are description+error
          [token, description, innerError] = [this.iterator.lastValue, token, description]
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
        const [token, description] = arguments
        return this.syntaxError(token, `${description} is not implemented`)
    }
  }

  /**
   * Reads a single next token, throwing an exception if not found,
   * and matching an optional pattern.
   * @param {TokenPattern} pattern=undefined An optional pattern.
   * @returns {TokenLike}
   */
  readNextToken(pattern = undefined) {
    // Regardless of pattern match, we want to read the next token.
    const token = this.tryReadNextToken()
    if (!token) {
      console.assert(this.done)
      throw this.endOfStreamError()
    }

    if (pattern) {
      Token.mustMatch(pattern, token)
    }

    return token
  }

  /**
   * Read multiple nontrivial tokens if they match the patterns.
   * @param {...TokenPattern} patterns
   * @returns {TokenLike[]} An array of tokens of the exact same length as {@link patterns}, or `null`.
   */
  tryReadNextTokens(...patterns) {
    if (this.iterator.nextNonTrivialIs(...patterns)) {
      return patterns.map(() => this.readNextToken())
    }

    return null
  }

  /**
   * Read multiple tokens if they match the patterns.
   * @param {...TokenPattern} patterns
   * @returns {TokenLike[]?}
   */
  readNextTokens(...patterns) {
    return patterns.map(p => this.readNextToken(p))
  }

  /**
   * Read all tokens that match `pattern`.
   * @param {TokenPattern} pattern
   * @returns {Generator<TokenLike>}
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
   * @returns {Generator<TokenLike>}
   */
  *readNextTokensUntil(pattern) {
    let token
    while (token = this.tryReadNextToken()) {
      yield token
      if (Token.matches(pattern, token)) {
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

class AnnotationNode {
  /** @type {IdentifierSyntaxNode} The annotation name. */ name
  /** @type {NamedSyntaxNode} The target node to which this applies. */ target
  /** @type {AnyExpressionSyntaxNode?} An optional message. */ message

  /**
   * @overload
   * @param {IdentifierSyntaxNode} name The annotation name.
   * @param {NamedSyntaxNode} target
   * @param {AnyExpressionSyntaxNode?} [message] An optional message.
   * @overload
   * @param {string} kind
   * @param {IdentifierSyntaxNode} name The annotation name.
   * @param {NamedSyntaxNode} target
   * @param {AnyExpressionSyntaxNode?} [message] An optional message.
   */
  constructor(/** @type {string|IdentifierSyntaxNode} */ nameOrKind, /** @type {any[]} */ ...params) {
    switch (typeof nameOrKind) {
      // overload 1
      case 'object':
        mustBeInstanceOf(nameOrKind, IdentifierSyntaxNode, 'name')
        this.name = nameOrKind
        this.kind = nameOrKind.value.toLowerCase();
        [this.target, this.message] = params
        break

      // overload 2
      case 'string':
        mustBeNonEmptyString(nameOrKind, 'kind')
        this.kind = nameOrKind;
        [this.name, this.target, this.message] = params
        break
    }

    mustBeInstanceOf(this.target, SyntaxNode, 'target')
    mustBeInstanceOf(this.target.name, IdentifierSyntaxNode, 'target.name')
    if (this.message) mustBeInstanceOf(this.message, SyntaxNode, 'message')
  }
}
exports.AnnotationNode = AnnotationNode
