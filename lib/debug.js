// When using this ensure that the calling function sets debug.debug
const fs = require('./fs.js')
const path = require('path')

/** @implements {Console} */
class DebugConsole {
  debug = false
  #console

  #unique = new Set()

  /**
   * @param {Console} console
   */
  constructor(console = console) {
    this.#console = console
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
    this.#console.error(...data)
  }

  /**
   * @overload
   * @param {string} id A unique ID
   * @param {any} message
   * @param  {...any} optionalParams
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
    this.#console.warn(...data)
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
    this.#console.info(...data)
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
      this.#console.log(...data)
    }
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
  assert(condition, ...data) {
    this.#console.assert(condition, ...data)
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
}

exports.DebugConsole = DebugConsole

/** Singleton instance. */
exports.console = new DebugConsole(console)
