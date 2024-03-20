const { ArgumentValueError, mustBeNonEmptyString, ArgumentError } = require('./guards')
const { IdentifierSyntaxNode, } = require('./syntax')
const { Token, TokenFormat, mustBeToken, isToken } = require('./token')

/**
 * @typedef {TokenFormat | 'FILE'} IdentifierFormat
 */

/**
 * Represents a standalone identifier in a language.
 */
class Identifier {
  /** @type {string} */ text
  /** @type {string} */ value

  /**
   * @param {(string | Identifier | IdentifierSyntaxNode)?} name
   * @returns {Identifier?} the name, or null if node is null
   */
  static from(name) {
    switch (name) {
      case undefined:
      case null:
        return undefined
    }

    switch (typeof name) {
      case 'object':
        if (name instanceof Identifier) {
          return name
        }

        if (name instanceof IdentifierSyntaxNode) {
          if (name.parts.length === 1) {
            return new Identifier(name.parts[0])
          }
          throw new ArgumentValueError('name', name, `Compound identifier ${name} cannot be converted to an Identifier.`)
        }

        if (isToken(name)) {
          return new Identifier(name)
        }
        break
      case 'string':
        return new Identifier(name)
    }

    throw new ArgumentValueError('name', name, 'Value must be a string, a Token, an IdentifierSyntaxNode, or an Identifier.')
  }

  /**
   * @overload
   * @param {Token} token
   * @overload
   * @param {string} text
   * @param {string} value
   */
  constructor() {
    switch (arguments.length) {
      case 2:
        [this.text, this.value] = arguments
        break
      case 1:
        const [token] = arguments
        mustBeToken(token)
        this.text = mustBeNonEmptyString(token.text, 'token.text')
        this.value = mustBeNonEmptyString(token.value, 'token.value')
        break
      default:
        throw new Error(`Invalid number of arguments ${arguments.length}`)
    }
  }

  /**
   * @inheritdoc String.length
   */
  get length() {
    return this.text.length
  }

  /**
   * @param {IdentifierFormat} format
   * @returns {string}
   */
  toString(format = 'T') {
    switch (format?.toUpperCase()) {
      case 'T':
        return this.text
      case 'FILE':
        // Use the text name, but in a file-safe manner (e.g., trim quotes)
        return this.text.replace(/^"|"$/g, '')
      case 'V':
      default:
        return this.value
    }
  }

  valueOf() {
    return this.toString('T')
  }

  /**
   * @param {Identifier} other
   * @returns {boolean}
   */
  equals(other) {
    return other instanceof this.constructor && this.value === other.value
  }

  /**
   * @param {Identifier} other
   * @returns {number}
   */
  localeCompare(other) {
    return this.valueOf().localeCompare(other?.valueOf())
  }
}
exports.Identifier = Identifier
