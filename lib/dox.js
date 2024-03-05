/*!
 * Module dependencies.
 */
const debug = console;//require('./debug');
const { CodeContext, Comment, Position, Span, SyntaxNode, SyntaxNodeFactory, SyntaxTree } = require('./model')

const { PlsqlTokenizer } = require('./lexer')

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

const lexer = new PlsqlTokenizer()
// exports.api = require('dox/api');

/**
 * @typedef {import("./lexer").Token} Token
 *
 * @param {string} js
 * @param {object} options
 * @returns {Generator<?>}
 */
exports.parseTokens = function* (js, options) {
  for (const token of lexer.parse(js)) {
    yield token
  }
}

/**
 * Parse tokens into syntactic nodes.
 * @param {string} js
 * @param {object} options
 * @returns {Generator<SyntaxNode>}
 */
exports.parseSyntax = function* (js, options) {
  let /** @type {Token[]} */ buffer = []

  for (const token of lexer.parse(js)) {
    buffer.push(token)

    switch (token.type) {
      case 'reserved':
        switch (token.value) {
          case 'IS':
          case 'AS':
            yield SyntaxNode.create(buffer)
            buffer = []
            break
        }
        break;

      case 'keyword':
      case 'identifier':
      case 'whitespace':
      case 'number':
      case 'period':
      case 'comma':
      case 'lparen':
      case 'rparen':
        break
      case 'semicolon':
      case 'slash':
        yield SyntaxNode.create(buffer)
        buffer = []
        break
      case 'comment.single.start':
      case 'comment.single':
      case 'comment.single.end':
      case 'comment.multi.start':
      case 'comment.multi':
      case 'comment.multi.end':
        break;
      case 'char':
        console.log('plain char', token)
        break
    }
  }

  yield SyntaxNode.create(buffer)
};

/**
 *
 * @param {string} js
 * @param {object} options
 * @returns {Generator<SyntaxTree>}
 */
exports.parseSyntaxTree = function* (js, options) {
  options = options || {};
  js = js.replace(/\r\n/gm, '\n');

  const isDocComment = (token) => token.type === 'comment.multi'
    && !token.text.startsWith('!') // not "/*!"
    && (!options.skipSingleStar || token.text.startsWith('*'))

  let /** @type {SyntaxTree} */ tree = null
  for (const syntax of exports.parseSyntax(js, options)) {


    // tree ??= new SyntaxTree()
    // switch (syntax.tokens[0].text) {
    //   case 'CREATE':
    //     tree.push(syntax)
    //     break
    //   case '/':
    //     yield tree
    //     tree = null
    // }

    // debug.log('syntax', `[${syntax.toString()}]`, syntax)
    // const docComments = syntax.tokens.filter(isDocComment)
    // if (docComments.length) {
    //   debug.log('    doc comments', ...docComments)
    // }
  }
}


/**
 * Parse comments in the given string of `js`.
 *
 * @generator
 * @param {String} js
 * @param {Object} options
 * @returns {Generator<Comment>}
 * @yields {Comment}
 * @see exports.parseComment
 * @api public
 */

