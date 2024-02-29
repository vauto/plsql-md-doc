//Overloaded dox.js
const debug = require('./debug');
const dox = require('dox');

// We have to replace (most of?) dox, PL/SQL doesn't look the same as JavaScript.

/**
 * Parse comments in the given string of `js`.
 *
 * @param {String} js
 * @param {Object} options
 * @return {Array}
 * @see exports.parseComment
 * @api public
 */
dox.parseComments = function(js, options){
  options = options || {};
  js = js.replace(/\r\n/gm, '\n');

  var comments = []
    , skipSingleStar = options.skipSingleStar
    , comment
    , buf = ''
    , code
    , linterPrefixes = options.skipPrefixes || ['jslint', 'jshint', 'eshint']
    , skipPattern = new RegExp('^' + (options.raw ? '' : '<p>') + '('+ linterPrefixes.join('|') + ')')
    , lineNum = 1
    , lineNumStarting = 1
    , parentContext;

  let i = 0, len = js.length;
  let bufstart = 0
  while (i < len) {
    if (js[i] === '/' && js[i+1] === '*') {
      // Multiline comment detected
      const start = i

      // Scan to end of comment or EOF
      i = js.indexOf('*/', i + 2)
      i = (i >= 0) ? i + 2 : len

      const strComment = js.substring(start, i)
      console.assert(strComment.startsWith('/*') && (i === len || strComment.length >= 4 && strComment.endsWith('*/')))

      if (!skipSingleStar || (strComment.length > 4 && strComment[2] == '*')) {
        // Doc comment
        debug.log('DOC', strComment)
        lineNumStarting = lineNum;

        // Flush any code following the last comment
        const bb = js.substring(bufstart, start)
        console.assert(bb === buf)
        if (buf.trim().length) {
          comment = comments[comments.length - 1];
          if(comment) {
            // Adjust codeStart for any vertical space between comment and code
            comment.codeStart += buf.match(/^(\s*)/)[0].split('\n').length - 1;
            comment.code = code = dox.trimIndentation(buf).trim();
            comment.ctx = dox.parseCodeContext(code, parentContext);

            if (comment.isConstructor && comment.ctx){
                comment.ctx.type = "constructor";
            }

            // starting a new namespace
            if (comment.ctx && (comment.ctx.type === 'prototype' || comment.ctx.type === 'class')){
              parentContext = comment.ctx;
            }
            // reasons to clear the namespace
            // new property/method in a different constructor
            else if (!parentContext || !comment.ctx || !comment.ctx.constructor || !parentContext.constructor || parentContext.constructor !== comment.ctx.constructor){
              parentContext = null;
            }
          }
        }

        buf = '';
        bufstart = i

        // Strip " * " from the comments, e.g.
        // /**
        //  * foo
        //  */
        // should yield "foo" and not "* foo".
        comment = dox.parseComment(strComment.replace(/^[ \t]*\* ?/gm, ''), options);
        comment.ignore = strComment[2] === '!'; // ignore "/*!" (but not "/**!", apparently)
        comment.line = lineNumStarting;
        comment.codeStart = lineNum + 1;
        if (!comment.description.full.match(skipPattern)) {
          comments.push(comment);
        }
      } else {
        // Plain multi-line comment.  Append and continue
        debug.log('MCOMMENT', strComment)
        buf += strComment
      }

    } else if (js[i] === '-' && js[i+1] === '-') {
      // Single comment detected.  Scan to EOL/EOF.
      const start = i
      i = js.indexOf('\n', i+2)
      i = (i >= 0) ? i + 1 : len

      const strComment = js.substring(start, i);
      debug.log('SCOMMENT', strComment)

      // Just append and continue.
      buf += strComment;
    } else if (js[i] === '\'' || js[i] === '"' || js[i] === '`') {
      // Simple quoted string
      const start = i++
      const quote = js[start]
      
      // Scan for closing quote.
      while (i < len) {
        i = js.indexOf(quote, i)

        if (i < 0) {
          // EOF
          i = len
          break
        }

        if (js[i - 1] === '\\') {
          // Quote is escaped.  Skip.
          continue
        }

        // Quote is NOT escaped.  Advance the marker and exit.
        i++
        break
      }

      // Just append to buffer
      debug.log('STRING', js.substring(start, i))
      buf += js.substring(start, i)
    }
    console.assert(buf === js.substring(bufstart, i))

    if('\n' == js[i]) {
      lineNum++;
    }

    i++;
  }

  if (comments.length === 0) {
    comments.push({
      tags: [],
      description: {full: '', summary: '', body: ''},
      isPrivate: false,
      isConstructor: false,
      line: lineNumStarting
    });
  }

  // trailing code
  if (buf.trim().length) {
    comment = comments[comments.length - 1];
    // Adjust codeStart for any vertical space between comment and code
    comment.codeStart += buf.match(/^(\s*)/)[0].split('\n').length - 1;
    comment.code = code = dox.trimIndentation(buf).trim();
    comment.ctx = dox.parseCodeContext(code, parentContext);
  }

  return comments;
};

// Overwrite context patterns for Oracle
dox.contextPatternMatchers = [
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
          type : 'constants',
          header : str,
          constants : []
        },
        constantsArr = str.split(';')
        ;

      constantsArr.forEach(function(constant){
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
            code : constant.replace(/^[\n]*/, '') + ';' //Need to re-append missing ";" since removed with .split
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
          type : 'exceptions',
          header : str,
          exceptions : []
        },
        exceptionsArr = str.split(';')
        ;

      exceptionsArr.forEach(function(exception){
        // Comments after exceptions may still be in the array.
        // As such only allow definitions of exceptions
        if (/^\s*\w+\s+exception(?!_).*$/gi.test(exception)){
          var
            myException = {
              name : '',
              // Remove any "\n" and the begining
              code : exception.replace(/^[\n]*/, '') + ';' //Need to re-append missing ";" since removed with .split
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
      var
        typesArr = str.split(';'),
        types = [];

      // Added in the typesArr[k] since there's a blank array element at end
      // TODO mdsouza: changet this to base name and code variables
      for(var i = 0; i < typesArr.length && typesArr[i]; i++){
        var myType = {
          name : '',
          // Remove any "\n" and the begining
          code : typesArr[i].replace(/^[\n]*/, '') + ';', //Need to re-append missing ";" since removed with .split
        };

        // #28
        if (/^\s*(type|subtype)/i.test(myType.code)){
          myType.name = myType.code.match(/\s*(type|subtype)\s+\w+/gi)[0].replace(/^\s*(type|subtype)/gi, '').trim();
          types.push(myType);
        }

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
          type : 'variables',
          header : str,
          variables : []
        },
        variablesArr = str.split(';')
        ;

      variablesArr.forEach(function(variable){
        // Comments after variables may still be in the array.
        // As such only allow definitions of variables
        if (/^\s*\w+\s+.+(:=|default)*.+$/gi.test(variable)){
          var
            myVariable = {
              name : '',
              // Remove any "\n" and the begining
              code : variable.replace(/^[\n]*/, '') + ';' //Need to re-append missing ";" since removed with .split
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


dox.__parseTag = dox.parseTag
dox.parseTag = function(str) {
  const tag = dox.__parseTag(str)
  // console.log(tag.type, tag)
  switch (tag.type) {
    case 'classdesc':
      console.log('classdesc', Object.keys(tag))
      break;
    case 'description':
      console.log('description', tag)
      break;
    }

  return tag;
}

module.exports = dox;
