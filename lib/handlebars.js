//Overloaded Handlebars

const { Description } = require('./comment');


Handlebars = require('handlebars')

// Escaping *some* but not *all* Markdown chracters.
// @see https://github.com/mattcone/markdown-guide/blob/master/_basic-syntax/escaping-characters.md#characters-you-can-escape
const escapeRegex = /([|])/g

/**
 * @override
 * Escape in Markdown, not HTML.
 */
Handlebars.escapeExpression = function (string) {
  if (typeof string !== 'string') {
    // don't escape SafeStrings, since they're already safe
    if (string && string.toHTML) {
      return string.toHTML();
    } else if (string == null) {
      return '';
    } else if (!string) {
      return string + '';
    }

    // Force a string conversion as this will be done by the append regardless and
    // the regex test will do this transparently behind the scenes, causing issues if
    // an object's to string has escaped characters in it.
    string = '' + string;
  }

  return string.replace(escapeRegex, '\\$1')
}

Handlebars.Utils.escapeExpression = Handlebars.escapeExpression


Handlebars.registerHelper('toUpperCase', function(str) {
  if (str) {
    return str.toUpperCase();
  } else {
    return str;
  }
});

Handlebars.registerHelper('lineBreakToBr', function(str) {
  if (str) {
    return str.replace(/\n/g,'<br />');
  } else {
    return str;
  }
});

Handlebars.registerHelper('initCap', function(str) {
  if (str) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }
  else{
    return str;
  }
});

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
Handlebars.registerHelper('entityFilter', function(entityType, options) {
  var
    retEntities = []
  ;

  console.log(entityType);

  options.data.root.entities.forEach(function(entity){
    if (entity.type === 'typesBAD'){
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
  console.log(...obj)
})

module.exports = Handlebars;
