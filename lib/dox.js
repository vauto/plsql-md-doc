/*!
 * Module dependencies.
 */
const debug = require('./debug');
const { Comment, Position, Span, Token } = require('./model')

const markdown = require('markdown-it')({
  html: true,
  xhtmlOut: true,
  breaks: true,
  langPrefix: 'lang-'
});

// PL/SQL fork of dox

/**
 * Expose api.
 */

// exports.api = require('dox/api');

/**
 * 
 * @param {string} js 
 * @param {object} options 
 * @returns {Generator<Token>}
 */
exports.parseTokens = function* (js, options) {
  options = options || {};
  js = js.replace(/\r\n/gm, '\n');

  let len = js.length,
      pos = new Position(),
      start = pos.clone()

  /**
   * @param {TokenType} priorType 
   * @returns {Token}
   */
  const emitPriorToken = (priorType) => {
    const end = pos.clone()

    const token = new Token({ type: 'code', text: js.substring(start.position, end.position), start, end, filename: options.path })

    start = end
    return token
  }

  /**
   * @param {TokenType} priorType 
   * @param {integer} endIndex
   * @param {string?} error
   * @returns {Token}
   */
  const emitCurrentToken = (type, endIndex, error = undefined) => {
    const text = js.substring(start, endIndex)

    pos.advance(text)
    console.assert(pos == endIndex, 'ooOOOps')

    const end = pos.clone()
    const token = new Token({ type, text, start, end, error, filename: options.path })
    start = end

    return token
  }

  SCAN:
  while (pos < len) {
    switch (js[pos.position]) {
      case '/':
        if (js[pos + 1] === '*') {
          // Multiline comment detected.
          // Emit previous token (as code)
          if (start.position < pos.position) {
            yield emitPriorToken('mcomment')
          }

          // Scan to end of comment or EOF
          console.assert(start.equals(pos), `start ${start} != pos ${pos}`)
          let endIndex = js.indexOf('*/', start.position + 2)
          if (endIndex >= 0) {
            endIndex += 2 // include '*/'
            yield emitCurrentToken('mcomment', endIndex)
            continue SCAN
          } else {
            // EOF
            yield emitCurrentToken('mcomment', len, 'unterminated comment')
            break SCAN
          }
        }
        // Some other slash: fall through.
        break
      
      case '-':
        if (js[pos + 1] === '-') {
          // Single comment detected.
          // Emit previous token (as code)
          if (start < pos) {
            yield emitPriorToken('scomment')
          }

          // Scan to EOL/EOF.
          let endIndex = js.indexOf('\n', start.position + 2)
          if (endIndex >= 0) {
            endIndex++ // include EOL
            yield emitCurrentToken('scomment', endIndex)
            continue SCAN
          } else {
            // EOF (not an error here)
            yield emitCurrentToken('scomment', len)
            break SCAN
          }
        }
        // Some other hyphen: fall through.
        break

      case '\'': // simple single-quoted string
        // Emit previous token (as code)
        if (start < pos) {
          yield emitPriorToken('string')
        }

        const quote = js[start.position]

        // Scan for closing quote or EOF
        let endIndex = pos + 1 // skip opening quote.
        while (endIndex < len) {
          endIndex = js.indexOf(quote, endIndex)

          if (endIndex < 0) {
            yield emitCurrentToken('string', len, 'unterminated string')
            break SCAN
          }

          if (js[endIndex - 1] === '\\') {
            // Quote is escaped.  Skip.
            continue
          }

          // Quote is NOT escaped.  Advance the marker and exit.
          endIndex++
          yield emitCurrentToken('string', endIndex)
          continue SCAN
        }

      case '\n':
        // Newline
        pos.newLine()
        continue SCAN
    }

    // default behavior
    pos.increment()
  }


  // there is no trailing.
  // // trailing code. T
  // yield { text: js.substring(start), type: 'code' };

  console.assert(pos.position === js.length, 'oops end len')
};

/**
 * Parse comments in the given string of `js`.
 *
 * @generator
 * @param {String} js
 * @param {Object} options
 * @see exports.parseComment
 * @api public
 */

