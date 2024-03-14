// This is the custom package for PLSQL to MD
var debug
const path = require('path')
const { DocumentGenerator } = require('./dox.js');
const { Description } = require('./comment.js');
const Handlebars = require('handlebars');
const dox = new DocumentGenerator()

/** @typedef {import("./plsql/syntax.js").PlsqlName} PlsqlName */

const pmd = {};


// Constants
pmd.DOCTYPES = {
  FUNCTION: 'function',
  PROCEDURE: 'procedure',
  PACKAGE: 'package',
  TYPE: 'type',
  CONSTRUCTOR: 'constructor',
  METHOD: 'method',
  CURSOR: 'cursor',
  RECORD: 'record',
  COLLECTION: 'collection',
  CONSTANT: 'constant',
  VARIABLE: 'variable',
  PRAGMA: 'pragma',
  ATTRIBUTE: 'attribute',
  SUBTYPE: 'subtype',
  EXCEPTION: 'exception',
  GLOBAL: 'global'
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

class UnitData {
  /** @type {PlsqlName} */
  name = null
  /** @type {string?} */
  kind = null
  /** @type {Description?} */
  description = null
  types = []
  constants = []
  methods = []
  variables = []
  exceptions = []
  files = []
  projectDispName = null

  /**
   * Sort all members of this type.
   */
  sort() {
    this.types.sort((a, b) => a.name.localeCompare(b.name))
    this.constants.sort((a, b) => a.name.localeCompare(b.name))
    this.methods.sort((a, b) => a.id.localeCompare(b.id))
    this.variables.sort((a, b) => a.name.localeCompare(b.name))
    this.exceptions.sort((a, b) => a.name.localeCompare(b.name))
  }
}

/**
 * @typedef {HandlebarsTemplateDelegate<any>} Template
 *
 * @typedef UnitObject
 * @property {UnitData} fileData
 * @property {Template} template
 * @property {Folder} folder
 */


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
    debug.log('comment', { code: comment.code.toString(), nodes: JSON.stringify(comment.nodes.map(x => x.toString())) })
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
      includes: [], // LATER
      types: [], // For package types (used by @type)
      annotations: [], // misc annotations (e.g. @commits, @deprecated)
      remarks: []
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
          entity.visibility = tag.value
          entity.isPrivate = entity.visibility === 'private'
          break
        case 'description':
          if (tag.content) {
            // If there is more than one description, concatenate them.
            entity.description = Description.concat(entity.description, tag.content)
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
            if (param) {
              param.description = tag.content
            } else {
              if (tag.name) {
                console.info(`${tag.syntax.start} @param not found: ${tag.name}`, tag);
              } else {
                console.info(`${tag.syntax.start} @param found, but it does not have a name`, tag);
              }
            }
          }
          break;
        case 'throws':
          entity.throws.push({
            name: tag.name,
            description: tag.content
          });
          break;
        case 'return':
        case 'returns':
          if (entity.return) {
            entity.return.description = tag.content
          } else {
            console.info(`${tag.syntax.start} Found return for ${entity.type} ${entity.id}.  Skipping`)
          }
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
        case 'include':
          entity.includes.push(tag)
          break

        case 'remarks':
          entity.remarks.push(tag.content)
          break
        case 'commits':
        case 'deprecated':
          entity.annotations.push(tag.kind)
          break
        default:
          console.warn('not handling tag', { kind: tag.kind }, 'for', entity)
          break
      }//switch
    })// jsonData.tags.forEach

    entity.code = comment.code?.toString()

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


/**
 *
 * @param {UnitObject[]} objs
 * @param {Config} config
 * @param {Folder} folder
 */
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

  for (const sourceFile of files) {
    const file = {
      ext: '',
      name: '',
      path: ''
    }
    const data = new UnitData()
    data.projectDispName = config.projectDispName
    let entities;
    let skipFile = false //Skips the current file if no JavaDoc detected

    if (folder.source.fileFilterRegexp instanceof RegExp && !folder.source.fileFilterRegexp.test(sourceFile)) {
      return
    }

    let docExtName = path.extname(folder.template);

    // These are probably all you'll want; however: in case filenames have more extensions due to either
    //  a) schema.object, or
    //  b) object.TYPE.sql (e.g. object.pkg.sql, object.pkgb.sql)
    // we want those too.
    file.name = sourceFile
    file.ext = path.extname(file.name);
    file.base = path.basename(file.name, file.ext);

    file.path = path.resolve(folder.source.path, file.name);
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
          case pmd.DOCTYPES.CONSTRUCTOR:
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
          case pmd.DOCTYPES.ATTRIBUTE:
            data.variables.push(entity)
            break;
          case pmd.DOCTYPES.EXCEPTION:
            data.exceptions.push(entity)
            break;
          case undefined:
            debug.log('\nFile:', sourceFile, "doesn't appear to have any JavaDoc in it. Skipping");
            skipFile = false;
            break;
          case pmd.DOCTYPES.GLOBAL:
          case pmd.DOCTYPES.PACKAGE:
          case pmd.DOCTYPES.TYPE:
            data.global ??= entity;
            data.name ??= entity.name
            data.kind ??= entity.kind
            data.description ??= entity.description
            break;
          default:
            debug.log('entity', entity);
            console.warn('Unknown kind: ', entity.kind, entity.name ?? entity.code);
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
        owner: data.name?.owner?.toString('FILE'),
        name: data.name?.name?.toString('FILE'),
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
  }// for i in files
}

/**
 * Generates the data based on the files
 *
 * @param {Config} config Config JSON
 * @return {{UnitObject[]}} objs array
 */
pmd.generateData = function (config) {
  const /** @type {UnitObject[]} */ objs = [];
  const indexData = [];


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
 * @param {UnitObject[]} objs Array of all the objects
 * @return {UnitObject[]} Merged array
 */
pmd.mergeObjs = function (objs) {
  objs.forEach(function (obj, i) {
    //Seach for a matching element
    const data = obj.fileData
    let relatedData // Holds any

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
      data.exceptions = data.exceptions.concat(relatedData.exceptions);

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

    data.sort()

    objs[i].fileData = data;
  }); //objs.forEach

  return objs;
}// pmd.mergeObjs


/**
 * Saves data to files
 *
 * @param {UnitObject[]} objs array of all data
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
      const file = {
        docFileName: obj.fileData.docFileName,
        name: obj.fileData.name.toString()
      }

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
