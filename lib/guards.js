class ArgumentError extends Error {
  constructor(paramName, message, innerError = undefined) {
    super(`${message}.  For parameter: ${paramName}`, innerError)
    this.paramName = paramName
  }
}
exports.ArgumentError = ArgumentError

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
 * @template TValue
 * @param {string} paramName
 * @param {Type<TValue>} type
 * @param {Object} value
 * @returns {TValue} {@link value}
 */
const mustBeInstanceOf = (value, type, paramName = 'value') => {
  if (!(value instanceof type)) throw new ArgumentValueError(paramName, value, `Value must be an instance of type ${type}.`)
  return value
}
exports.mustBeInstanceOf = mustBeInstanceOf

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