exports.parseComments = function* (js, options) {
  options = options || {};
  js = js.replace(/\r\n/gm, '\n');

  let /** @type {Token[]} */ prevTokens = [];
  let /** @type {Comment?} */ prevComment = null
  var skipSingleStar = options.skipSingleStar
    , linterPrefixes = options.skipPrefixes || ['jslint', 'jshint', 'eshint']
    , skipPattern = new RegExp('^' + (options.raw ? '' : '<p>') + '(' + linterPrefixes.join('|') + ')')
    , parentContext;

  for (const token of exports.parseTokens(js, options)) {
    debug.log('token', token.type, token.start, token.end, token.text.substring(0, 60).replace(/\n/g, '\\n') + '...')
    switch (token.type) {
      case 'mcomment':
        if (skipSingleStar && (token.text.length === 4 || token.text[2] !== '*')) {
          // Plain multi-line comment.  Continue on.
          debug.log('--> is plain mcomment')
          prevTokens.push(token)
          break
        }

        // Doc comment
        debug.log('--> is doc comment')

        // Flush any code following the last comment
        if (prevTokens.length && prevComment) {
          prevComment.codeStart = token.start.line
          for (const prevToken of prevTokens) {
            prevComment.code.push(prevToken)
          }

          for (const token of prevComment.code) {
            prevComment.ctx = exports.parseCodeContext(token, parentContext);

            if (prevComment.isConstructor && prevComment.ctx) {
              prevComment.ctx.type = "constructor";
            }

            // starting a new namespace
            if (prevComment.ctx && (prevComment.ctx.type === 'prototype' || prevComment.ctx.type === 'class')) {
              parentContext = prevComment.ctx;
            }
            // reasons to clear the namespace
            // new property/method in a different constructor
            else if (!parentContext || !prevComment.ctx || !prevComment.ctx.constructor || !parentContext.constructor || parentContext.constructor !== prevComment.ctx.constructor) {
              parentContext = null;
            }
          }

          prevTokens = []
        }

        // Strip " * " from the comments, e.g.
        // /**
        //  * foo
        //  */
        // should yield "foo" and not "* foo".
        const comment = exports.parseComment(token.text.replace(/^[ \t]*\* ?/gm, ''), options);
        comment.ignore = token.text[2] === '!'; // ignore "/*!" (but not "/**!", apparently)
        comment.line = token.start.line;
        comment.codeStart = token.end.line
        if (!comment.description.full.match(skipPattern)) {
          yield comment
          prevComment = comment
        }
        break;

      default:
        prevTokens.push(token)
        break;
    }
  }

  // trailing code
  if (prevTokens.length) {
    const comment = prevComment ?? new Comment({ line: prevTokens[0].start.line });
    debug.log('phantom comment', comment)

    for (const prevToken of prevTokens) {
      comment.code.push(prevToken)
    }

    for (const token of comment.code) {
      comment.ctx = exports.parseCodeContext(token, parentContext);

      if (comment.isConstructor && comment.ctx) {
        comment.ctx.type = "constructor";
      }

      // starting a new namespace
      if (comment.ctx && (comment.ctx.type === 'prototype' || comment.ctx.type === 'class')) {
        parentContext = comment.ctx;
      }
      // reasons to clear the namespace
      // new property/method in a different constructor
      else if (!parentContext || !comment.ctx || !comment.ctx.constructor || !parentContext.constructor || parentContext.constructor !== comment.ctx.constructor) {
        parentContext = null;
      }

      if (comment !== comment) {
        yield comment
        prevComment = comment
      }
    }
  }
};

/**
 * Parse the given comment `str`.
 *
 * @param {String} str
 * @param {Object} options
 * @return {Comment}
 * @see exports.parseTag
 * @api public
 */

