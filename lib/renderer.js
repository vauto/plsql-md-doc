// @ts-check

const { SafeString } = require("handlebars")
const { LinkTag, Tag } = require("./comment")
const { PlsqlUniqueId } = require("./plsql/name")
const console = require("./debug").child(__filename)

/**
 * @typedef {import("./comment").Content} Content
 */

// Escaping *some* but not *all* Markdown chracters.
// @see https://github.com/mattcone/markdown-guide/blob/master/_basic-syntax/escaping-characters.md#characters-you-can-escape
const escapeRegex = /([$|])/g


/**
 * Markdown renderer
 */
class ContentRenderer {


  /**
   *
   * @param {any} value v
   * @return {string} The escaped text.
   */
  escapeText(value) {
    if (typeof value !== 'string') {
      // don't escape SafeStrings, since they're already safe
      if (value instanceof SafeString) {
        return value.toHTML()
      } else if (value == null) {
        return '';
      } else if (!value) {
        // Falsy values are known to not need escaping
        return value + '';
      }

      // Force a string conversion as this will be done by the append regardless and
      // the regex test will do this transparently behind the scenes, causing issues if
      // an object's to string has escaped characters in it.
      value = '' + value;
    }

    return value.replace(escapeRegex, '\\$1')
  }

  /**
   * @param {Content} item
   * @returns {string}
   */
  #renderItem(item) {
    switch (true) {
      case item === undefined:
      case item === null:
        return ''

      case typeof item === 'string':
        return item

      case item instanceof LinkTag:
        // If the tag's content is empty, use the href as the content too.
        const text = this.render(...item.content) || item.href?.toString() || ''
        switch (true) {
          case item.href === null:
          case item.href === undefined:
            return text
          case item.href instanceof PlsqlUniqueId:
            // LATER: we need to do more link resolution here.
            return text
          default:
            return `[${text}](${item.href})`
        }

      case item instanceof Tag:
        return this.render(...item.content)
        break

      case item instanceof Array:
        return this.render(...item)
        break

      default:
        console.warnOnce(item.constructor.name, `unhandled item type: ${item.constructor.name}`, item)
        return item.toString()
    }
  }

  /**
   * @param {...Content} items
   * @yields {string}
   */
  *#doRender(...items) {
    for (const item of items) {
      yield this.#renderItem(item)
    }
  }

  /**
   * @param  {...Content} items
   * @returns {string}
   */
  render(...items) {
    return [...this.#doRender(...items)].join('').trim()
  }
}

exports.ContentRenderer = ContentRenderer
