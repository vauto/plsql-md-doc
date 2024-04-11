// @ts-check
class ArgumentError extends Error {
  constructor(paramName, message, innerError = undefined) {
    super(`${message}.  For parameter: ${paramName}`, innerError)
    this.paramName = paramName
  }
}
exports.ArgumentError = ArgumentError

class InvalidNumberOfArgumentsError extends Error {

  /**
   * @param {any[] | IArguments} args
   * @param {string?} message
   * @param {Error?} innerError
   */
  constructor(args, message = undefined, innerError = undefined) {
    const baseMessage = `Invalid number of arguments: ${args.length}`
    const superMessage = message ? `${baseMessage}. ${message}` : baseMessage
    super(superMessage, innerError)
  }
}
exports.InvalidNumberOfArgumentsError = InvalidNumberOfArgumentsError

class ArgumentValueError extends ArgumentError {
  constructor(paramName, value, message, innerError = undefined) {
    super(paramName, `${message}\nFor value: ${value}`, innerError)
    this.value = value
  }
}
exports.ArgumentValueError = ArgumentValueError

// --------------


/**
 * Verifies the given parameter is an instance of the given type.
 * @template {Number | String} TValue
 * @param {TValue} value
 * @param {TValue} expectedValue
 * @param {string} paramName
 * @returns {asserts value is TValue}
 */
const mustBeGreaterThanOrEqualTo = (value, expectedValue, paramName = 'value') => {
  if (value > expectedValue) return

  throw new ArgumentValueError(paramName, value, `Value must greater than or equal to ${expectedValue}.`)
}
exports.mustBeGreaterThanOrEqualTo = mustBeGreaterThanOrEqualTo

const getTypeSummary = (value) => {
  switch (typeof value) {
    case 'undefined':
      return 'undefined'
    case 'object':
      return value !== null ? `an instance of type ${value.constructor.name}` : 'null'
    default:
      return `a value of type ${typeof value}`
  }
}

/**
 * Verifies the given parameter is an instance of the given type.
 * @template TValue
 * @param {new(...any) => TValue} type The type of which `value` must e an instance.
 * @param {any} value
 * @param {string} paramName
 * @returns {asserts value is TValue} {@link value}
 */
const mustBeInstanceOf = (value, type, paramName = 'value') => {
  if (!(value instanceof type)) {
    throw new ArgumentValueError(paramName, value, `Value must be an instance of type ${type.name}, but is ${getTypeSummary(value)}.`)
  }
}
exports.mustBeInstanceOf = mustBeInstanceOf

/**
 * Verifies the given parameter is an instance of the given type.
 * @template TValue
 * @param {any} value
 * @param {string} paramName
 * @param {...new(...any) => TValue} types The type of which `value` must e an instance.
 * @returns {asserts value is TValue} {@link value}
 */
const mustBeInstanceOfAny = (value, paramName = 'value', ...types) => {
  if (!types.some(type => value instanceof type)) {
    throw new ArgumentValueError(paramName, value, `Value must be an instance of one of the following: ${types.join(', ')}, but is ${getTypeSummary(value)}.`)
  }
}
exports.mustBeInstanceOfAny = mustBeInstanceOfAny

/**
 * @param {any} value
 * @param {string} paramName
 * @returns {string}
 */
const mustBeString = (value, paramName = 'value') => {
  if (typeof value === 'string') return value
  throw new ArgumentValueError(paramName, value, 'Value must be a string.')
}
exports.mustBeString = mustBeString

/**
 * @param {any} value
 * @param {string} paramName
 * @returns {string}
 */
const mustBeNonEmptyString = (value, paramName = 'value') => {
  if (typeof value === 'string' && value.length > 0) return value
  throw new ArgumentValueError(paramName, value, 'Value must be a non-empty string.')
}
exports.mustBeNonEmptyString = mustBeNonEmptyString

/**
 * @param {any} value
 * @param {string} paramName
 * @returns {Array}
 */
const mustBeArray = (value, paramName = 'value') => {
  if (Array.isArray(value)) return value
  throw new ArgumentValueError(paramName, value, 'Value must be an Array.')
}
exports.mustBeArray = mustBeArray

/**
 * @param {any} value
 * @param {string} paramName
 * @returns {Array}
 */
const mustBeNonEmptyArray = (value, paramName = 'value') => {
  if (Array.isArray(value) && value.length > 0) return value
  throw new ArgumentValueError(paramName, value, 'Value must be a non-empty Array.')
}
exports.mustBeNonEmptyArray = mustBeNonEmptyArray

/**
 * Verifies the given parameter is a non-null {@link Object}.
 * @param {string} paramName
 * @param {Object} value
 * @returns {Object} {@link value}
 */
const mustBeObject = (value, paramName = 'value') => {
  if (typeof value !== 'object' || value === null) throw new ArgumentValueError(paramName, value, 'Value must be a non-null Object.')
  return value
}
exports.mustBeObject = mustBeObject

/**
 * Verifies the given parameter is a finite {@link Number}.
 * @param {Number} value
 * @param {string} paramName
 * @returns {Number} {@link value}
 */
const mustBePositiveInteger = (value, paramName = 'value') => {
  if (!Number.isInteger(value) || value <= 0) throw new ArgumentValueError(paramName, value, 'Value must be an integer.')
  return value
}
exports.mustBePositiveInteger = mustBePositiveInteger