exports.parseComment = function (str, options) {
  str = str.trim();
  options = options || {};

  var comment = new Comment()
    , raw = options.raw
    , description = {}
    , tags = str.split(/\n\s*@/);

  // A comment has no description
  if (tags[0].charAt(0) === '@') {
    tags.unshift('');
  }

  // parse comment body
  description.full = tags[0];
  description.summary = description.full.split('\n\n')[0];
  description.body = description.full.split('\n\n').slice(1).join('\n\n');
  comment.description = description;

  // parse tags
  if (tags.length) {
    comment.tags = tags.slice(1).map(exports.parseTag);
    comment.isPrivate = comment.tags.some(function (tag) {
      return 'private' == tag.visibility;
    });
    comment.isConstructor = comment.tags.some(function (tag) {
      return 'constructor' == tag.type || 'augments' == tag.type;
    });
    comment.isClass = comment.tags.some(function (tag) {
      return 'class' == tag.type;
    });
    comment.isEvent = comment.tags.some(function (tag) {
      return 'event' == tag.type;
    });

    if (!description.full || !description.full.trim()) {
      comment.tags.some(function (tag) {
        if ('description' == tag.type) {
          description.full = tag.full;
          description.summary = tag.summary;
          description.body = tag.body;
          return true;
        }
      });
    }
  }

  // markdown
  if (!raw) {
    description.full = markdown.render(description.full).trim();
    description.summary = markdown.render(description.summary).trim();
    description.body = markdown.render(description.body).trim();
    comment.tags.forEach(function (tag) {
      if (tag.description) tag.description = markdown.render(tag.description).trim();
      else tag.html = markdown.render(tag.string).trim();
    });
  }

  return comment;
};

//TODO: Find a smarter way to do this
/**
 * Extracts different parts of a tag by splitting string into pieces separated by whitespace. If the white spaces are
 * somewhere between curly braces (which is used to indicate param/return type in JSDoc) they will not be used to split
 * the string. This allows to specify jsdoc tags without the need to eliminate all white spaces i.e. {number | string}
 *
 * @param str The tag line as a string that needs to be split into parts
 * @returns {Array.<string>} An array of strings containing the parts
 */

exports.extractTagParts = function (str) {
  var level = 0,
    extract = '',
    split = [];

  str.split('').forEach(function (c) {
    if (c.match(/\s/) && level === 0) {
      split.push(extract);
      extract = '';
    } else {
      if (c === '{') {
        level++;
      } else if (c === '}') {
        level--;
      }

      extract += c;
    }
  });

  split.push(extract);
  return split.filter(function (str) {
    return str.length > 0;
  });
};


/**
 * Parse tag string "@param {Array} name description" etc.
 *
 * @param {String}
 * @return {Object}
 * @api public
 */

exports.parseTag = function (str) {
  var tag = {}
    , lines = str.split('\n')
    , parts = exports.extractTagParts(lines[0])
    , type = tag.type = parts.shift().replace('@', '')
    , matchType = new RegExp('^@?' + type + ' *')
    , matchTypeStr = /^\{.+\}$/;

  tag.string = str.replace(matchType, '');

  if (lines.length > 1) {
    parts.push(lines.slice(1).join('\n'));
  }

  switch (type) {
    case 'property':
    case 'template':
    case 'param':
      var typeString = matchTypeStr.test(parts[0]) ? parts.shift() : "";
      tag.name = parts.shift() || '';
      tag.description = parts.join(' ');
      exports.parseTagTypes(typeString, tag);
      break;
    case 'define':
    case 'return':
    case 'returns':
      var typeString = matchTypeStr.test(parts[0]) ? parts.shift() : "";
      exports.parseTagTypes(typeString, tag);
      tag.description = parts.join(' ');
      break;
    case 'see':
      if (~str.indexOf('http')) {
        tag.title = parts.length > 1
          ? parts.shift()
          : '';
        tag.url = parts.join(' ');
      } else {
        tag.local = parts.join(' ');
      }
      break;
    case 'api':
      tag.visibility = parts.shift();
      break;
    case 'public':
    case 'private':
    case 'protected':
      tag.visibility = type;
      break;
    case 'enum':
    case 'typedef':
    case 'type':
      exports.parseTagTypes(parts.shift(), tag);
      break;
    case 'lends':
    case 'memberOf':
      tag.parent = parts.shift();
      break;
    case 'extends':
    case 'implements':
    case 'augments':
      tag.otherClass = parts.shift();
      break;
    case 'borrows':
      tag.otherMemberName = parts.join(' ').split(' as ')[0];
      tag.thisMemberName = parts.join(' ').split(' as ')[1];
      break;
    case 'throws':
      var typeString = matchTypeStr.test(parts[0]) ? parts.shift() : "";
      tag.types = exports.parseTagTypes(typeString);
      tag.description = parts.join(' ');
      break;
    case 'description':
      tag.full = parts.join(' ').trim();
      tag.summary = tag.full.split('\n\n')[0];
      tag.body = tag.full.split('\n\n').slice(1).join('\n\n');
      break;
    default:
      tag.string = parts.join(' ').replace(/\s+$/, '');
      break;
  }

  return tag;
};

