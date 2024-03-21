// When using this ensure that the calling function sets debug.debug
const fs = require('./fs.js')
const path = require('path')

// ASSUMPTION: lib/debug.js is one under the app root, and all meaningful code is under lib.
const rootDirectory = __dirname

/** @implements {Console} */
class DebugConsole {
  debug = false
  #console
  #category

  #unique = new Set()

  /**
   * @param {Console} console
   */
  constructor(console = console, category = '') {
    this.#console = console
    this.#category = category
  }

  /** The text to output if we have a category  */
  get #categoryText() {
    return this.#category ? `[${this.#category}]` : ''
  }

  #folderPath = path.resolve(__dirname, '../debug')

  /**
   * @overload
   * @param {any} message
   * @param  {...any} optionalParams
   * @overload
   * @param {...any} data
   * @see {@link Console.error}
   */
  error(...data) {
    this.#console.error(this.#categoryText, ...data)
  }

  /**
   * @overload
   * @param {string} id A unique ID
   * @param {any} message
   * @param  {...any} optionalParams
   * @overload
   * @param {string} id A unique ID
   * @param {...any} data
   */
  warnOnce(id, ...data) {
    if (this.#unique.has(id)) {
      return
    }

    this.#unique.add(id)
    this.warn(...data)
  }

  /**
   * @overload
   * @param {any} message
   * @param  {...any} optionalParams
   * @overload
   * @param {...any} data
   * @see {@link Console.warn}
   */
  warn(...data) {
    this.#console.warn(this.#categoryText, ...data)
  }

  /**
   * @overload
   * @param {any} message
   * @param  {...any} optionalParams
   * @overload
   * @param {...any} data
   * @see {@link Console.info}
   */
  info(...data) {
    this.#console.info(this.#categoryText, ...data)
  }

  /**
   * @overload
   * @param {string} id A unique ID
   * @param {any} message
   * @param  {...any} optionalParams
   * @overload
   * @param {string} id A unique ID
   * @param {...any} data
   */
  infoOnce(id, ...data) {
    if (this.#unique.has(id)) {
      return
    }

    this.#unique.add(id)
    this.info(...data)
  }

  /**
   * @overload
   * @param {any} message
   * @param  {...any} optionalParams
   * @overload
   * @param {...any} data
   * @see {@link Console.info}
   */
  log(...data) {
    if (this.debug) {
      this.#console.log(this.#categoryText, ...data)
    }
  }

  /**
   * @overload
   * @param {string} id A unique ID
   * @param {any} message
   * @param  {...any} optionalParams
   * @overload
   * @param {string} id A unique ID
   * @param {...any} data
   */
  logOnce(id, ...data) {
    if (this.#unique.has(id)) {
      return
    }

    this.#unique.add(id)
    this.log(...data)
  }

  /**
   * @overload
   * @param {any} value
   * @param {string?} message
   * @param  {...any} optionalParams
   * @overload
   * @param {boolean?} condition
   * @param {...any} data
   * @see {@link Console.assert}
   */
  assert(condition, message = 'Assertion failed', ...optionalParams) {
    this.#console.assert(condition, this.#categoryText, message, ...optionalParams)
  }

  /**
   * @overload
   * @param {string} id A unique ID
   * @param {any} value
   * @param {string?} message
   * @param  {...any} optionalParams
   * @overload
   * @param {string} id A unique ID
   * @param {boolean?} condition
   * @param {...any} data
   */
  assertOnce(id, condition, ...data) {
    if (this.#unique.has(id)) {
      return
    }

    this.#unique.add(id)
    this.assert(condition, ...data)
  }

  /**
   * @param {string} fileName
   * @param {string | NodeJS.ArrayBufferView} fileContent
   */
  logFile(fileName, fileContent) {
    fs.writeFileSync(path.resolve(this.#folderPath, fileName), fileContent);
  }

  setup() {
    if (this.debug) {
      fs.emptyDirSync(this.#folderPath);
    }
  }

  /**
   * Mark these IDs as seen.
   * @param  {...string} ids  Any IDs to mark as "seen" unconditionally
   * @see {@link warnOnce}
   * @see {@link assertOnce}
   */
  setAsSeen(...ids) {
    for (const id of ids) {
      this.#unique.add(id)
    }
  }

  #normalizeCategory(category) {
    if (!path.isAbsolute(category)) {
      // probably not intended to be a filename
      return category
    }

    const relativePath = path.relative(rootDirectory, category)
    return relativePath.substring(0, relativePath.length - path.extname(relativePath).length).replace(/[\\/]/g, '.')
  }

  /**
   * @param {string} category The category to use. If a filename is used (e.g. `__filename`), it will be parsed relative to app root.
   * @returns  {DebugConsole} A child instance
   */
  child(category) {
    return new DebugConsole(this.#console, this.#normalizeCategory(category))
  }
}

/** Singleton root instance. */
const root = new DebugConsole(console)

module.exports = root
module.exports.root = root
module.exports.DebugConsole = DebugConsole
