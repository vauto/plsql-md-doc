// @ts-check

const { SafeString } = require("handlebars")
const { LinkTag, Tag, IncludeTag } = require("./comment")
const { PlsqlUniqueId, PlsqlUnitName } = require("./plsql/name")
const { URL } = require("url")
const { isItemName, Identifier } = require("./name")
const { ArgumentValueError } = require("./guards")
const { SyntaxNode } = require("./syntax")
const console = require("./debug").child(__filename)
const  relativize = require('relativize-url').relativize

/**
 * @typedef {import("./comment").Content} Content
 * @typedef {import("./comment").ContentItem} ContentItem
 * @typedef {import("./name").ItemName} ItemName
 */

// Escaping *some* but not *all* Markdown chracters.
// @see https://github.com/mattcone/markdown-guide/blob/master/_basic-syntax/escaping-characters.md#characters-you-can-escape
const escapeRegex = /([$|])/g


/**
 * Markdown renderer
 */
class ContentRenderer {

  /** @type {PlsqlUnitName} */ unitName
  /** @type {URL} */ baseURL

  /**
   *
   * @param {object} options
   * @param {PlsqlUnitName?} [options.unitName]
   * @param {URL} options.baseURL
   */
  constructor({ unitName = null, baseURL }) {
    this.unitName = unitName
    this.baseURL = baseURL
  }


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
   * @param {string | URL | ItemName?} href
   * @return {string?}
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
        break

      default:
        // treat as strings
        try {
          href = new URL(href.toString())
        } catch {
          return null
        }
        break
    }

    return relativize(href, this.baseURL)
  }

  /**
   *
   * @param {string} text
   * @param {string|URL} url
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
   * @param {string | ItemName | URL} item
   * @returns {string}
   */
  #resolveText(item) {
    switch (true) {
      case item === undefined:
      case item === null:
        return ''

      case typeof item === 'string':
        return item

      case item instanceof URL:
        return item.toString()

      case isItemName(item):
        return item.toString('T')

      default:
        throw new ArgumentValueError('item', item, 'Value must be a string, a URL, or an ItemName.')
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

        case item instanceof IncludeTag:
          yield* this.#doRender(...item.content)
          break

        case item instanceof LinkTag:
          // If the tag's content is empty, use the href as the content too.
          const text = [...this.#doRender(...item.content)].join('') || this.#resolveText(item.href) || ''
          const url = this.#resolveUrl(item.href)
          yield url ? this.#doRenderLink(text, url) : text.trimStart() // HACK
          break

        case item instanceof Tag:
          yield* this.#doRender(...item.content)
          break

        case item instanceof SyntaxNode:
          yield item.toStructuredString('T') // FIXME
          break

        case item instanceof Array:
          yield* this.#doRender(...item)
          break

        case item instanceof URL:
          yield item.toString()
          break

        case isItemName(item):
          yield item.toString('T')
          break

        default:
          // @ts-expect-error
          console.assert(false, item.constructor.name, `unhandled item type: ${item.constructor.name}`, item)
          // @ts-expect-error
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
