const { mustBeInstanceOf, ArgumentValueError, InvalidNumberOfArgumentsError } = require('../guards')
const { Identifier, ItemName, IdentifierFormat } = require('../name')
const { IdentifierSyntaxNode, } = require('../syntax')


/** A PL/SQL unit name. */
class PlsqlUnitName extends ItemName {

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
      return new PlsqlUnitName(...name.parts.map(p => new Identifier(p)))
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
    super()
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
}
exports.PlsqlUnitName = PlsqlUnitName

/** A member of a PL/SQL unit. */
class PlsqlMemberName extends ItemName {

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
   * @param {(PlsqlMemberName | Identifier | IdentifierSyntaxNode)?} name
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
    if (name instanceof Identifier) {
      return new PlsqlMemberName(name)
    }
    if (name instanceof IdentifierSyntaxNode) {
      return new PlsqlMemberName(...name.parts.map(p => new Identifier(p)))
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
  constructor(...parts) {
    super()
    switch (parts.length) {
      case 1:
        [this.name] = parts
        mustBeInstanceOf(this.name, Identifier, 'name')
        break
      case 2:
        {
          const [unit, name] = parts
          this.unit = mustBeInstanceOf(PlsqlUnitName.from(unit), PlsqlUnitName, 'unit')
          this.name = mustBeInstanceOf(name, Identifier, 'name')
          break
        }
      case 3:
        {
          const [owner, unitName, name] = parts
          this.unit = new PlsqlUnitName(
            mustBeInstanceOf(owner, Identifier, 'owner'),
            mustBeInstanceOf(unitName, Identifier, 'unitName')
          )
          this.name = mustBeInstanceOf(name, Identifier, 'name')
          break
        }
      default:
        throw new InvalidNumberOfArgumentsError(parts)
    }
  }

  get length() {
    return this.unit ? this.unit.length + 1 + this.name.length : this.name.length
  }

  /**
   * @param {IdentifierFormat} format
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

