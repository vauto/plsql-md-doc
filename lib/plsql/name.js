const { mustBeNonEmptyString, mustBeInstanceOf, ArgumentValueError, mustBeObject } = require('../guards')
const { Identifier } = require('../name')
const { IdentifierSyntaxNode, } = require('../syntax')
const { Token, TokenFormat, mustBeToken, isToken } = require('../token')

/**
 * @typedef {TokenFormat | 'FILE'} PlsqlIdentifierFormat
 */

/**
 * Represents a standalone PL/SQL identifier (or keyword masquerading as such).
 */
class PlsqlIdentifier extends Identifier {
  /**
   * @param {(string | PlsqlIdentifier | IdentifierSyntaxNode)?} name
   * @returns {PlsqlIdentifier?} the name, or null if node is null
   */
  static from(name) {
    switch (name) {
      case undefined:
      case null:
        return undefined
    }

    switch (typeof name) {
      case 'object':
        if (name instanceof PlsqlIdentifier) {
          return name
        }

        if (name instanceof IdentifierSyntaxNode) {
          if (name.parts.length === 1) {
            return new PlsqlIdentifier(name.parts[0])
          }
          throw new ArgumentValueError('name', name, `Compound identifier ${name} cannot be converted to a PlsqlIdentifier.`)
        }

        if (isToken(name)) {
          return new PlsqlIdentifier(name)
        }
        break
      case 'string':
        return new PlsqlIdentifier(name)
    }

    throw new ArgumentValueError('name', name, 'Value must be a string, a Token, an IdentifierSyntaxNode, or a PlsqlIdentifier.')
  }

  /**
   * @param {string | Token} text
   */
  constructor(text) {
    switch (typeof text) {
      case 'string':
        console.assert(false, 'oh we do need to handle string.')
        // Resolve as string, assuming a bare PL/SQL identifier if not quoted.
        mustBeNonEmptyString(text)
        console.assert(text.indexOf('.') === -1, `what now: ${text}`)
        const m = /^"(.+)"$/.exec(text)
        super(text, m ? m[1] : text.toUpperCase())
        break
      default:
        super(text)
        break
    }

    console.assert(this.text, 'wut')
    console.assert(this.value, 'wut')
  }
}
exports.PlsqlIdentifier = PlsqlIdentifier

/** @abstract Base class of PL/SQL compound identifier names. */
class PlsqlItemName {

  get length() {
    throw new Error('Not implemented')
  }

  get text() {
    return this.toString('T')
  }

  get value() {
    return this.toString('V')
  }

  /**
   * @override
   * @param {PlsqlIdentifierFormat} format
   * @returns {string}
   */
  toString(format = 'T') {
    throw new Error('Not implemented')
  }

  /**
   * Returns the primitive value of the specified object.
   * @override
   * @returns {string}
   */
  valueOf() {
    return this.text
  }

  /**
   * @param {PlsqlItemName} other
   * @returns {boolean}
   */
  equals(other) {
    return other instanceof this.constructor && this.value === other.value
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

/** A PL/SQL unit name. */
class PlsqlUnitName extends PlsqlItemName {

  /** @type {PlsqlIdentifier?} The owner of this unit. */ owner
  /** @type {PlsqlIdentifier} */ name

  /**
   * @param {(PlsqlUnitName | PlsqlIdentifier | IdentifierSyntaxNode)?} name
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
    if (name instanceof PlsqlIdentifier) {
      return new PlsqlUnitName(name)
    }
    if (name instanceof IdentifierSyntaxNode) {
      return new PlsqlUnitName(...name.parts.map(p => new PlsqlIdentifier(p)))
    }

    throw new ArgumentValueError('name', name, 'Value must be an instance of the following types: PlsqlUnitName, PlsqlIdentifier, or IdentifierSyntaxNode.')
  }

  /**
   * @overload
   * @param {PlsqlIdentifier} name
   * @overload
   * @param {PlsqlIdentifier} owner
   * @param {PlsqlIdentifier} name
   */
  constructor(...parts) {
    super()
    switch (parts.length) {
      case 1:
        [this.name] = parts
        mustBeInstanceOf(this.name, PlsqlIdentifier, 'name')
        break
      case 2:
        [this.owner, this.name] = parts
        mustBeInstanceOf(this.owner, PlsqlIdentifier, 'owner')
        mustBeInstanceOf(this.name, PlsqlIdentifier, 'name')
        break
      default:
        throw new Error(`Wrong number of arguments to PlsqlUnitName: ${parts.length}`)
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
}
exports.PlsqlUnitName = PlsqlUnitName

/** A member of a PL/SQL unit. */
class PlsqlMemberName extends PlsqlItemName {

  /** @type {PlsqlUnitName?} */ unit
  /** @type {PlsqlIdentifier} */ name

  /** @type {PlsqlIdentifier?} The owner of the enclosing unit. */
  get owner() {
    return this.unit?.owner
  }

  /** @type {PlsqlIdentifier?} The name of the enclosing unit. */
  get unitName() {
    return this.unit?.name
  }

  /**
   * @param {(PlsqlMemberName | PlsqlIdentifier | IdentifierSyntaxNode)?} name
   * @returns
   */
  static from(name) {
    switch (name) {
      case undefined:
      case null:
        return null
    }

    if (name instanceof PlsqlMemberName) {
      return name
    }
    if (name instanceof PlsqlIdentifier) {
      return new PlsqlMemberName(name)
    }
    if (name instanceof IdentifierSyntaxNode) {
      return new PlsqlMemberName(...name.parts.map(p => new PlsqlIdentifier(p)))
    }

    throw new ArgumentValueError('name', name, 'Value must be an instance of the following types: PlsqlMemberName, PlsqlIdentifier, or IdentifierSyntaxNode.')
  }

  /**
   * @overload
   * @param {PlsqlIdentifier} name
   * @overload
   * @param {PlsqlIdentifier} unitName
   * @param {PlsqlIdentifier} name
   * @overload
   * @param {PlsqlUnitName} unit
   * @param {PlsqlIdentifier} name
   * @overload
   * @param {PlsqlIdentifier} owner
   * @param {PlsqlIdentifier} unitName
   * @param {PlsqlIdentifier} name
   */
  constructor(...parts) {
    super()
    switch (parts.length) {
      case 1:
        [this.name] = parts
        mustBeInstanceOf(this.name, PlsqlIdentifier, 'name')
        break
      case 2:
        {
          const [unit, name] = parts
          this.unit = mustBeInstanceOf(PlsqlUnitName.from(unit), PlsqlUnitName, 'unit')
          this.name = mustBeInstanceOf(name, PlsqlIdentifier, 'name')
          break
        }
      case 3:
        {
          const [owner, unitName, name] = parts
          this.unit = new PlsqlUnitName(
            mustBeInstanceOf(owner, PlsqlIdentifier, 'owner'),
            mustBeInstanceOf(unitName, PlsqlIdentifier, 'unitName')
          )
          this.name = mustBeInstanceOf(name, PlsqlIdentifier, 'name')
          break
        }
      default:
        throw new Error(`Wrong number of arguments to PlsqlMemberName: ${parts.length}`)
    }
  }

  get length() {
    return this.unit ? this.unit.length + 1 + this.name.length : this.name.length
  }

  /**
   * @param {PlsqlIdentifierFormat} format
   * @returns {string}
   */
  toString(format = 'T') {
    if (this.unit) {
      return `${this.unit.toString(format)}.${this.name.toString(format)}`
    }

    return this.name.toString(format)
  }
}
exports.PlsqlMemberName = PlsqlMemberName

