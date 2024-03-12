// This is the custom package for PLSQL to MD
var debug
const path = require('path')
const { DocumentGenerator } = require('./dox.js');
const { Description } = require('./comment.js');
const Handlebars = require('handlebars');
const dox = new DocumentGenerator()

/** @typedef {import("./plsql/syntax.js").PlsqlName} PlsqlName */

var pmd = {};



// Constants
pmd.DOCTYPES = {
  FUNCTION: "function",
  PROCEDURE: "procedure",
  PACKAGE: "package",
  METHOD: "method",
  CURSOR: "cursor",
  RECORD: "record",
  COLLECTION: "collection",
  CONSTANT: 'constant',
  VARIABLE: 'variable',
  SUBTYPE: "subtype",
  VARIABLES: "variables",
  EXCEPTIONS: "exceptions",
  GLOBAL: "global"
};

// Contains all the files that are being generated. This is used so all the sub package have a TOC to the left
pmd.globalFiles = [];

/**
 * Handles consistent error handling
 * Process will exit calling this functions
 *
 * @param msg Message to log
 * @param includeError optional - Prefix the logged message with "Error: "
 */
pmd.raiseError = function (msg, includeError) {
  includeError = includeError == null ? true : includeError;
  console.error((includeError ? 'Error: ' : '') + msg);
  process.exit();
}//raiseError


/**
 * Verify that path exists. If not, an error will be raised
 *
 * @param fullPath
 * @param objName If fullPath doesn't exists, objName will be used in error message
 */
pmd.validatePathRef = function (fullPath, objName) {
  if (fullPath.length == 0) {
    pmd.raiseError('All ' + objName + ' must have a fully qualified path');
  }
  else if (!fs.existsSync(path.resolve(fullPath))) {
    pmd.raiseError(objName + ': ' + fullPath + ' does not exist');
  }
}// validatePathRef


/**
 * Processes a PL/SQL file to extract the JavaDoc contents
 *
 * @param file object {path} is required
 * @return JSON object with the JavaDoc entites
 */
