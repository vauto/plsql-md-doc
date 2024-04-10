//Overloaded Handlebars

const console = require('./debug').child(__filename)
const { SafeString } = require('handlebars');
const { slug } = require('./github-slugger') // LATER: use real github-slugger post-ESM conversion
const { Description, LinkTag } = require('./comment');
const { ContentRenderer } = require('./renderer');
const { Entity, EntityGroup } = require('./entity');

/**
 * @typedef {import('./comment').Content} Content
 * @typedef {import('handlebars').RuntimeOptions} RuntimeOptions
 */


Handlebars = require('handlebars')

// Escaping *some* but not *all* Markdown chracters.
// @see https://github.com/mattcone/markdown-guide/blob/master/_basic-syntax/escaping-characters.md#characters-you-can-escape
const escapeRegex = /([$|])/g

/**
 * @override
 * Escape in Markdown, not HTML.
 */
Handlebars.escapeExpression = (value) => {
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

Handlebars.Utils.escapeExpression = Handlebars.escapeExpression


Handlebars.registerHelper('toUpperCase', function (str) {
  if (str) {
    return str.toUpperCase();
  } else {
    return str;
  }
});

Handlebars.registerHelper('lineBreakToBr', function (str) {
  if (str) {
    return str.replace(/\r?\n|\r|\n/g, '<br />');
  } else {
    return str;
  }
});

Handlebars.registerHelper('initCap', function (str) {
  if (str) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }
  else {
    return str;
  }
});

/**
 * String concatenation
 * @param {...string} args
 * @param {RuntimeOptions} options
 * @returns {string}
 */
const concat = (...args) => {
  args.pop()
  return args.join('')
}
Handlebars.registerHelper('concat', concat)

/**
 * @param {string | Array<string>} kind
 * @return {string}
 */
const formatKind = (kind) => {
  if (Array.isArray(kind)) {
    // ASSUMPTION: at most 2 kinds
    return kind.map(formatKind).join(' and ')
  }

  if (typeof kind === 'string') {
    return kind.toLowerCase().replaceAll(/\b([a-z])/g, letter => letter.toUpperCase())
  }

  // ???
  return kind?.toString()
}

Handlebars.registerHelper('formatKind', formatKind);

// From http://stackoverflow.com/questions/8853396/logical-operator-in-a-handlebars-js-if-conditional
Handlebars.registerHelper('ifCond', function (v1, operator, v2, options) {
  switch (operator) {
    case '==':
      return (v1 == v2) ? options.fn(this) : options.inverse(this);
    case '===':
      return (v1 === v2) ? options.fn(this) : options.inverse(this);
    case '<':
      return (v1 < v2) ? options.fn(this) : options.inverse(this);
    case '<=':
      return (v1 <= v2) ? options.fn(this) : options.inverse(this);
    case '>':
      return (v1 > v2) ? options.fn(this) : options.inverse(this);
    case '>=':
      return (v1 >= v2) ? options.fn(this) : options.inverse(this);
    case '&&':
      return (v1 && v2) ? options.fn(this) : options.inverse(this);
    case '||':
      return (v1 || v2) ? options.fn(this) : options.inverse(this);
    default:
      return options.inverse(this);
  }
});


// TODO mdsouza: create functions for getTypes, getMethods, getConstants
// TODO mdsouza: delete
Handlebars.registerHelper('entityFilter', function (entityType, options) {
  var
    retEntities = []
    ;

  console.log(entityType);

  options.data.root.entities.forEach(function (entity) {
    if (entity.type === 'typesBAD') {
      retEntities.push(entity);
    }
  });//entities.forEach

  console.log(retEntities);

  return options.fn(retEntities);
});


Handlebars.registerHelper('normalizeSpace', function (value, options) {
  if (typeof value !== 'string') {
    switch (true) {
      case value === null:
      case value === undefined:
        return ''
      case value instanceof Description:
        value = value.full
        break
      default:
        const /** @type {ContentRenderer} */ renderer = options.data.renderer
        value = renderer.render(value)
        break
    }
  }

  return value?.replace(/\s+/g, ' ').trim()
})

Handlebars.registerHelper('filterNonPrivate', function (array, options) {
  return array?.filter(a => !a.isPrivate)
})

Handlebars.registerHelper('dump', function (...obj) {
  const options = obj.pop()
  console.info(...obj)
})


Handlebars.registerHelper('renderLink',
  /** @param {string|LinkTag?} link */
  function (link) {
    if (!link) {
      // empty
      return ''
    }

    if (link instanceof LinkTag) {
      const /** @type {ContentRenderer} */ renderer = this.data.renderer
      return renderer.render(link)
    }

    console.assert(typeof link === 'string', 'not a string or LinkTag', link)
    return link
  }
)

Handlebars.registerHelper('slug', (...text) => {
  const options = text.pop()
  return slug(text.join(' '));
})

/**
 * @param {Content} text
 * @param {Content} href
 * @param {RuntimeOptions} options
 * @returns
 */
const link = (text, href, options) => {
  const renderer = options.data.renderer

  href ??= text
  text ??= href

  return `[${renderer.render(text)}](${renderer.render(href)})`
}

Handlebars.registerHelper('link', link)

/**
 *
 * @param {string} text
 * @param {RuntimeOptions} options
 */
const slugLink = (text, options) => {
  return link(text, `#${slug(text)}`, options)
}
Handlebars.registerHelper('slugLink', slugLink)

module.exports = Handlebars;
