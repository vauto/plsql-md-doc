// @ts-check

const { SafeString } = require("handlebars")
const { LinkTag, Tag } = require("./comment")
const { PlsqlUniqueId } = require("./plsql/name")
const { URL } = require("url")
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
   *
   * @param {string | URL | import("./name").ItemName?} href
   * @return {URL?}
   */
  #resolveUrl(href) {
    switch (true) {
      case href === null:
      case href === undefined:
        return null

      case href instanceof PlsqlUniqueId:
        // LATER: we need to do more link resolution here.
        return null

      case href instanceof URL:
        // Already resolved to a URL
        return href

      default:
        return URL.canParse(href.toString()) ? new URL(href) : null
    }
  }

  /**
   *
   * @param {string} text
   * @param {URL} url
   */
  #doRenderLink(text, url) {

    const match = /^(\s*)(.+?)(\s*)$/.exec(text)
    if (match) {
      // Render as a Markdown link, but put whitespace *outside* the link.
      const [_, leading, innerText, trailing] = match
      return `${leading}[${this.escapeText(innerText)}](${url})${trailing}`
    } else {
      // Don't need to trim
      return `[${this.escapeText(text)}](${url})`
    }
  }

  /**
   * @param {...Content} items
   * @yields {string}
   */
  *#doRender(...items) {
    for (const item of items) {
      switch (true) {
        case item === undefined:
        case item === null:
          // Do nothing
          break

        case typeof item === 'string':
          yield item
          break

        case item instanceof LinkTag:
          // If the tag's content is empty, use the href as the content too.
          const text = [...this.#doRender(...item.content)].join('') || item.href?.toString() || ''
          const url = this.#resolveUrl(item.href)
          yield url ? this.#doRenderLink(text, url) : text
          break

        case item instanceof Tag:
          yield* this.#doRender(...item.content)
          break

        case item instanceof Array:
          yield* this.#doRender(...item)
          break

        default:
          console.warnOnce(item.constructor.name, `unhandled item type: ${item.constructor.name}`, item)
          yield item.toString()
          break
      }
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