pmd.processFile = function (file) {
  var
    content = {}
    ;

  debug.log('\nProcessing:', file.path);

  content.data = fs.readFileSync(file.path, 'utf8');
  content.json = [...dox.parseComments(content.data, { filename: file.path })];
  for (const comment of content.json) {
    console.log('comment', { code: comment.code.toString(), nodes: JSON.stringify(comment.nodes.map(x => x.toString())) })
  }

  content.entities = []; //Holds list of entities for the object

  for (const comment of content.json) {
    const entity = {
      author: '',
      variables: [],
      exceptions: [],
      created: '',
      examples: [],
      return: '',
      visibility: 'public', // assume
      isPrivate: false,
      description: '',
      params: [],
      throws: [],
      // typeDesc:[], // TODO mdsouza: better name for this
      code: '',
      issues: [],
      name: '',
      type: '',
      links: [],
      types: [], // For package types (used by @type)
      annotations: [] // misc annotations (e.g. @commits)
    },
      tagConstants = [], //temp array for tag with the name of @constant
      tagTypes = [], //temp array for tag with the name of @type
      variables = [], //temp array for variables with the name of @var
      exceptions = []//temp array for exceptions with the name of @exception
      ;

    if (comment.ignore) {
      debug.log('Ignoring:', comment.context);
      continue; // Skip this loop since ignoring
    }

    // If a file doesn't contain any JavaDoc or random block of comments comment.context will be null
    if (comment.context) {
      Object.assign(entity, comment.context)
    }
    else {
      // debug.log('Incorrectly parsed entry:', jsonDataTokens);
      continue; // Skip this loop since we dont know what this is
    }

    comment.tags.forEach(function (tag) {
      switch (tag.kind) {

        case 'public':
        case 'private':
        case 'protected':
        case 'internal':
        case 'api':
          // visibility
          entity.visibility = tag.visibility
          entity.isPrivate = entity.visibility === 'private'
          break
        case 'description':
          if (tag.content) {
            console.assert(!entity.description, 'oops two descriptions hohoho')
            entity.description = new Description(tag.content)
          }
          break
        case 'author':
          entity.author = tag.content
          break;
        case 'created':
          entity.created = tag.content
          break;
        case 'example':
          entity.examples.push(tag.content)
          break;
        // Future: Devnotes
        // case 'devnotes':
        //   myMethod.devNotes = tag.description;
        //   break;
        case 'ignore':
          debug.log('TODO Ignore: ', ignore);
          break;
        case 'issue':
          //This will parse the current issue to be <issue reference> | <issue description>
          if (match = /^\s*([\S]+)\s*(.*)/.exec(tag.content?.toString())) {
            entity.issues.push({
              number: match[1].replace(/^#+/, ''), //Remove any leading hashes to get the ticket number
              description: match[2]
            })
          }
          break;
        case 'param':
          {
            const param = entity.params.find(p => p.name === tag.name || p.id === tag.name)
            console.assert(param, tag.syntax.start, 'we probably don\'t want to generate params')
            if (param) {
              param.description = tag.content
            } else {
              entity.params.push({
                name: tag.name,
                description: tag.content
              });
            }
          }
          break;
        case 'throws':
          entity.throws.push({
            description: tag.content.toString().replace(/(^<p>|<\/p>$)/g, '').replace(/(<em>|<\/em>)/g, '')
          });
          break;
        case 'return':
        case 'returns':
          if (!entity.return) {
            console.warn('we probably might want to generate a return?')
            entity.return = {}
          }
          entity.return.description = tag.content
          break;
        case 'constant':
        case 'var':
        case 'type':
        case 'exception':
          //This will parse the current issue to be <issue reference> | <issue description>
          if (match = /^\s*([\S]+)\s*(.*)/.exec(tag.content.toString())) {
            var tempData = {
              name: match[1],
              description: match[2]
            };
          }

          if (tag.type === 'type') {
            tagTypes.push(tempData);
          } else if (tag.type === 'constant') {
            tagConstants.push(tempData);
          } else if (tag.type === 'var') {
            variables.push(tempData);
          } else if (tag.type === 'exception') {
            exceptions.push(tempData);
          }

          break;
        case 'see':
        case 'seealso':
          entity.links.push(tag)
          break

        case 'commits':
          entity.annotations.push('commits')
          break
        default:
          console.warn('not handling tag', { kind: tag.kind }, 'for', entity)
          break
      }//switch
    })// jsonData.tags.forEach

    entity.code = comment.code?.toString()


    if (entity.code && entity.type === pmd.DOCTYPES.EXCEPTIONS) {
      entity.exceptions = comment.context.exceptions;

      // Loop over exceptions to see if there's one for this exceptionName
      for (var exception of entity.exceptions) {
        exception.isPrivate = entity.isPrivate;

        exceptions.forEach(function (exceptionType) {
          if (exception.name === exceptionType.name) {
            exception.description = exceptionType.description
          }
        });//tagExceptions.forEach

        // Fallback description from the entity
        exception.description ??= entity.description?.full ?? ''
      }// entity.exceptions
    }//entity.code && entity.type === pmd.DOCTYPES.EXCEPTIONS


    content.entities.push(entity);
  }; // content.json.forEach

  return content.entities;
}// processFile

/**
 * Returns the arguments JSON objects
 * Handles validation that all arguments are passed in
 *
 * @param process process object from calling function
 * @return arguments JSON object
 */
pmd.getArguments = function (process) {
  var
    args = process.argv.slice(2), // Array of arguments
    arguments = {
      project: args[0],
      config: args[1]
    }
    ;

  // Validation and Data Load
  if (args.length === 0) {
    pmd.raiseError('To run call: node app <project>', false);
  }
  // Check that config file exists
  if (!fs.existsSync(path.resolve(__dirname + '/../', 'config.json'))) {
    pmd.raiseError('config.json must be present. TODO run generateConfig.js to generate default');
  }

  return arguments;
}//getArguments


pmd.readFolder = function (objs, config, folder) {
  const files = fs.readdirSync(path.resolve(folder.source.path))

  files.forEach(function (fileName) {
    const childSourcePath = path.join(folder.source.path, fileName)
    const stats = fs.lstatSync(childSourcePath);

    if (stats.isDirectory()) {
      // Deep clone the old folder object with the new source path.
      // Keep literally everything else though.
      var childFolder = {
        ...folder,
        source: {
          ...folder.source,
          path: childSourcePath
        },
      }
      console.assert(childFolder.source.path !== folder.source.path)

      pmd.readFolder(objs, config, childFolder);
    }
  });

  // Create and wipe debug folder
  if (config.debug) {
    // Will create (if not exists) and wipe
    fs.emptyDirSync(path.resolve(__dirname, 'debug'));
  }//config.debug

  for (var i in files) {
    var
      file = {
        ext: '',
        name: '',
        path: ''
      },
      data = {
        /** @type {PlsqlName} */
        name: null,
        types: [],
        constants: [],
        methods: [],
        variables: [],
        files: [],
        exceptions: [],
        projectDispName: config.projectDispName
      },
      markdown,
      entities,
      skipFile = false //Skips the current file if no JavaDoc detected
      ;

    if (!folder.source.fileFilterRegexp instanceof RegExp || folder.source.fileFilterRegexp.test(files[i])) {

      let docExtName = path.extname(folder.template);

      // These are probably all you'll want; however: in case filenames have more extensions due to either
      //  a) schema.object, or
      //  b) object.TYPE.sql (e.g. object.pkg.sql, object.pkgb.sql)
      // we want those too.
      file.name = files[i]
      file.ext = path.extname(files[i]);
      file.base = path.basename(files[i], file.ext);

      file.path = path.resolve(folder.source.path, files[i]);
      file.docFileName = file.base + docExtName;

      entities = pmd.processFile(file, debug);

      if (!entities) {
        skipFile = true;
      }
      else {
        // Load the data arrays with appropriate fields
        entities.forEach(function (entity) {
          switch (entity.kind) {
            case pmd.DOCTYPES.FUNCTION:
            case pmd.DOCTYPES.PROCEDURE:
            case pmd.DOCTYPES.METHOD:
            case pmd.DOCTYPES.CURSOR:
              data.methods.push(entity);
              break;
            case pmd.DOCTYPES.RECORD:
            case pmd.DOCTYPES.COLLECTION:
            case pmd.DOCTYPES.SUBTYPE:
              data.types.push(entity)
              break;
            case pmd.DOCTYPES.CONSTANT:
              data.constants.push(entity)
              break;
            case pmd.DOCTYPES.VARIABLE:
              data.variables.push(entity)
              break;
            case pmd.DOCTYPES.EXCEPTIONS:
              data.exceptions = data.exceptions.concat(entity.exceptions);
              break;
            case undefined:
              debug.log('\nFile:', files[i], "doesn't appear to have any JavaDoc in it. Skipping");
              skipFile = false;
              break;
            case pmd.DOCTYPES.GLOBAL:
            case pmd.DOCTYPES.PACKAGE:
            case pmd.DOCTYPES.TYPE:
              data.global ??= entity;
              data.name ??= entity.name
              break;
            default:
              debug.log('entity', entity);
              console.warn('Unknown kind: ', entity.kind);
              // process.exit();
              break;
          }//switch
        });//entities.forEach
      }//else

      if (skipFile) {
        continue; // Skip this loop iteration
      }

      // Output JSON and md data
      if (config.debug) {
        debug.logFile(file.base + file.ext + '.json', JSON.stringify(data, null, '  '));
      }

      // Final defaults
      data.name ??= file.base;

      // Change the docFileName to be based on a template, if desired.
      // Parameters will be
      //  - ext (the doc extension, .md)
      //  - owner (a PL/SQL identifier part)
      //  - name (a PL/SQL identifier part)
      //  - source (the source file, in case that is helpful)
      if (folder.output.compiledTemplate) {
        file.docFileName = folder.output.compiledTemplate({
          ...data.name,
          ext: docExtName,
          source: file,
        })
      }

      data.docFileName = file.docFileName


      objs.push(
        {
          fileData: data,
          template: folder.compiledTemplate,
          folder: folder
        }
      );
    }//if regexp pass or no regexp
  }// for i in files
}

/**
 * Generates the data based on the files
 *
 * @param config Config JSON
 * @return objs array
 */
pmd.generateData = function (config) {
  var objs = [];
  var indexData = [];


  config.folders.forEach(function (folder) {
    pmd.readFolder(objs, config, folder);
  }); //config.folders.forEach

  // make the indexData available to all files
  // remove duplicates from indexData
  objs.forEach(function (obj) {
    obj.fileData.files = indexData.filter(function (item, pos, ary) {
      return !pos || item.name != ary[pos - 1].name;
    });
  }); // objs.forEach

  return objs;
}//pmd.generateData


/**
 * Merge files (based on duplicate file names). Ex pks and pkb
 * Order is arbitrary
 *
 * @param objs Array of all the objects
 * @return Merged array
 */
pmd.mergeObjs = function (objs) {
  objs.forEach(function (obj, i) {
    //Seach for a matching element
    var
      data = obj.fileData,
      relatedData // Holds any
      ;

    // Loop over array but starting at next element
    for (var j = i + 1; j < objs.length; j++) {
      if (objs[j].fileData.name === data.name) {
        debug.log('Found matching entity:', objs[j].fileData.name);
        relatedData = objs[j].fileData;
        // Drop this entity as we'll merge it
        objs.splice(j, 1);
        break;
      }// if
    }

    // Merge data
    if (relatedData) {
      data.constants = data.constants.concat(relatedData.constants);
      data.types = data.types.concat(relatedData.types);
      data.variables = data.variables.concat(relatedData.variables);
      data.exceptions = data.variables.concat(relatedData.exceptions);

      data.methods.forEach(function (myData) {
        relatedData.methods.forEach(function (myRelatedElement, j) {
          if (myData.name === myRelatedElement.name) {
            debug.log('Deleting common method:', myData.name);
            delete relatedData.methods[j];
          }
        });
      })// data.forEach

      //Merge methods
      // Tried to use:
      // data.methods = extend(true, {}, data.methods, relatedData.methods);
      // But was merging them based on array position rather than merge
      // Do a custom merge
      relatedData.methods.forEach(function (method) {
        data.methods.push(method);
      });

    }// relatedData

    objs[i].fileData = data;
  }); //objs.forEach

  return objs;
}// pmd.mergeObjs


/**
 * Saves data to files
 *
 * @param objs array of all data
 */
pmd.saveToFile = function (config, objs) {
  // Finally print out data
  objs.forEach(function (obj) {
    obj.fileData.files = pmd.globalFiles;

    var markdown = obj.template(obj.fileData);

    if (debug.debug) {
      debug.logFile(obj.fileData.docFileName, markdown);
    }

    const outFullName = path.resolve(obj.folder.output.path, obj.fileData.docFileName)
    const outDir = path.dirname(outFullName)

    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir)
    }

    fs.writeFileSync(outFullName, markdown);
  });
}//saveToFile

