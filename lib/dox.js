/*!
 * Module dependencies.
 */
const debug = console;//require('./debug');
const { SyntaxNode, StatementSyntaxNode } = require('./syntax')
const { CodeContext, Comment } = require('./comment')

const { JavadocTokenizer } = require('./javadoc/lexer');
const { PlsqlTokenizer } = require('./plsql/lexer')
const { PlsqlNodeReader, TypeDeclarationStatementSyntaxNode, ParameterDeclarationExpressionSyntaxNode, PlsqlUnitName, PlsqlItemName } = require('./plsql/syntax');
const { JavadocNodeReader, TagSyntaxNode } = require('./javadoc/syntax');

const markdown = require('markdown-it')({
  html: true,
  xhtmlOut: true,
  breaks: true,
  langPrefix: 'lang-'
});

/**
 * @typedef {import("./lexer").Token} Token
 */

/** */
class DocumentGenerator {
  plsqlLexer = new PlsqlTokenizer()

  /**
   * @param {object} options
   */
  constructor(options = {}) {
    this.options = options ?? {}
  }

  /**
   * Parse tokens into syntactic nodes.
   * @param {string} text
   * @returns {Generator<SyntaxNode>}
   */
  *parseSyntax(text, { filename } = {}) {
    yield* new PlsqlNodeReader(this.plsqlLexer.parse(text, { filename }))
  };

  /**
   * Parse comments in the given string of `js`.
   *
   * @generator
   * @param {SyntaxNode} syntax
   * @param {ReadContext} parentContext
   * @returns {Generator<Comment>}
   * @yields {Comment}
   * @see readComment
   * @api public
   */
  *readComments(syntax, parentContext) {
    console.assert(syntax instanceof SyntaxNode)
    console.assert(parentContext)

    yield this.readComment(syntax, parentContext)

    // Read descendant comments
    switch (syntax.kind) {
      case 'CreatePackageStatement':
      case 'CreateBaseObjectTypeStatement':
        {
          const unitContext = { ids: new IdGenerator() }
          for (const child of syntax.members) {
            yield* this.readComments(child, unitContext)
          }
          break
        }
      case 'EmptyStatement':
      case 'Statement':
      case 'VariableDeclarationStatement':
      case 'Identifier':
      case 'reserved':
      case 'keyword':
        // don't care about these
        break
      default:
        if (syntax.kind.endsWith("DeclarationStatement")) { break }
        console.warn('unhandled descendant analysis', syntax.kind, syntax.value)
        break
    }

    // console.groupEnd()

  }

  /**
   * Parse comments in the given string of `js`.
   *
   * @generator
   * @param {String} text
   * @param {String?} file The file path (optional)
   * @returns {Generator<Comment>}
   * @yields {Comment}
   * @see this.parseComment
   * @api public
   */
  *parseComments(text, { filename }) {
    text = text.replace(/\r\n/gm, '\n');

    const parentContext = new ReadContext()

    for (const syntax of this.parseSyntax(text, { filename })) {
      yield* this.readComments(syntax, parentContext)
    }
  };

  javadocLexer = new JavadocTokenizer();

  /**
   * Extract doc comments and parse them as Javadoc/JSDoc/PLDoc.
   * @param {SyntaxNode} syntax PL/SQL syntax
   */
  *parseDocCommentSyntax(syntax) {
    for (const token of syntax.getDocumentComments()) {
      for (const docSyntax of new JavadocNodeReader(this.javadocLexer.parse(token.text, { ...token.start }))) {
        yield docSyntax
      }
    }
  }


  /**
   * Parse the given comment `str`.
   *
   * @param {Token} token A PL/SQL comment token.
   * @param {SyntaxNode} code The associated code
   * @return {Comment}
   * @api public
   */

  readComment(code, parentContext) {
    // Extract doc comments
    return new Comment({
      code,
      nodes: [...this.parseDocCommentSyntax(code)],
      context: this.parseCodeContext(code, parentContext)
    })
  }

  //TODO: Find a smarter way to do this
  /**
   * Extracts different parts of a tag by splitting string into pieces separated by whitespace. If the white spaces are
   * somewhere between curly braces (which is used to indicate param/return type in JSDoc) they will not be used to split
   * the string. This allows to specify jsdoc tags without the need to eliminate all white spaces i.e. {number | string}
   *
   * @param str The tag line as a string that needs to be split into parts
   * @returns {Array.<string>} An array of strings containing the parts
   */