/**
 * Parse tag type string "{Array|Object}" etc.
 * This function also supports complex type descriptors like in jsDoc or even the enhanced syntax used by the
 * [google closure compiler](https://developers.google.com/closure/compiler/docs/js-for-compiler#types)
 *
 * The resulting array from the type descriptor `{number|string|{name:string,age:number|date}}` would look like this:
 *
 *     [
 *       'number',
 *       'string',
 *       {
 *         age: ['number', 'date'],
 *         name: ['string']
 *       }
 *     ]
 *
 * @param {String} str
 * @return {Array}
 * @api public
 */

exports.parseTagTypes = function (str, tag) {
  if (!str) {
    if (tag) {
      tag.types = [];
      tag.typesDescription = "";
      tag.optional = tag.nullable = tag.nonNullable = tag.variable = false;
    }
    return [];
  }
  var { parse, publish, createDefaultPublisher, NodeType, SyntaxType } = require('jsdoctypeparser');
  var result = parse(str.substring(1, str.length - 1));

  var customPublisher = Object.assign({}, createDefaultPublisher(), {
    NAME(nameNode) {
      var output = '<code>' + nameNode.name + '</code>';

      if (result.type === NodeType.OPTIONAL) {
        output += '|<code>undefined</code>';
      } else if (result.type === NodeType.NULLABLE) {
        output += '|<code>null</code>';
      }

      return output;
    }
  });

  var types = (function transform(type) {
    if (type && type.type === NodeType.UNION) {
      return [transform(type.left), transform(type.right)].flat();
    } else if (type && type.type === NodeType.NAME) {
      return [type.name];
    } else if (type && type.type === NodeType.RECORD) {
      return [type.entries.reduce(function (obj, entry) {
        obj[entry.key] = transform(entry.value);
        return obj;
      }, {})];
    } else if (type && type.type === NodeType.GENERIC) {
      if (type.meta.syntax === SyntaxType.GenericTypeSyntax.ANGLE_BRACKET) {
        return [type.subject.name + '<' + transform(type.objects[0]).join('|') + '>'];
      } else if (type.meta.syntax === SyntaxType.GenericTypeSyntax.ANGLE_BRACKET_WITH_DOT) {
        return [type.subject.name + '.<' + transform(type.objects[0]).join('|') + '>'];
      } else if (type.meta.syntax === SyntaxType.GenericTypeSyntax.SQUARE_BRACKET) {
        return [type.subject.name + '[' + transform(type.objects[0]).join('|') + ']'];
      } else if (type.meta.syntax === SyntaxType.VariadicTypeSyntax.PREFIX_DOTS) {
        return [`...${type.subject.name}`];
      } else if (type.meta.syntax === SyntaxType.VariadicTypeSyntax.SUFFIX_DOTS) {
        return [`${type.subject.name}...`];
      } else if (type.meta.syntax === SyntaxType.VariadicTypeSyntax.ONLY_DOTS) {
        return ['...'];
      }
      return [type.subject.name]
    } else if (type && type.value) {
      return transform(type.value);
    } else {
      return type.toString();
    }
  }(result));

  if (tag) {
    tag.types = types;
    tag.typesDescription = publish(result, customPublisher).replace(/^\?|=$/, '');
    tag.optional = (tag.name && tag.name.slice(0, 1) === '[') || result.type === NodeType.OPTIONAL;
    tag.nullable = result.type === NodeType.NULLABLE;
    tag.nonNullable = result.meta ? result.meta.syntax === 'SUFFIX_QUESTION_MARK' || result.meta.syntax === 'PREFIX_BANG' : false;
    tag.variable = result.type === NodeType.VARIADIC;
  }

  return types;
};

/**
 * Determine if a parameter is optional.
 *
 * Examples:
 * JSDoc: {Type} [name]
 * Google: {Type=} name
 * TypeScript: {Type?} name
 *
 * @param {Object} tag
 * @return {Boolean}
 * @api public
 */

