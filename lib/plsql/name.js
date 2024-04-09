// @ts-check
const { mustBeInstanceOf, ArgumentValueError, InvalidNumberOfArgumentsError } = require('../guards')
const { Identifier } = require('../name')
const { IdentifierSyntaxNode, SyntaxNode } = require('../syntax')
const { isMethodDeclarationSyntaxNode } = require('./syntax')
const { NamePathExpressionSyntaxNode } = require('../javadoc/syntax')
/**
 * @typedef {import("../name").ItemName} ItemName
 * @typedef {import("../name").ItemNameFormat} ItemNameFormat
 * @typedef {import('./syntax').MethodDeclarationSyntaxNode} MethodDeclarationSyntaxNode
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
    switch (true) {
      case name === undefined:
      case name === null:
        return null
      case name instanceof PlsqlUnitName:
        return name
      case name instanceof Identifier:
        return new PlsqlUnitName(name)
      case name instanceof IdentifierSyntaxNode:
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
  constructor(/** @type {Identifier[]} */ ...parts) {
    switch (parts.length) {
      case 1:
        [this.name] = parts
        break
      case 2:
        [this.owner, this.name] = parts
        break
      default:
        throw new InvalidNumberOfArgumentsError(parts)
    }

    if (this.owner) mustBeInstanceOf(this.owner, Identifier, 'owner')
    mustBeInstanceOf(this.name, Identifier, 'name')
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
   * @param {ItemNameFormat} format
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


/**
 * A member of a PL/SQL unit.
 * @implements {ItemName}
 */
class PlsqlMemberName {

  /** @type {PlsqlUnitName?} */ unit
  /** @type {Identifier} */ name

  /** @type {Identifier?} The owner of the enclosing unit. */
  get owner() {
    return this.unit?.owner
  }

  /** @type {Identifier?} The name of the enclosing unit. */
  get unitName() {
    return this.unit?.name
  }

  /**
   * @param {(PlsqlMemberName | PlsqlUnitName | Identifier | IdentifierSyntaxNode)?} name
   * @returns {PlsqlMemberName}
   */
  static from(name) {
    switch (true) {
      case name === undefined:
      case name === null:
        return null
      case name instanceof PlsqlMemberName:
        return name
      case name instanceof Identifier:
        return new PlsqlMemberName(name)
      case name instanceof IdentifierSyntaxNode:
        const parts = name.parts.map(p => new Identifier(p))
        switch (parts.length) {
          case 1:
            return new PlsqlMemberName(parts[0])
          case 2:
            return new PlsqlMemberName(parts[0], parts[1])
          case 3:
            return new PlsqlMemberName(parts[0], parts[1], parts[2])
          default:
            throw new InvalidNumberOfArgumentsError(parts)
        }
    }

    throw new ArgumentValueError('name', name, 'Value must be an instance of the following types: PlsqlMemberName, Identifier, or IdentifierSyntaxNode.')
  }

  /**
   * @overload
   * @param {Identifier} name
   * @overload
   * @param {Identifier} unitName
   * @param {Identifier} name
   * @overload
   * @param {PlsqlUnitName} unit
   * @param {Identifier} name
   * @overload
   * @param {Identifier} owner
   * @param {Identifier} unitName
   * @param {Identifier} name
   */
  constructor(/** @type {Identifier[]} */ ...parts) {
    switch (parts.length) {
      case 1:
        [this.name] = parts
        mustBeInstanceOf(this.name, Identifier, 'name')
        break
      case 2:
        {
          const [unit, name] = parts
          mustBeInstanceOf(name, Identifier, 'name')
          this.unit = PlsqlUnitName.from(unit)
          this.name = name
          break
        }
      case 3:
        {
          const [owner, unitName, name] = parts
          mustBeInstanceOf(owner, Identifier, 'owner')
          mustBeInstanceOf(unitName, Identifier, 'unitName')
          mustBeInstanceOf(name, Identifier, 'name')
          this.unit = new PlsqlUnitName(owner, unitName)
          this.name = name
          break
        }
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
    return this.unit ? this.unit.length + 1 + this.name.length : this.name.length
  }

  /**
   * @param {ItemNameFormat} format
   * @returns {string}
   */
  toString(format = 'T') {
    if (this.unit) {
      return `${this.unit.toString(format)}.${this.name.toString(format)}`
    }

    return this.name.toString(format)
  }

  /** @returns {object} */
  valueOf() {
    return this.text
  }

  /**
   * @param {PlsqlMemberName} other
   * @returns {boolean}
   */
  equals(other) {
    return other instanceof this.constructor && this.value === other.value
  }

  /**
   * @param {PlsqlMemberName} other
   * @returns {number}
   */
  localeCompare(other) {
    return this.text.localeCompare(other?.text)
  }
}
exports.PlsqlMemberName = PlsqlMemberName


/**
 * @implements {ItemName}
 */
class PlsqlUniqueId {

  /**
   *
   * @param {(PlsqlUniqueId | MethodDeclarationSyntaxNode | NamePathExpressionSyntaxNode)?} value
   * @returns {PlsqlUniqueId}
   */
  static from(value) {
    switch (true) {
      case value === undefined:
      case value === null:
        return null
      case value instanceof PlsqlUniqueId:
        return value
      case isMethodDeclarationSyntaxNode(value):
        return new PlsqlUniqueId(value.name, value.parameters.map(p => p.type))
      case value instanceof NamePathExpressionSyntaxNode:
        return new PlsqlUniqueId(value.identifier, value.parameterList?.parameters)
    }

    throw new ArgumentValueError('value', value, 'Value must be an instance of the following types: PlsqlUniqueId, Identifier, IdentifierSyntaxNode, MethodDeclarationStatementSyntaxNodeBase, or NamePathExpressionSyntaxNode.')
  }


  /** @type {string} */ text
  /** @type {string} */ value


  /**
   * @param {Identifier} name
   * @param {SyntaxNode[]?} parameters
   */
  constructor(name, parameters) {
    this.name = name
    this.parameters = parameters

    if (parameters) {
      // 0 parameters needs to differ from "no parameters listed"
      this.text = `${name.text}(${parameters.map(p => p.toString('T')).join(', ')})`
      this.value = `${name.value}-${parameters.map(p => p.toString('V')).join('-')}`
    } else {
      this.text = name.text
      this.value = name.value
    }
  }

  get length() {
    return this.text.length
  }

  /**
   * @param {ItemNameFormat} format
   * @returns {string}
   */
  toString(format = 'V') {
    switch (format) {
      case null:
      case 'V':
      case 'FILE':
      default:
        return this.value
      case 'T':
        return this.text
    }
  }

  /** @returns {object} */
  valueOf() {
    return this.value
  }

  /**
   * @param {PlsqlUniqueId} other
   * @returns {boolean}
   */
  equals(other) {
    return other instanceof this.constructor && this.value === other.value
  }

  /**
   * @param {PlsqlUniqueId} other
   * @returns {number}
   */
  localeCompare(other) {
    return this.value.localeCompare(other?.value)
  }
}

exports.PlsqlUniqueId = PlsqlUniqueId
