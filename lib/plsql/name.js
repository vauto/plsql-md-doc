const { IdentifierSyntaxNode, } = require('../syntax')
const { Token, TokenFormat } = require('../token')

/**
 * @typedef {TokenFormat | 'FILE'} PlsqlIdentifierFormat
 * @interface PlsqlName
 * @property {number} length
 */

/**
 * Represents a standalone PL/SQL identifier (or keyword masquerading as such).
 */
class PlsqlIdentifier {
  /** @type {string} */ text
  /** @type {string} */ value

  /**
   * @param {Token} token
   */
  constructor(token) {
    this.text = token.text
    this.value = token.value
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
}
exports.PlsqlIdentifier = PlsqlIdentifier

/** @implements {PlsqlName} */
class PlsqlItemName {

  /**
   * @param {IdentifierSyntaxNode} node
   */
  constructor(node) {
    const parts = node.parts.map(t => new PlsqlIdentifier(t))
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
