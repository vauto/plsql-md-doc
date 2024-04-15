// @ts-check

const { SafeString } = require("handlebars")
const { LinkTag, Tag, IncludeTag } = require("./comment")
const { URL } = require("url")
const { isItemName } = require("./name")
const { ArgumentValueError, mustBeString } = require("./guards")
const { SyntaxNode, LiteralSyntaxNode } = require("./syntax")
const console = require("./debug").child(__filename)
const relativize = require('relativize-url').relativize

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

  /** @type {ItemName} */ unitName
  /** @type {URL} */ baseURL

  /**
   *
   * @param {object} options
   * @param {ItemName?} [options.unitName]
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
    if (isItemName(href)) {
      // LATER: we need to do more link resolution here.
      return null
    }
    switch (true) {
      case href === null:
      case href === undefined:
        return null

      case href instanceof URL:
        // Already resolved to a URL
        break

      default:
        // treat as strings
        if (!URL.canParse(href)) {
          // href is relative already.
          console.assert(href && href.match(/^[#?]/), 'this is probably query or fragment only')
          return href
        }
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
   * @param {string} text
   */
  #wrapCode(text) {
    // By default, wrap with one.
    let wrap = '`'
    if (text.indexOf('`') >= 0) {
      // Need to determine the longest # of backticks in the text, then wrap it with one more than is present.
      wrap += text.split(/[^`]+/).reduce((previousValue, currentValue) => currentValue.length > previousValue.length ? currentValue : previousValue, '`')
    }

    return wrap + this.escapeText(text) + wrap
  }

  /**
   * @param {string} text
   * @param {string|URL?} url URL (needed only for `auto`)
   * @param {LinkStyle} style
   * @returns {string}
   */
  #formatLinkText(text, url, style) {
    // If the style is "auto" then we want plain if it's going to be a link, but code if not.
    const /** @type {StrictLinkStyle} */ strictStyle = style === 'auto' ? (url ? 'plain' : 'code') : style
    switch (strictStyle) {
      case 'code':
        return this.#wrapCode(text)
      case 'plain':
        return this.escapeText(text)
      default:
        console.assert(false, 'Invalid style', style)
        return this.escapeText(text)
    }
  }

  /**
   * @param {string} text
   * @param {string|URL?} url A URL (may be null)
   * @param {LinkStyle} style
   * @returns {string} The formatted content.
   */
  #doRenderLink(text, url, style) {
    mustBeString(text, 'text')

    // Render as a Markdown link, but put whitespace *outside* the link.
    const match = /^(\s*)(.+?)(\s*)$/.exec(text)
    const [leading, innerText, trailing] = match.slice(1) ?? ['', text, '']

    const formattedText = this.#formatLinkText(innerText, url, style)

    // Only linkify if there is a URL.
    // LATER: we probably should return whitespace with the formatted text, but right now it's complicated.
    return url
      ? `${leading}[${formattedText}](${url})${trailing}`
      : formattedText
  }

  /**
   * @param {string | ItemName | URL} item
   * @returns {string}
   */
  #resolveText(item) {
    if (isItemName(item)) {
      return item.toString('T')
    }

    switch (true) {
      case item === undefined:
      case item === null:
        return ''

      case typeof item === 'string':
        return item

      case item instanceof URL:
        return item.toString()

      default:
        throw new ArgumentValueError('item', item, 'Value must be a string, a URL, or an ItemName.')
    }
  }

  /**
   * How to format the text based on the `@link` tag type.
   * @typedef {'code' | 'plain'} StrictLinkStyle
   * @typedef {'auto' | StrictLinkStyle} LinkStyle
   * @type {Record<string, LinkStyle>}
   */
  #linkTagStyles = {
    'link': 'auto',
    'linkcode': 'code',
    'linkplain': 'plain',
    'see': 'auto',
    'seealso': 'auto'
  };

  /**
   * @param {...Content} items
   * @yields {string}
   */
  *#doRender(...items) {
    for (const item of items) {
      if (item === undefined || item === null) {
        // Do nothing
        continue
      }

      if (typeof item === 'string') {
        yield item
        continue
      }

      if (isItemName(item)) {
        yield item.toString('T')
        continue
      }

      switch (true) {
        case item instanceof IncludeTag:
          yield* this.#doRender(...item.content)
          break

        case item instanceof LinkTag:
          const style = this.#linkTagStyles[item.kind] ?? 'auto'

          // If the tag's content is empty, use the href as the content too.
          const text = [...this.#doRender(...item.content)].join('') || this.#resolveText(item.href) || ''
          const url = this.#resolveUrl(item.href)
          yield this.#doRenderLink(text, url, style)
          break

        case item instanceof Tag:
          yield* this.#doRender(...item.content)
          break

        case item instanceof LiteralSyntaxNode:
          yield item.value
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
