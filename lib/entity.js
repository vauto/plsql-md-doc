// @ts-check
const console = require('./debug').child(__filename)
const { Description, CodeContext, Comment, LinkTag, IncludeTag } = require('./comment.js');
const { mustBeInstanceOf, mustBeObject, mustBeInstanceOfAny, ArgumentValueError, InvalidNumberOfArgumentsError } = require('./guards');
const { Identifier } = require('./name.js');
const { PlsqlUnitName } = require('./plsql/name');
const { TextSpan } = require('./position');
const { Annotation } = require('./syntax');
/**
 * @typedef {import('./comment').CodeContextLike} CodeContextLike
 * @typedef {import("./config").Options} Options
 * @typedef {import('./name').ItemName} ItemName
 */

/**
 * @typedef {{[key: string]: {added?: any?, changed?: any?, deleted?: any?}}} DiffResult
 *
 * @typedef AnnotationInfo
 * @property {string} name
 * @property {string?} message
 *
 * @typedef ExampleInfo
 * @property {Number} number
 * @property {Description?} description
 *
 * @typedef ExceptionInfo
 * @property {string} name
 * @property {Description?} description
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
 * Represents a PL/SQL code entity.
 */
class Entity {
  /** @type {string} */ kind
  /** @type {Identifier} */ name
  /** @type {TextSpan} */ textSpan

  /** @type {Description?} */ description
  /** @type {Entity[]} */ types = []
  /** @type {Entity[]} */ constants = []
  /** @type {EntityLookup} */ methods = new EntityLookup()
  /** @type {Entity[]} */ variables = []
  /** @type {Entity[]} */ exceptions = []
  /** @type {string[]} */ files = []

  //--------- BEGIN STUFF FROM CodeContext I need to sort out
  /** @type {string?} */ type
  /** @type {string?} */ typeKind
  /** @type {string?} */ signature
  /** @type {string?} */ mode
  /** @type {string?} */ specification
  /** @type {string[]?} */ unitModifiers
  /** @type {string?} */ defaultExpression
  /** @type {string?} */ defaultValue
  /** @type {string?} */ message
  /** @type {Entity[]?} Record fields */ fields
  /** @type {boolean?} */ optional
  /** @type {string?} */ baseType
  //--------- END   STUFF FROM CodeContext

  /** @type {string} */ visibility = 'public' // default visibility
  /** @type {Entity[]} */ params = []
  /** @type {Entity?} */ return
  /** @type {ExceptionInfo[]} */ throws = []
  /** @type {ExampleInfo[]} */ examples = []
  /** @type {string?} */ author
  /** @type {string?} */ created
  /** @type {string?} */ code
  /** @type {string?} */ since
  /** @type {Array} */ issues = []
  /** @type {LinkTag[]} */ links = []
  /** @type {IncludeTag[]} */ includes = []
  /** @type {AnnotationInfo[]} Annotations from doc comments and pragmas */
  annotations = []
  /** @type {string[]} */ remarks = []


  /** @type {Entity?} */ parent
  /** @type {string?} */ id
  /** @type {string?} */ header

  /**
   * @param {Comment?} [comment]
   */
  constructor(comment = undefined) {
    if (comment) {
      mustBeInstanceOf(comment, Comment, 'comment')
      mustBeInstanceOf(comment.context, CodeContext, 'comment.context')

      this.context = comment.context

      this.kind = comment.context.kind
      this.name = comment.context.name
      this.textSpan = comment.textSpan
      for (const k of Object.keys(comment.context)) {
        if (!(k in this)) {
          console.warnOnce(k, 'will lose context key', k)
        }
      }

      Object.assign(this, comment.context, { parent: this.parent }) // preserve EXISTING parent.
    }
  }

  /** @type {CodeContext} */
  context

  static #uniqueId = 0

  get isPrivate() { return this.visibility === 'private' }

  get path() {
    const id = this.id || `${this.kind}-${++Entity.#uniqueId}`
    if (this.parent) {
      return `${this.parent.path}.${id}`
    } else {
      return id
    }
  }

  /** @type {AnnotationInfo?} Explicit deprecated node for use in templates, since iterating through "just some" templates is hard */
  get deprecated() {
    return this.annotations.find(a => a.name === 'deprecated')
  }

}
exports.Entity = Entity

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
   * @param {...Entity} items
   */
  remove(...items) {
    for (const item of items) {
      const name = item.name
      const forName = this.#groups[name.value]
      if (forName) {
        const index = forName.indexOf(item)
        if (index >= 0) {
          forName.splice(index, 1)
        }
      }
    }
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


/**
 * @implements {Diffable<UnitEntity>}
 */
class UnitEntity extends Entity {
  // @ts-expect-error ts2612
  /** @type {PlsqlUnitName} @override */ name
  /** @type {string?} */ projectDispName
  /** @type {string} */ docFileName

  /**
   * @param {Entity} entity
   */
  constructor(entity) {
    mustBeInstanceOf(entity, Entity, 'entity')
    mustBeInstanceOf(entity.name, PlsqlUnitName, 'entity.name')
    super()
    Object.assign(this, entity)
    console.assert(this.name === entity.name, 'whyyy')
    // MSCRAP: Deal with TS2612
    this.name = entity.name
  }

  /**
   * Sort all members of this type.
   */
  sort() {
    this.types.sort((a, b) => a.name.localeCompare(b.name))
    this.constants.sort((a, b) => a.name.localeCompare(b.name))
    // methods: these sort automatically
    this.variables.sort((a, b) => a.name.localeCompare(b.name))
    this.exceptions.sort((a, b) => a.name.localeCompare(b.name))
  }

  /**
   * @param {Options} options
   * @returns {UnitEntity} a filtered instance
   */
  filter(options) {
    mustBeObject(options, 'options')

    /**
     * @typedef {(value: Entity) => boolean} EntityFilterDelegate
     * @type {EntityFilterDelegate[]}
     */
    const filters = []
    if (!options.includePrivateMembers) {
      filters.push(entity => entity.visibility !== "private")
    }

    if (filters.length === 0) {
      // nothing to filter
      return this
    }

    /**
     *
     * @param {Entity} entity
     * @returns {boolean}
     */
    const entityFilterLambda = entity => filters.every(filter => filter(entity))

    /** @param {EntityGroup} group @return {EntityGroup} */
    // const entityGroupFilterLambda = group => group.filter(entityFilterLambda)

    const clone = new UnitEntity(this)

    clone.constants = clone.constants.filter(entityFilterLambda)
    clone.exceptions = clone.exceptions.filter(entityFilterLambda)
    clone.methods = clone.methods.filter(entityFilterLambda)
    clone.types = clone.types.filter(entityFilterLambda)
    clone.variables = clone.variables.filter(entityFilterLambda)

    return clone
  }

  /**
   *
   * @param {UnitEntity} other
   * @returns {DiffResult}
   */
  diff(other) {
    return Diffable.diff(this, other)
  }

  /**
   * @param {UnitEntity} other
   */
  merge(other) {
    this.constants.push(...other.constants);
    this.types.push(...other.types);
    this.variables.push(...other.variables);
    this.exceptions.push(...other.exceptions);

    for (const method of this.methods) {
      const toRemove = []
      for (const relatedMethod of other.methods) {
        if (method.name === relatedMethod.name) {
          console.log('Deleting common method:', method.name);
          toRemove.push(relatedMethod)
        }
      }

      // @ts-expect-error
      other.methods.remove(...toRemove)
    }

    // @ts-expect-error
    other.methods.push(...this.methods)

  }
}
exports.UnitEntity = UnitEntity
