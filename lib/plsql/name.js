const { mustBeNonEmptyString, ArgumentValueError } = require('../guards')
const { IdentifierSyntaxNode, } = require('../syntax')
const { Token, TokenFormat, mustBeToken } = require('../token')

/**
 * @typedef {TokenFormat | 'FILE'} PlsqlIdentifierFormat
 * @interface PlsqlName
 * @property {number} length
 * @property {string} text
 * @property {string} value
 */

/**
 * Represents a standalone PL/SQL identifier (or keyword masquerading as such).
 * @implements {PlsqlName}
 */
class PlsqlIdentifier {
  /** @type {string} */ text
  /** @type {string} */ value

  /**
   * @param {string | Token} text
   */
  constructor(text) {
    switch (typeof text) {
      case 'string':
        // Resolve as string, assuming a bare PL/SQL identifier if not quoted.
        mustBeNonEmptyString(text)
        console.assert(text.indexOf('.') === -1, `what now: ${text}`)
        this.text = text
        const m = /^"(.+)"$/.exec(text)
        this.value = m ? m[1] : text.toUpperCase()
        break
      case 'object':
        mustBeToken(text)
        this.text = text.text
        this.value = text.value
        break
      default:
        throw new ArgumentValueError('text', text, 'Value must be a string or a Token')
    }

  }

  /**
   * @inheritdoc String.length
   */
  get length() {
    return this.text.length
  }

  /**
   * @param {PlsqlIdentifierFormat} format
   * @returns {string}
   */
  toString(format = 'T') {
    switch (format?.toUpperCase()) {
      case 'T':
        return this.text
      case 'FILE':
        // Use the text name, but trim quotes
        return this.text.replace(/^"|"$/g, '')
      case 'V':
      default:
        return this.value
    }
  }

  valueOf() {
    return this.toString('T')
  }
}
exports.PlsqlIdentifier = PlsqlIdentifier

/** @implements {PlsqlName} */
class PlsqlItemName {

  /**
   * @param {IdentifierSyntaxNode?} node
   * @returns {PlsqlItemName?} the name, or null if node is null
   */
  static from(node) {
    switch (node) {
      case undefined:
      case null:
        return undefined
    }

    if (node instanceof PlsqlItemName) {
      return node
    }

    return new PlsqlItemName(node)
  }

  /**
   * @param {string | IdentifierSyntaxNode} name
   */
  constructor(name) {
    if (typeof name === 'string') {
      this.name = new PlsqlIdentifier(name)
    }

    const parts = name.parts.map(t => new PlsqlIdentifier(t))
    switch (parts.length) {
      case 1:
        this.name = parts[0]
        break
      default:
        throw new Error(`Unsupported parts count: ${node.parts.length}`)
    }
  }

  get length() {
    return this.name.length
  }

  get text() {
    return this.toString('T')
  }

  get value() {
    return this.toString('V')
  }

  /**
   * @param {PlsqlIdentifierFormat} format
   * @returns {string}
   */
  toString(format = 'T') {
    return this.name.toString(format)
  }

  valueOf() {
    return this.toString('T')
  }

  /**
   * @param {PlsqlItemName} other
   * @returns {boolean}
   */
  equals(other) {
    return other instanceof PlsqlItemName && this.value === other.value
  }

  /**
   * @param {PlsqlItemName} other
   * @returns {number}
   */
  localeCompare(other) {
    return this.valueOf().localeCompare(other?.valueOf())
  }
}
exports.PlsqlItemName = PlsqlItemName

/** @implements {PlsqlName} */
class PlsqlUnitName {

  /** @type {PlsqlIdentifier?} */ owner
  /** @type {PlsqlIdentifier} */ name

  /**
   * @param  {IdentifierSyntaxNode} node
   */
  constructor(node) {
    const parts = node.parts.map(t => new PlsqlIdentifier(t))
    switch (parts.length) {
      case 1:
        [this.name] = parts
        break
      case 2:
        [this.owner, this.name] = parts
        break
      default:
        throw new Error(`Unsupported parts count: ${node.parts.length}`)
    }
  }

  get length() {
    return this.owner ? this.owner.length + 1 + this.name.length : this.name.length
  }

  /**
   * @param {PlsqlIdentifierFormat} format
   * @returns {string}
   */
  toString(format = 'T') {
    if (this.owner) {
      return `${this.owner.toString(format)}.${this.name.toString(format)}`
    }

    return this.name.toString(format)
  }

  valueOf() {
    return this.toString()
  }
}
exports.PlsqlUnitName = PlsqlUnitName
