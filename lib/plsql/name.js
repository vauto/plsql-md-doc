// @ts-check
const { mustBeInstanceOf, ArgumentValueError, InvalidNumberOfArgumentsError } = require('../guards')
const { Identifier } = require('../name')
const { IdentifierSyntaxNode, } = require('../syntax')
/**
 * @typedef {import("../name").ItemName} ItemName
 * @typedef {import("../name").IdentifierFormat} IdentifierFormat
 */

/**
 * A PL/SQL unit name.
 * @implements {ItemName}
 */
class PlsqlUnitName {

  /** @type {Identifier?} The owner of this unit. */ owner
  /** @type {Identifier} */ name

  /**
   * @param {(PlsqlUnitName | Identifier | IdentifierSyntaxNode)?} name
   * @returns
   */
  static from(name) {
    switch (name) {
      case undefined:
      case null:
        return null
    }

    if (name instanceof PlsqlUnitName) {
      return name
    }
    if (name instanceof Identifier) {
      return new PlsqlUnitName(name)
    }
    if (name instanceof IdentifierSyntaxNode) {
      const parts = name.parts.map(p => new Identifier(p))
      switch (parts.length) {
        case 1:
          return new PlsqlUnitName(parts[0])
        case 2:
          return new PlsqlUnitName(parts[0], parts[1])
        default:
          throw new InvalidNumberOfArgumentsError(parts)
      }
    }

    throw new ArgumentValueError('name', name, 'Value must be an instance of the following types: PlsqlUnitName, Identifier, or IdentifierSyntaxNode.')
  }

  /**
   * @overload
   * @param {Identifier} name
   * @overload
   * @param {Identifier} owner
   * @param {Identifier} name
   */
  constructor(...parts) {
    switch (parts.length) {
      case 1:
        [this.name] = parts
        mustBeInstanceOf(this.name, Identifier, 'name')
        break
      case 2:
        [this.owner, this.name] = parts
        mustBeInstanceOf(this.owner, Identifier, 'owner')
        mustBeInstanceOf(this.name, Identifier, 'name')
        break
      default:
        throw new InvalidNumberOfArgumentsError(parts)
    }
  }

  get text() {
    return this.toString('T')
  }

  get value() {
    return this.toString('V')
  }

  get length() {
    return this.owner ? this.owner.length + 1 + this.name.length : this.name.length
  }

  /**
   * @param {IdentifierFormat} format
   * @returns {string}
   */
  toString(format = 'T') {
    if (this.owner) {
      return `${this.owner.toString(format)}.${this.name.toString(format)}`
    }

    return this.name.toString(format)
  }

  /** @returns {object} */
  valueOf() {
    return this.text
  }

  /**
   * @param {PlsqlUnitName} other
   * @returns {boolean}
   */
  equals(other) {
    // @ts-ignore
    return other instanceof this.constructor && this.value === other.value
  }

  /**
   * @param {PlsqlUnitName} other
   * @returns {number}
   */
  localeCompare(other) {
    return this.text.localeCompare(other?.text)
  }

}
exports.PlsqlUnitName = PlsqlUnitName