exports.parseComments = function* (js, options) {
  options = options || {};
  js = js.replace(/\r\n/gm, '\n');

  const isDocComment = (token) => token.type === 'comment.multi'
  && !token.text.startsWith('!') // not "/*!"
  && (!options.skipSingleStar || token.text.startsWith('*'))

  let /** @type {SyntaxNode?} */ prevSyntax = null, /** @type {Token[]} */ prevDocComments = []
  for (const syntax of exports.parseSyntax(js, options)) {
    const docComments = [...syntax.getLeadingTrivia()].filter(isDocComment)
    if (prevSyntax && prevDocComments.length === 0 && docComments.length) {
      yield new Comment(prevSyntax, docComments)
    }

    if (docComments.length) {
      yield new Comment(prevSyntax, docComments)
    }
    /**

    //     // Doc comment
    //     debug.log('--> is doc comment')

    //     // Flush any code following the last comment
    //     if (prevComment && prevTokens.length) {
    //       prevComment.codeStart = syntax.start.line
    //       flushPrevTokens(prevComment)
    //     }

    //     // Strip " * " from the comments, e.g.
    //     // /**
    //     //  * foo
    //     //  */
    //     // should yield "foo" and not "* foo".
    //     const comment = exports.parseComment(syntax.text.replace(/^[ \t]*\* ?/gm, ''), options);
    //     comment.ignore = syntax.text[2] === '!'; // ignore "/*!" (but not "/**!", apparently)
    //     comment.line = syntax.start.line;
    //     comment.codeStart = syntax.end.line
    //     if (!comment.description.full.match(skipPattern)) {
    //       yield comment
    //       prevComment = comment
    //     }
    //     break;

    //   default:
    //     prevTokens.push(syntax)
    //     break;
    // }
    prevSyntax = syntax
    prevDocComments = docComments
  }

  // // trailing code
  // if (prevTokens.length) {
  //   const comment = prevComment ?? new Comment({ line: prevTokens[0].start.line });
  //   debug.log('phantom comment', comment)

  //   flushPrevTokens(comment)

  //   // Emit our last comment if it is the phantom comment.
  //   if (comment !== prevComment) {
  //     yield comment
  //     prevComment = comment
  //   }
  // }
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
 * @return {CodeContext?}
 * @api public
 */

exports.parseCodeContext = function (token, parentContext) {
  console.assert(!token.seen, `${token.span} SEEN`)
  token.seen = true

  let trimText = token.trimText

  // if (parentContext) {
  //   console.log('has parent context', parentContext.type, token.trimText)
  // }

  // loop through all context matchers, returning the first successful match
  for (const matcher of exports.contextPatternMatchers) {
    const ctx = matcher(trimText, parentContext)
    if (ctx) {
      return new CodeContext({ ...ctx, parent: parentContext })
    }
  }
};

/**
 */
exports.contextPatternMatchers = [
  //Package or types
  /**
   * @param {string} str
   * @param {CodeContext?} parentContext
   * @returns {CodeContext?}
   */
  (str, parentContext) => {
    const match = /^\s*(create)[\w\s]*\s(package|type|view)\s+([\w$]+)\s*/i.exec(str)
    if (match) {
      return {
        type: 'global',
        name: match[3],
        // Split on ";" for pks files. This may occur when on JavaDoc fn then another fn without JavaDoc
        header: str.split(/(\s+(as|is|begin)\s+|;)/gi)[0]
      };
    }
  },

  /**
   * Procedure/Function/Cursor
   * @param {string} str
   * @param {CodeContext?} parentContext
   * @returns {CodeContext?}
   */
  (str, parentContext) => {
    const match = /^\s*(?<type>cursor|procedure|function)\s+(?<name>[a-z][\w$#]*|"[^"]*")\s*/i.exec(str)
    if (match) {
      return {
        type: match.groups.type.toLowerCase(),
        name: match.groups.name,
        // Split on ";" for pks files. This may occur when on JavaDoc fn then another fn without JavaDoc
        header: str.split(/(\s+(as|is|begin)\s+|;)/gi)[0].trim()
      };
    }
  },

  /**
   * Record type
   * @param {string} str
   * @param {CodeContext?} parentContext
   * @returns {CodeContext?}
   */
  (str, parentContext) => {
    const match = /^\s*(?:type)\s+(?<name>[a-z][\w$#]*|"[^"]*")\s*(?:is)\s+(?<type>record)/i.exec(str)
    if (match) {
      console.log('RECORD', match)
      return {
        type: match.groups.type.toLowerCase(),
        name: match.groups.name,
        header: str.split(/(\s+(is)\s+|;)/gi)[0].trim()
      };
    }
  },

  /**
   * Constants
   * @param {string} str
   * @param {CodeContext?} parentContext
   * @returns {CodeContext?}
   */
  (str, parentContext) => {
    // #40 fix for the following situation
    // <blank line>
    // -- comment
    // gc_hash_md4 constant pls_integer := 1;
    // If we don't remove blank lines and spaces to start then it won't find constant tag
    let checkStr = str;
    checkStr = checkStr.replace(/^\s*\n/gm, '');
    checkStr = checkStr.replace(/^\s*-{2,}.*\n/gm, '');

    if (/^\s*(?:[a-z][\w#$]*|"[^"]+")\s+constant\b/i.exec(checkStr)) {
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
        let match = /^\s*(?<name>[a-z][\w#$]*|"[^"]+")\s+(?:constant)\s+(?<type>.+?)\s+(?:default|:=)\s*(?<value>.+?)\s*$/gi.exec(constant)
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

  /**
   * Exceptions
   * @param {string} str
   * @param {CodeContext?} parentContext
   * @returns {CodeContext?}
   */
  (str, parentContext) => {
    if (/^\s*(?:[a-z][\w#$]*|"[^"]+")(?:\s+)(exception)\b/i.exec(str)) {
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

  /**
   * Subtypes
   * @param {string} str
   * @param {CodeContext?} parentContext
   * @returns {CodeContext?}
   */
  (str, parentContext) => {
    // #43: Add support for subtype
    if (/^\s*(subtype)\b/i.exec(str)) {
      const
        subtypesArr = str.split(';').map(x => x.trim()),//trim().split(/\s*;\s*/),
        subtypes = [];

      // Added in the typesArr[k] since there's a blank array element at end
      // TODO mdsouza: changet this to base name and code variables
      for (let i = 0; i < subtypesArr.length && subtypesArr[i]; i++) {
        // #43: Add support for subtype
        // https://docs.oracle.com/en/database/oracle/oracle-database/19/lnpls/block.html#GUID-9ACEB9ED-567E-4E1A-A16A-B8B35214FC9D
        let subtypeMatch = /^(?<qualifier>subtype)\s+(?<name>[a-z][\w#$]*|"[^"]+")\s+(?:is)\s+(?<specification>.+?)$/i.exec(subtypesArr[i])
        if (subtypeMatch) {
          subtypes.push({
            name: '',
            ...subtypeMatch.groups,
            code: subtypeMatch[0] + ';', //Need to re-append missing ";" since removed with .split
          });
          continue;
        }

        console.warn('unrecognized type line', subtypesArr[i], /^\s*(?<qualifier>type)\s+(?<name>\w+)\s+(?:is)\s+(?<specification>.+?)\s*/i.test(subtypesArr[i]))
      }

      return {
        type: 'subtypes',
        header: str,
        types: subtypes
      };
    }
  },

  /**
   * Variables / record fields
   * @param {string} str
   * @param {CodeContext?} parentContext
   * @returns {CodeContext?}
   */
  (str, parentContext) => {
    if (/^\s*(?<name>[a-z][\w#$]*)\s*(([\w]+)|([\w]+\(\s*([\d]+)(,\s*[\d]+)?\s*\)))((\s+)|;)((default|:=)(\s+)((\'[\w]*\')|[\d]+|[\w]+((\s+)[\w]+)?))?/i.exec(str)) {
      // #40 fix for comments above a constant
      str = str.replace(/^\s*--.*$/mg, '');
      // str.substring(0, 4) != "type" && str.substring(0, 7) != "subtype"
      let ret = {
        type: 'variables',
        header: str,
        variables: []
      };

      str.split(';').forEach(function (strVariable) {
        // Comments after variables may still be in the array.
        // As such only allow definitions of variables
        const match = /^\s*(?<name>[a-z][\w#$]*)\s+(?<type>.+)(?:\s*(?:\:=|default)\s*(?<defaultValue>.+))?\s*$/gi.exec(strVariable)
        if (match) {
          let variable = {
            name: '',
            type: '',
            defaultValue: '',
            ...match.groups,
            // Remove any "\n" and the begining
            code: strVariable.replace(/^[\n]*/, '') + ';' //Need to re-append missing ";" since removed with .split
          };

          console.log('VARIABLE', variable)
          ret.variables.push(variable);
        } // if variable
        else {
          console.warn('did not match', JSON.stringify(strVariable))
          console.log('--> name?', /^\s*(?<name>[a-z][\w#$]*)/gi.exec(strVariable)?.groups)
          console.log('--> type?', /^\s*(?<name>[a-z][\w#$]*)\s+(?<type>\S.*)/gi.exec(strVariable)?.groups)
          console.log('--> default 1?', /^\s*(?<name>[a-z][\w#$]*)\s+(?<type>\S.*)\s+(?:(?:\:=|default)\s*(?<defaultValue>.+?))?/gi.exec(strVariable)?.groups)
          console.log('--> default 2?', /^\s*(?<name>[a-z][\w#$]*)\s+(?<type>\S.*)\s+(?:(?:\:=|default)\s*(?<defaultValue>.+?))?\s*/gi.exec(strVariable)?.groups)
          console.log('--> full?', /^\s*(?<name>[a-z][\w#$]*)\s+(?<type>.+)\s+(?:(?:\:=|default)\s*(?<defaultValue>.+?))?\s*$/gi.exec(strVariable)?.groups)
          console.log('--> WHAT?', /^\s*(?<name>[a-z][\w#$]*)\s+(?<type>.+)\s+(?:(?:\:=|default)\s*(?<defaultValue>.+?))?\s*(?<WHAT>.+)$/gi.exec(strVariable)?.groups?.WHAT)
        }
      }); //variablesArr.forEach

      if (ret.variables.length > 0) {
        return ret;
      }

      console.log('not a variable', str)
    }// if variable
  },


  /**
   * Close type
   * @param {string} str
   * @param {CodeContext?} parentContext
   * @returns {CodeContext?}
   */
  (str, parentContext) => {
    const match = /^\s*\)\s*;/.exec(str)
    if (match) {
      switch (parentContext?.type) {
        case 'record':
          return {
            type: 'end',
            name: parentContext.name
          }
        default:
          console.log('other parent context end?', parentContext?.type, str)
      }
    }
  },

  str => {
    if (str.startsWith('--')) {
      //console.log('discard scomment', str)
      return
    }
    if (str.startsWith('/*')) {
      console.log('discard mcomment', str)
      return
    }
    if (/^\s*$/.test(str)) {
      //console.log('discard whitespace', str)
      return
    }

    console.log('global?', str)
    // Other matches are assumed to be global
    return {
      type: 'global',
      name: '',
      text: str
    };
  }
];


