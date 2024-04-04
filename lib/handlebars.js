//Overloaded Handlebars

const console = require('./debug').child(__filename)
const { Description, LinkTag } = require('./comment');
const { ContentRenderer } = require('./renderer');

/**
 * @typedef {import('./comment').Content} Content
 */


Handlebars = require('handlebars')

const renderer = new ContentRenderer()

/**
 * @override
 * Escape in Markdown, not HTML.
 */
Handlebars.escapeExpression = renderer.escapeText.bind(renderer)

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


Handlebars.registerHelper('normalizeSpace', function (value) {
  const str = value instanceof Description ? value.full : value ?? ''
  if (str) {
    return str.replace(/\s+/g, ' ').trim()
  } else {
    return str;
  }
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
      return renderer.render(link)
    }

    console.assert(typeof link === 'string', 'not a string or LinkTag', link)
    return link
  }
)

module.exports = Handlebars;