/**
 * Generates Table of Conents (TOC)
 *
 * @issue 12: Original issue
 *
 * @params config
 * @params objs array of objs
 */
pmd.generateToc = function (config, objs) {
  // #12 Generate Index file.
  if (config.toc.template) {
    debug.log('\nCreated TOC');
    var
      indexData = {
        files: [],
        projectDispName: config.projectDispName
      };

    objs.forEach(function (obj) {
      var file = {};
      file.docFileName = obj.fileData.docFileName;
      file.name = obj.fileData.name.toString();

      indexData.files.push(file);
    })//objs.forEach

    // Sort based on names
    // http://stackoverflow.com/questions/979256/sorting-an-array-of-javascript-objects
    // Remove duplicates from array, as array was already sorted
    // http://stackoverflow.com/questions/9229645/remove-duplicates-from-javascript-array
    indexData.files.sort(function (a, b) {
      return a.name.localeCompare(b.name);
    }).filter(function (item, pos, ary) {
      return !pos || item != ary[pos - 1];
    });

    const templateContent = fs.readFileSync(path.resolve(config.toc.template), 'utf8')
    const compiledTemplate = Handlebars.compile(templateContent);
    const markdown = compiledTemplate(indexData);

    pmd.globalFiles = indexData.files;

    fs.writeFileSync(path.resolve(config.folders[0].output.path, config.toc.fileName), markdown);
  }//config.templates.index
}// generateToc


module.exports = function (pDebug, pExtend) {
  debug = pDebug;
  extend = pExtend;
  return pmd;
}
