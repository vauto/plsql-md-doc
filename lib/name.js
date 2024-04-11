// @ts-check
const { mustBeNonEmptyString, InvalidNumberOfArgumentsError, mustBeInstanceOf, mustBeObject, ArgumentValueError } = require('./guards')
const { Token } = require('./token')

/**
 * @typedef {import("./token").TokenFormat} TokenFormat
 * @typedef {import("./name-interfaces").ItemName} ItemName
 * @typedef {import('./name-interfaces').ItemNameFormat} ItemNameFormat
 */

/**
 * Represents a standalone identifier in a language.
 * @implements {ItemName}
 */
class Identifier {
  /** @type {string} */ text
  /** @type {string} */ value

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
        mustBeInstanceOf(token, Token, 'token')
        this.text = mustBeNonEmptyString(token.text, 'token.text')
        this.value = mustBeNonEmptyString(token.value, 'token.value')
        break
      default:
        throw new InvalidNumberOfArgumentsError(arguments)
    }
  }

  /**
   * @inheritdoc String.length
   */
  get length() {
    return this.text.length
  }

  /**
   * @param {ItemNameFormat} format
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

  /** @returns {string} */
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

/**
 * Returns whether the given value is an ItemName.
 * @param {any} value
 * @returns {value is ItemName}
 */
const isItemName = (value) =>
  typeof value === 'object' && value !== null && 'text' in value && 'value' in value && 'equals' in value && 'localeCompare' in value
exports.isItemName = isItemName

/**
 * Verifies the given parameter implements {@link ItemName}.
 * @param {any} value
 * @param {string} paramName
 * @returns {asserts value is ItemName} {@link value}
 */
const mustBeItemName = (value, paramName = 'value') => {
  mustBeObject(value, 'value')
  if ('text' in value && 'value' in value) {
    return
  }

  throw new ArgumentValueError(paramName, value, `Value does not appear to conform to the ItemName interface.`)
}
exports.mustBeItemName = mustBeItemName
