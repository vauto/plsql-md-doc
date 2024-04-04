// @ts-check
const { Description, CodeContext } = require('./comment.js');
const { Identifier } = require('./name.js');

/**
 * @typedef {{[key: string]: {added?: any?, changed?: any?, deleted?: any?}}} DiffResult
 */

/**
 * @template {Diffable<TDiffable>} TDiffable
 */
class Diffable {
  /**
   * @param {Diffable} self
   * @param {Diffable} other
   * @returns {DiffResult}
   */
  static diff(self, other) {
    if (self === other) {
      return {}
    } else if (!self) {
      return { added: other }
    } else if (!other) {
      return { deleted: self }
    }

    const /** @type {DiffResult} */ result = {}
    const keys = new Set(Object.keys(this).concat(Object.keys(other)))
    for (const key of keys) {
      const [thisValue, otherValue] = [this[key], other[key]]
      if (thisValue === otherValue) continue

      switch (typeof thisValue) {
        case 'object':
          if (thisValue === null) {
            result[key] = { added: otherValue }
          } else if (thisValue.diff) {
            const resultValue = thisValue.diff(otherValue)
            if (resultValue) {
              result[key] = resultValue
            }
          } else if (thisValue instanceof Array && otherValue instanceof Array) {
            // ASSUMPTION: only deletes
            const resultValue = {
              added: otherValue.filter(item => thisValue.indexOf(item) === -1),
              deleted: thisValue.filter(item => otherValue.indexOf(item) === -1)
            }

            if (resultValue.added.length > 0 || resultValue.deleted.length > 0) {
              result[key] = resultValue
            }
            // otherwise they are equal
          } else {
            result[key] = Diffable.diff(thisValue, otherValue)
          }
          continue

        case 'number':
          if (isNaN(thisValue) && isNaN(otherValue)) continue; // please no NaN
          break
      }

      result[key] = { changed: [thisValue, otherValue] }
    }

    return result
  }
}
exports.Diffable = Diffable

/**
 * @typedef {CodeContext & { description: Description }} Entity
 */

/**
 * @extends {Array<Entity>}
 */
class EntityGroup extends Array {

  /** @type {Identifier} */ name
  /** @type {Description} */ description
  /** @type {string[]} */ kind = []

  /**
   * @param {Identifier} name
   * @param {Description} description
   */
  constructor(name, description) {
    super()
    this.name = name
    this.description = description
  }

  /** The ID for the entity group. */
  get id() {
    return this.name.value
  }

  /**
   * @override
   * @param {...Entity} items
   */
  push(...items) {
    const result = super.push(...items)
    this.kind = this.#calculateKind()
    return result
  }

  #calculateKind() {
    switch (this.length) {
      case 0:
        return []
      case 1:
        return [this[0].kind]
      default:
        // NOTE: because we group by name, we can mix procedures and functions.
        // Oracle actually spells out "Function and Procedure" if there are overloads of both.
        // It also pluralizes.
        const kinds = this.reduce((agg, item) => { agg[item.kind]++; return agg }, { 'procedure': 0, 'function': 0 })

        const result = []
        switch (kinds.function) {
          case 0:
            break
          case 1:
            result.push('function')
            break
          default:
            result.push('functions')
            break
        }
        switch (kinds.procedure) {
          case 0:
            break
          case 1:
            result.push('procedure')
            break
          default:
            result.push('procedures')
            break
        }

        return result
    }
  }
}
exports.EntityGroup = EntityGroup

/**
 * @implements {Iterable<Entity[]>}
 * @implements {Diffable<EntityLookup>}
 * Collection that groups entities by name.
 */
class EntityLookup {
  /** @type {{ [name: string]: EntityGroup }} */
  #groups

  /**
   * @param {EntityGroup[]?} other
   */
  constructor(other = undefined) {
    if (other) {
      this.#groups = Object.fromEntries(other.map(value => [value.name, value]))
    } else {
      this.#groups = {}
    }
  }

  /**
   *
   * @param  {...Entity} items
   * @return {number}
   */
  push(...items) {
    for (const item of items) {
      const { name, description } = item
      const forName = this.#groups[name.value] ??= new EntityGroup(name, description)
      forName.push(item)
    }

    return items.length
  }

  /**
   * @returns {Iterator<EntityGroup>}
   */
  [Symbol.iterator]() {
    return Object.entries(this.#groups).sort((([ak], [bk]) => ak.localeCompare(bk))).map(([_, v]) => v)[Symbol.iterator]()
  }

  /**
   * @param {(value: Entity) => boolean} predicate
   */
  filter(predicate) {
    return new EntityLookup([...this].filter(group => {
      const result = group.filter(predicate)
      if (result.length === 0) {
        return undefined
      }
      const { name, description } = group
      return Object.assign(result, { name, description })
    }))
  }

  /**
   * @param {(value: Entity, index: number) => void} callbackFn
   * @param {any} thisArg
   */
  forEach(callbackFn, thisArg) {
    Object.values(this.#groups).flat().forEach(callbackFn, thisArg)
  }

  /**
   *
   * @param {EntityLookup} other
   * @returns
   */
  diff(other) {
    if (!other) {
      return { deleted: this }
    }
    return Diffable.diff(this.#groups, other.#groups)
  }
}
exports.EntityLookup = EntityLookup