exports.parseParamOptional = function (tag) {
  var lastTypeChar = tag.types.slice(-1)[0].slice(-1);
  return tag.name.slice(0, 1) === '[' || lastTypeChar === '=' || lastTypeChar === '?';
};

/**
 * @interface CodeContext
 * @property {string} type
 * @property {string} name
 *
 * Parse the context from the given `str` of js.
 *
 * This method attempts to discover the context
 * for the comment based on it's code. Currently
 * supports:
 *
 *   - classes
 *   - class constructors
 *   - class methods
 *   - function statements
 *   - function expressions
 *   - prototype methods
 *   - prototype properties
 *   - methods
 *   - properties
 *   - declarations
 * @param {Token} token
 * @param {Object=} parentContext An indication if we are already in something. Like a namespace or an inline declaration.
 * @return {CodeContext}
 * @api public
 */

exports.parseCodeContext = function (token, parentContext) {
  console.assert(!token.seen, `${token.span} SEEN`)
  token.seen = true

  parentContext = parentContext || {};

  let trimText = token.trimText
  var ctx;

  // loop through all context matchers, returning the first successful match
  return exports.contextPatternMatchers.some(function (matcher) {
    return ctx = matcher(trimText, parentContext);
  }) && ctx;
};

exports.contextPatternMatchers = [
  //Package or types
  function (str) {
    if (/^\s*(create)[\w\s]*\s(package|type|view)\s+([\w$]+)\s*/i.exec(str)) {
      return {
        type: 'global'
        , name: RegExp.$3
        // Split on ";" for pks files. This may occur when on JavaDoc fn then another fn without JavaDoc
        , header: str.split(/(\s+(as|is|begin)\s+|;)/gi)[0]
      };
    }
  },

  //Procedure/Function
  function (str) {
    if (/^\s*(cursor|procedure|function)\s+([\w$]+)\s*/i.exec(str)) {
      return {
        type: RegExp.$1.toLowerCase()
        , name: RegExp.$2
        // Split on ";" for pks files. This may occur when on JavaDoc fn then another fn without JavaDoc
        , header: str.split(/(\s+(as|is|begin)\s+|;)/gi)[0].trim()
      };
    }
  },

  //Constants
  function (str) {
    // #40 fix for the following situation
    // <blank line>
    // -- comment
    // gc_hash_md4 constant pls_integer := 1;
    // If we don't remove blank lines and spaces to start then it won't find constant tag
    let checkStr = str;
    checkStr = checkStr.replace(/^\s*\n/gm, '');
    checkStr = checkStr.replace(/^\s*-{2,}.*\n/gm, '');

    if (/^\s*[\w$]+\s+constant\s+/i.exec(checkStr)) {
      // #40 fix for comments above a constant
      str = str.replace(/^\s*--.*$/mg, '');

      var
        ret = {
          type: 'constants',
          header: str,
          constants: []
        },
        constantsArr = str.split(';')
        ;

      constantsArr.forEach(function (constant) {
        // Comments after constants may still be in the array.
        // As such only allow definitions of constants
        let match = /^\s*(?<name>\w+)\s+(?:constant)\s+(?<type>.+?)\s+(?:default|:=)\s*(?<value>.+?)\s*$/gi.exec(constant)
        if (match) {
          let myConstant = {
            name: '',
            type: '',
            value: '',
            ...match.groups,

            // Remove any "\n" and the begining
            code: constant.replace(/^[\n]*/, '') + ';' //Need to re-append missing ";" since removed with .split
          };

          ret.constants.push(myConstant);
        }// if constant
      });//constantsArr.forEach

      return ret;
    }// if constant
  },

  //Exceptions
  function (str) {
    if (/(^[\w]+)(\s+)(exception)/i.exec(str)) {
      // #40 fix for comments above a constant
      str = str.replace(/^\s*--.*$/mg, '');

      var
        ret = {
          type: 'exceptions',
          header: str,
          exceptions: []
        },
        exceptionsArr = str.split(';')
        ;

      exceptionsArr.forEach(function (exception) {
        // Comments after exceptions may still be in the array.
        // As such only allow definitions of exceptions
        if (/^\s*\w+\s+exception(?!_).*$/gi.test(exception)) {
          var
            myException = {
              name: '',
              // Remove any "\n" and the begining
              code: exception.replace(/^[\n]*/, '') + ';' //Need to re-append missing ";" since removed with .split
            }
            ;

          /^\s*([\w]+)\s+exception(\s*)/i.exec(exception);
          myException.name = RegExp.$1.trim();

          ret.exceptions.push(myException);
        }// if exception
      });//exceptionsArr.forEach

      return ret;
    }// if exception
  },

  //Types
  function (str) {
    // #43: Add support for subtype
    if (/^\s*(type|subtype)\s+/i.exec(str)) {
      const
        typesArr = str.split(';').map(x => x.trim()),//trim().split(/\s*;\s*/),
        types = [];

      // Added in the typesArr[k] since there's a blank array element at end
      // TODO mdsouza: changet this to base name and code variables
      for (let i = 0; i < typesArr.length && typesArr[i]; i++) {
        // #43: Add support for subtype
        // https://docs.oracle.com/en/database/oracle/oracle-database/19/lnpls/block.html#GUID-9ACEB9ED-567E-4E1A-A16A-B8B35214FC9D
        let subtypeMatch = /^(?<qualifier>subtype)\s+(?<name>\w+)\s+(?:is)\s+(?<specification>.+?)$/i.exec(typesArr[i])
        if (subtypeMatch) {
          types.push({
            name: '',
            qualifier: '',
            ...subtypeMatch.groups,
            code: subtypeMatch[0] + ';', //Need to re-append missing ";" since removed with .split
          });
          continue;
        }

        // #28
        const typeMatch = /^\s*(?<qualifier>type)\s+(?<name>\w+)\s+(?:is)\s+(?<specification>.+)\s*/si.exec(typesArr[i])
        if (typeMatch) {
          console.log('--> type')
          const type = {
            name: '',
            qualifier: '',
            specification: '',
            ...typeMatch.groups,
            code: typeMatch[0] + ';', //Need to re-append missing ";" since removed with .split
          };

          console.log('---')
          console.log(type.code.replace(/\s+/g, ' '))
          console.log('---')

          types.push(type);
          continue;
        }

        // The rest of the lines are not types.
        if (/^--.*$/.test(typesArr[i])) {
          // Single-line comment.
          console.log('SCOMMENT', typesArr[i])
          continue
        }

        console.warn('unrecognized type line', typesArr[i], /^\s*(?<qualifier>type)\s+(?<name>\w+)\s+(?:is)\s+(?<specification>.+?)\s*/i.test(typesArr[i]))
        

      }//typesArr

      return {
        type: 'types'
        , header: str
        , types: types
      };
    }
  },

  //Variables
  function (str) {
    if (str.substring(0, 4) != "type" && str.substring(0, 7) != "subtype" &&
      /^\s*([\w]+)\s*(([\w]+)|([\w]+\(\s*([\d]+)(,\s*[\d]+)?\s*\)))((\s+)|;)((default|:=)(\s+)((\'[\w]*\')|[\d]+|[\w]+((\s+)[\w]+)?))?/i.exec(str)) {
      // #40 fix for comments above a constant
      str = str.replace(/^\s*--.*$/mg, '');

      var
        ret = {
          type: 'variables',
          header: str,
          variables: []
        },
        variablesArr = str.split(';')
        ;

      variablesArr.forEach(function (variable) {
        // Comments after variables may still be in the array.
        // As such only allow definitions of variables
        if (/^\s*\w+\s+.+(:=|default)*.+$/gi.test(variable)) {
          var
            myVariable = {
              name: '',
              // Remove any "\n" and the begining
              code: variable.replace(/^[\n]*/, '') + ';' //Need to re-append missing ";" since removed with .split
            }
            ;

          // Regex for checking variables
          /^\s*([\w]+)\s+(([\w]+)|([\w]+\(\s*([\d]+)(,\s*[\d]+)?\s*\)))((\s+)?)((default|:=)(\s+)((\'[\w]*\')|[\d]+|[\w]+((\s+)[\w]+)?))?/i.exec(variable);
          myVariable.name = RegExp.$1.trim();

          ret.variables.push(myVariable);
        }// if variable
      });//variablesArr.forEach

      if (ret.variables.length > 0) {
        return ret;
      }
    }// if variable
  },

  function (str, pc) {
    // Other matches are assumed to be global
    return {
      type: 'global'
      , name: ''
    };
  }
];