  extractTagParts(str) {
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


  // /**
  //  * Parse tag string "@param {Array} name description" etc.
  //  *
  //  * @param {String}
  //  * @return {Object}
  //  * @api public
  //  */

  // parseTag(str) {
  //   var tag = {}
  //     , lines = str.split('\n')
  //     , parts = this.extractTagParts(lines[0])
  //     , type = tag.type = parts.shift().replace('@', '')
  //     , matchType = new RegExp('^@?' + type + ' *')
  //     , matchTypeStr = /^\{.+\}$/;

  //   tag.string = str.replace(matchType, '');

  //   if (lines.length > 1) {
  //     parts.push(lines.slice(1).join('\n'));
  //   }

  //   switch (type) {
  //     case 'property':
  //     case 'template':
  //     case 'param':
  //       var typeString = matchTypeStr.test(parts[0]) ? parts.shift() : "";
  //       tag.name = parts.shift() || '';
  //       tag.description = parts.join(' ');
  //       this.parseTagTypes(typeString, tag);
  //       break;
  //     case 'define':
  //     case 'return':
  //     case 'returns':
  //       var typeString = matchTypeStr.test(parts[0]) ? parts.shift() : "";
  //       this.parseTagTypes(typeString, tag);
  //       tag.description = parts.join(' ');
  //       break;
  //     case 'see':
  //       if (~str.indexOf('http')) {
  //         tag.title = parts.length > 1
  //           ? parts.shift()
  //           : '';
  //         tag.url = parts.join(' ');
  //       } else {
  //         tag.local = parts.join(' ');
  //       }
  //       break;
  //     case 'api':
  //       tag.visibility = parts.shift();
  //       break;
  //     case 'public':
  //     case 'private':
  //     case 'protected':
  //       tag.visibility = type;
  //       break;
  //     case 'enum':
  //     case 'typedef':
  //     case 'type':
  //       this.parseTagTypes(parts.shift(), tag);
  //       break;
  //     case 'lends':
  //     case 'memberOf':
  //       tag.parent = parts.shift();
  //       break;
  //     case 'extends':
  //     case 'implements':
  //     case 'augments':
  //       tag.otherClass = parts.shift();
  //       break;
  //     case 'borrows':
  //       tag.otherMemberName = parts.join(' ').split(' as ')[0];
  //       tag.thisMemberName = parts.join(' ').split(' as ')[1];
  //       break;
  //     case 'throws':
  //       var typeString = matchTypeStr.test(parts[0]) ? parts.shift() : "";
  //       tag.types = this.parseTagTypes(typeString);
  //       tag.description = parts.join(' ');
  //       break;
  //     case 'description':
  //       break;
  //     default:
  //       tag.string = parts.join(' ').replace(/\s+$/, '');
  //       break;
  //   }

  //   return tag;
  // };

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

  // parseTagTypes(str, tag) {
  //   if (!str) {
  //     if (tag) {
  //       tag.types = [];
  //       tag.typesDescription = "";
  //       tag.optional = tag.nullable = tag.nonNullable = tag.variable = false;
  //     }
  //     return [];
  //   }
  //   var { parse, publish, createDefaultPublisher, NodeType, SyntaxType } = require('jsdoctypeparser');
  //   var result = parse(str.substring(1, str.length - 1));

  //   var customPublisher = Object.assign({}, createDefaultPublisher(), {
  //     NAME(nameNode) {
  //       var output = '<code>' + nameNode.name + '</code>';

  //       if (result.type === NodeType.OPTIONAL) {
  //         output += '|<code>undefined</code>';
  //       } else if (result.type === NodeType.NULLABLE) {
  //         output += '|<code>null</code>';
  //       }

  //       return output;
  //     }
  //   });

  //   var types = (function transform(type) {
  //     if (type && type.type === NodeType.UNION) {
  //       return [transform(type.left), transform(type.right)].flat();
  //     } else if (type && type.type === NodeType.NAME) {
  //       return [type.name];
  //     } else if (type && type.type === NodeType.RECORD) {
  //       return [type.entries.reduce(function (obj, entry) {
  //         obj[entry.key] = transform(entry.value);
  //         return obj;
  //       }, {})];
  //     } else if (type && type.type === NodeType.GENERIC) {
  //       if (type.meta.syntax === SyntaxType.GenericTypeSyntax.ANGLE_BRACKET) {
  //         return [type.subject.name + '<' + transform(type.objects[0]).join('|') + '>'];
  //       } else if (type.meta.syntax === SyntaxType.GenericTypeSyntax.ANGLE_BRACKET_WITH_DOT) {
  //         return [type.subject.name + '.<' + transform(type.objects[0]).join('|') + '>'];
  //       } else if (type.meta.syntax === SyntaxType.GenericTypeSyntax.SQUARE_BRACKET) {
  //         return [type.subject.name + '[' + transform(type.objects[0]).join('|') + ']'];
  //       } else if (type.meta.syntax === SyntaxType.VariadicTypeSyntax.PREFIX_DOTS) {
  //         return [`...${type.subject.name}`];
  //       } else if (type.meta.syntax === SyntaxType.VariadicTypeSyntax.SUFFIX_DOTS) {
  //         return [`${type.subject.name}...`];
  //       } else if (type.meta.syntax === SyntaxType.VariadicTypeSyntax.ONLY_DOTS) {
  //         return ['...'];
  //       }
  //       return [type.subject.name]
  //     } else if (type && type.value) {
  //       return transform(type.value);
  //     } else {
  //       return type.toString();
  //     }
  //   }(result));

  //   if (tag) {
  //     tag.types = types;
  //     tag.typesDescription = publish(result, customPublisher).replace(/^\?|=$/, '');
  //     tag.optional = (tag.name && tag.name.slice(0, 1) === '[') || result.type === NodeType.OPTIONAL;
  //     tag.nullable = result.type === NodeType.NULLABLE;
  //     tag.nonNullable = result.meta ? result.meta.syntax === 'SUFFIX_QUESTION_MARK' || result.meta.syntax === 'PREFIX_BANG' : false;
  //     tag.variable = result.type === NodeType.VARIADIC;
  //   }

  //   return types;
  // };

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

  parseCodeContext = function (node, parentContext) {
    // loop through all context matchers, returning the first successful match
    for (const matcher of this.contextPatternMatchers) {
      const ctx = matcher(node, parentContext)
      if (ctx) {
        return new CodeContext({ ...ctx, parent: parentContext })
      }
    }
  };

  /**
   *
   * @param {ParameterDeclarationExpressionSyntaxNode} node
   * @returns
   */
  mapParameterToCodeContext = (node) => {

    const mode = node.mode.join(' ', 'T')

    const result = {
      id: node.name.toString('V'),
      name: node.name.toString('T'),
      mode: mode || 'in',
      type: node.type.toString('T'),
      defaultValue: node.defaultValue?.toString('T'),
      optional: !!node.defaultValue
    }

    let specification = [result.name]
    if (mode) {
      specification.push(mode)
    }
    specification.push(result.type)
    if (result.defaultValue) {
      specification.push(node.defaultExpr.toString('T'), result.defaultValue)
    }

    result.specification = specification.join(' ')

    return result

  }

  mapReturnToCodeContext = (node) => {
    if (node) {
      return {
        type: node.type.toString('T'),
        pipelined: !node.pipelined ? 'pipelined' : undefined
      }
    }
  }

  /**
   */
  contextPatternMatchers = [
    //Package or types
    /**
     * @param {SyntaxNode} str
     * @returns {CodeContext?}
     */
    (node) => {
      switch (node.kind) {
        case 'CreatePackageStatement':
        case 'CreateBaseObjectTypeStatement':
          console.log(new PlsqlUnitName(node.name).toString())
          return {
            kind: 'package',
            name: new PlsqlUnitName(node.name),
            type: node.objectType?.toString().toLowerCase(),
          }
      }
    },

    /**
     * Procedure/Function/Cursor
     * @param {ProcedureDeclarationStatementSyntaxNode} str
     * @param {CodeContext?} parentContext
     * @returns {CodeContext?}
     */
    (node, parentContext) => {
      switch (node.kind) {
        case 'ProcedureDeclarationStatement':
        case 'FunctionDeclarationStatement':
        case 'MethodDeclarationStatement':
          const kind = node.kind.replace(/DeclarationStatement$/, '').toLowerCase()
          return {
            kind,
            header: node.toString('T'),
            id: parentContext.ids.newUniqueId(node.name.toString('V')),
            name: new PlsqlItemName(node.name),
            type: kind,
            params: node.parameters?.parameters.map(this.mapParameterToCodeContext) ?? [],
            return: this.mapReturnToCodeContext(node.return)
          }
      }
    },

    /**
     * Constants/Variables
     * @param {SyntaxNode} node
     * @returns {CodeContext?}
     */
    (node) => {
      if (node.kind === 'VariableDeclarationStatement') {
        return {
          kind: node.isConstant ? 'constant' : 'variable',
          name: node.name.toString('T'),
          type: node.type.toString('T'),
          defaultValue: node.defaultValue?.toString('T')
        }
      }
    },

    /**
     * Exceptions
     * @param {string} str
     * @param {CodeContext?} parentContext
     * @returns {CodeContext?}
     */
    (str, parentContext) => {
      return null
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
     * Subtypes, records, and collections.
     * @param {StatementSyntaxNode} node
     * @returns {CodeContext?}
     */
    (node) => {
      if (node instanceof TypeDeclarationStatementSyntaxNode) {
        return {
          kind: node.kind.replace(/DeclarationStatement$/, '').toLowerCase(),
          name: node.name.toString('T'),
          specification: node.specification?.toString('T')
        }
      }
    },

    // Default.
    (node, parentContext) => {
      // TODO start leaving these out one by one
      switch (node.kind) {
        case 'Identifier':
        case 'reserved':
        case 'keyword':
        case 'EmptyStatement':
          return
      }
      console.warn('using default handler for', { kind: node.kind, value: node.value })

      return {
        kind: node.kind,
        name: node.name?.toString('T'),
        type: (node.type ?? node.objectType)?.toString().toLowerCase(),
        specification: node.specification?.toString('T'),
        defaultValue: node.defaultValue?.toString('T')
      }
    }
  ];


}
exports.DocumentGenerator = DocumentGenerator

class IdGenerator {
  data = {}

  /**
   * @param {string} name
   */
  newUniqueId(name) {
    const state = this.data[name] ??= { count: 0 }
    return `${name}-${++state.count}`
  }
}

class ReadContext {
  ids = new IdGenerator()
}
