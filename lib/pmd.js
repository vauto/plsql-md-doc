// This is the custom package for PLSQL to MD
const path = require('path')
const console = require('./debug').child(__filename)
const { DocumentGenerator } = require('./dox.js');
const { Comment, Description, CodeContext, LinkTag } = require('./comment.js');
const Handlebars = require('handlebars');
const { PlsqlUnitName } = require('./plsql/name.js');
const { mustBeObject } = require('./guards');
const dox = new DocumentGenerator()

/**
 * @typedef {import("./name").ItemName} ItemName
 * @typedef {import("./config").Config} Config
 * @typedef {import("./config").Folder} Folder
 * @typedef {import("./config").Options} Options
 * @typedef {import('handlebars').TemplateDelegate} TemplateDelegate
 */

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
  FIELD: 'field',
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

/**
 * @template {Diffable<TDiffable>} TDiffable
 */
class Diffable {
  /**
   * @typedef {{[key: string]: {added: any?, changed: any?, deleted: any?}}} DiffResult
   * @param {TDiffable} other
   * @returns {DiffResult}
   */
  static diff(other) {
    if (!other) {
      return { deleted: this }
    } else if (this === other) {
      return {}
    }

    const /** @type {DiffResult} */ result = {}
    const keys = new Set(Object.keys(this).concat(Object.keys(other)))
    for (const key of keys) {
      const [thisValue, otherValue] = [this[key], other[key]]
      if (thisValue === otherValue) continue

      switch (typeof thisValue) {
        case 'object':
          if (thisValue === null) {
            result[key] = { added: otherValue }
          } else if (thisValue.diff) {
            const resultValue = thisValue.diff(otherValue)
            if (resultValue) {
              result[key] = resultValue
            }
          } else if (thisValue instanceof Array && otherValue instanceof Array) {
            // ASSUMPTION: only deletes
            const resultValue = {
              added: otherValue.filter(item => thisValue.indexOf(item) === -1),
              deleted: thisValue.filter(item => otherValue.indexOf(item) === -1)
            }

            if (resultValue.added.length > 0 || resultValue.deleted.length > 0) {
              result[key] = resultValue
            }
            // otherwise they are equal
          } else {
            result[key] = Diffable.diff.call(thisValue, otherValue)
          }
          continue

        case 'number':
          if (isNaN(thisValue) && isNaN(otherValue)) continue; // please no NaN
          break
      }

      result[key] = { changed: [thisValue, otherValue] }
    }

    return result
  }
}

/** @extends {Array<Entity>} */
class EntityGroup extends Array {

  /** @type {string} */ name
  /** @type {Description} */ description
  /** @type {string[]} */ kind = []

  constructor(name, description) {
    super()
    this.name = name
    this.description = description
  }

  /** @overload */
  push(...items) {
    const result = super.push(...items)
    this.kind = this.#calculateKind()
    return result
  }

  #calculateKind() {
    switch (this.length) {
      case 0:
        return []
      case 1:
        return [this[0].kind]
      default:
        // NOTE: because we group by name, we can mix procedures and functions.
        // Oracle actually spells out "Function and Procedure" if there are overloads of both.
        // It also pluralizes.
        const kinds = this.reduce((agg, item) => { agg[item.kind]++; return agg }, { 'procedure': 0, 'function': 0 })

        const result = []
        switch (kinds.function) {
          case 0:
            break
          case 1:
            result.push('function')
            break
          default:
            result.push('functions')
            break
        }
        switch (kinds.procedure) {
          case 0:
            break
          case 1:
            result.push('procedure')
            break
          default:
            result.push('procedures')
            break
        }

        return result
    }
  }
}

/**
 * @typedef {CodeContext} Entity
 * @typedef {[name: string]: Entity[] }
 */

/**
 * @implements {Iterable<Entity[]>}
 * @implements {Diffable<EntityLookup>}
 * Collection that groups entities by name.
 */
class EntityLookup {
  /** @type {{[name: string]: EntityGroup }} */
  #groups

  /**
   * @param {Entity[][]?} other
   */
  constructor(other = undefined) {
    if (other) {
      this.#groups = Object.fromEntries(other.map(value => [value.name, value]))
    } else {
      this.#groups = {}
    }
  }

  /**
   *
   * @param  {...Entity} items
   * @return {number}
   */
  push(...items) {
    for (const item of items) {
      const { name, description } = item
      const forName = this.#groups[name] ??= new EntityGroup(name, description)
      forName.push(item)
    }

    return items.length
  }

  /**
   * @returns {Iterator<Entity[]>}
   */
  [Symbol.iterator]() {
    return Object.entries(this.#groups).sort((([ak], [bk]) => ak.localeCompare(bk))).map(([_, v]) => v)[Symbol.iterator]()
  }

  /**
   * @param {(value: Entity[] => boolean)} predicate
   */
  filter(predicate) {
    return new EntityLookup([...this].filter(group => {
      const result = group.filter(predicate)
      if (result.length === 0) {
        return undefined
      }
      const { name, description } = group
      return Object.assign(result, { name, description })
    }))
  }

  /**
   * @param {(value: Entity, index: number) => void} callbackFn
   * @param {any} thisArg
   */
  forEach(callbackFn, thisArg) {
    Object.values(this.#groups).flat().forEach(callbackFn, thisArg)
  }

  /**
   *
   * @param {EntityLookup} other
   * @returns
   */
  diff(other) {
    if (!other) {
      return { deleted: this }
    }
    return Diffable.diff.call(this.#groups, other.#groups)
  }
}

/**
 * @implements {Diffable<UnitData>}
 */
class UnitData {
  /** @type {ItemName} */
  name = null
  /** @type {string?} */
  kind = null
  /** @type {Description?} */
  description = null
  /** @type {Entity[]} */
  types = []
  /** @type {Entity[]} */
  constants = []
  methods = new EntityLookup()
  /** @type {Entity[]} */
  variables = []
  /** @type {Entity[]} */
  exceptions = []
  files = []
  projectDispName = null
  annotations = []
  links = []

  /**
   * Sort all members of this type.
   */
  sort() {
    this.types.sort((a, b) => a.name.localeCompare(b.name))
    this.constants.sort((a, b) => a.name.localeCompare(b.name))
    // methods: these sort automatically
    this.variables.sort((a, b) => a.name.localeCompare(b.name))
    this.exceptions.sort((a, b) => a.name.localeCompare(b.name))
  }

  /**
   * @param {Options} options
   * @returns {UnitData} a filtered instance
   */
  filter(options) {
    mustBeObject(options, 'options')

    /**
     * @typedef {(value: Entity) => boolean} EntityFilterDelegate
     * @type {EntityFilterDelegate[]}
     */
    const filters = []
    if (!options.includePrivateMembers) {
      filters.push(entity => entity.visibility !== "private")
    }

    if (filters.length === 0) {
      // nothing to filter
      return this
    }

    const clone = Object.assign(new UnitData(), this);

    [clone.types, clone.constants, clone.methods, clone.variables, clone.exceptions]
      = [clone.types, clone.constants, clone.methods, clone.variables, clone.exceptions]
          .map(array => array.filter(entity => filters.every(filter => filter(entity))))

    return clone
  }

  diff = Diffable.diff
}

/**
 * @typedef UnitObject
 * @property {UnitData} fileData
 * @property {TemplateDelegate} template
 * @property {Folder} folder
 */

/**
 * Processes a PL/SQL file to extract the JavaDoc contents
 *
 * @param file object {path} is required
 * @return {Entity[]} JSON object with the JavaDoc entites
 */
pmd.processFile = function (file) {
  console.log('\nProcessing:', file.path);

  // Read the data.  Assume UTF-8 or UTF-8-BOM, but strip the BOM.
  const data = fs.readFileSync(file.path, 'utf8').replace(/^\uFEFF/, '')
  const entities = []
  const comments = [...dox.parseComments(data, { filename: file.path })]

  for (const comment of comments) {
    const entity = {
      kind: '',
      name: '',
      textSpan: comment.textSpan,
      examples: [],
      return: '',
      visibility: 'public', // default visibility
      description: '',
      /** @type {Entity[]} */
      params: [],
      throws: [],
      author: '',
      created: '',
      code: '',
      issues: [],
      /** @type {object?} Explicit deprecated node for use in templates, since iterating through "just some" templates is hard */
      deprecated: null,
      /** @type {LinkTag[]} */
      links: [],
      includes: [], // LATER
      annotations: [], // misc annotations (e.g. @commits, @deprecated), also pragmas
      remarks: [],

      get isPrivate() { return this.visibility === 'private' }
    },
      exceptions = []//temp array for exceptions with the name of @exception
      ;

    if (comment.ignore) {
      console.log('Ignoring:', comment.context);
      continue; // Skip this loop since ignoring
    }

    // If a file doesn't contain any JavaDoc or random block of comments comment.context will be null
    if (comment.context) {
      console.assert(comment.context instanceof CodeContext)
      Object.assign(entity, comment.context)
    }
    else {
      // debug.log('Incorrectly parsed entry:', jsonDataTokens);
      continue; // Skip this loop since we dont know what this is
    }

    for (const tag of comment.tags) {
      switch (tag.kind) {

        case 'public':
        case 'private':
        case 'protected':
        case 'internal':
        case 'api':
          // visibility
          entity.visibility = tag.value
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
          console.log('TODO Ignore: ', ignore);
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
            const param = entity.params.find(p => p.id === tag.id)
            if (param) {
              param.description = tag.content
            } else {
              // The param wasn't matched by name
              if (tag.name) {
                console.warn(`${tag.textSpan} @param not found for ${entity.id}: ${tag.id}`, tag);
              } else {
                console.warn(`${tag.textSpan} @param found, but it does not have a name`, tag);
              }
            }
          }
          break;
        case 'since':
          entity.since = tag.content
          break
        case 'throws':
        case 'exception':
          entity.throws.push({
            name: tag.name.text,
            description: tag.content
          });
          break;
        case 'return':
        case 'returns':
          if (entity.return) {
            entity.return.description = tag.content
          } else {
            console.info(`${tag.textSpan} Found return for ${entity.kind} ${entity.id}.  Skipping`)
          }
          break;
        case 'constant':
        case 'var':
        case 'type':
        case 'defaultValue':
          console.warn(tag.kind, `${entity.textSpan} Skipping ignored tag '${tag.kind}'`)
          break;
        case 'see':
        case 'seealso':
          entity.links.push(tag)
          break
        case 'include':
          entity.includes.push(tag)
          break

        case 'remarks':
        case 'notes':
          entity.remarks.push(tag.content)
          break
        // zero-arg, canonical names
        case 'autonomous_transaction':
        case 'commit':
        case 'commits':
        case 'deprecated':
        case 'enum':
        case 'override':
        case 'virtual':
          entity.annotations.push({ name: tag.kind, message: tag.content })
          break
        default:
          console.infoOnce(tag.kind, `${entity.textSpan} not handling tag '${tag.kind}'`, tag, entity)
          break
      }//switch
    }

    // SPECIAL: mark deprecation
    if (entity.annotations.length) {
      entity.deprecated = entity.annotations.find(a => a.name === 'deprecated')
    }

    // SPECIAL: resolve link text
    for (const link of entity.links) {
      if (link.content) continue
      link.content = link.href.toString()
    }

    entity.code = comment.code?.toString()

    entities.push(entity);
  }

  return entities;
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

  for (const fileName of files) {
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
  }

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

    if (folder.source.fileFilterRegexp instanceof RegExp && !folder.source.fileFilterRegexp.test(sourceFile)) {
      continue
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

    // Load the data arrays with appropriate fields
    let count = 0
    for (const entity of pmd.processFile(file)) {
      count++
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
        case pmd.DOCTYPES.GLOBAL:
        case pmd.DOCTYPES.PACKAGE:
        case pmd.DOCTYPES.TYPE:
          data.global ??= entity;
          data.name ??= entity.name
          data.kind ??= entity.kind
          data.header ??= entity.header
          data.description ??= entity.description
          data.annotations.push(...entity.annotations)
          data.deprecated = entity.deprecated
          data.links.push(...entity.links)
          break;
        case pmd.DOCTYPES.PRAGMA:
          // these shouldn't end up out here
          console.warn(entity.kind, entity)
          break;

        case pmd.DOCTYPES.FIELD: {
          const parent = data.types.find(t => t.name === entity.parent.name)
          if (parent) {
            const field = parent.fields.find(f => f.id === entity.id)
            if (field) {
              field.description = Description.concat(field.description, entity.description)
            }
          }
          break
        }
        default:
          console.log('entity', entity);
          console.warn('Unknown kind: ', entity.kind, entity.name ?? entity.code);
          // process.exit();
          break;
      }
    }

    if (count === 0) {
      console.warn('Skipping empty file', file.path)
      continue
    }

    // Output JSON and md data
    if (config.debug) {
      console.logFile(file.base + file.ext + '.json', JSON.stringify(data, null, '  '));
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
      console.assert(data.name instanceof PlsqlUnitName, 'oops')
      const params = {
        owner: data.name?.owner?.toString('FILE'),
        name: data.name?.name?.toString('FILE'),
        ext: docExtName,
        source: file,
      }
      if (params.owner && params.name) {
        file.docFileName = folder.output.compiledTemplate(params)
      } else {
        console.assert(false, 'Missing one or more fields, will not invoke filename template', params)
      }

    }

    data.docFileName = file.docFileName

    objs.push(
      {
        fileData: data,
        template: folder.compiledTemplate,
        folder: folder
      }
    );
  }
}

/**
 * Generates the data based on the files
 *
 * @param {Config} config Config JSON
 * @return {UnitObject[]} objs array
 */
pmd.generateData = function (config) {
  const /** @type {UnitObject[]} */ objs = [];
  const indexData = [];


  for (const folder of config.folders) {
    pmd.readFolder(objs, config, folder);
  }

  // make the indexData available to all files
  // remove duplicates from indexData
  for (const obj of objs) {
    obj.fileData.files = indexData.filter(function (item, pos, ary) {
      return !pos || item.name != ary[pos - 1].name;
    });
  }

  return objs;
}//pmd.generateData


/**
 * Merge files (based on duplicate file names). Ex pks and pkb
 * Order is arbitrary
 *
 * @param {UnitObject[]} objs Array of all the objects
 * @param {Options} options Options to apply
 * @return {UnitObject[]} Merged array
 */
pmd.mergeObjs = function (objs, options) {
  objs.forEach(function (obj, i) {
    //Seach for a matching element
    const data = obj.fileData
    let relatedData // Holds any

    // Loop over array but starting at next element
    for (var j = i + 1; j < objs.length; j++) {
      if (objs[j].fileData.name === data.name) {
        console.log('Found matching entity:', objs[j].fileData.name);
        relatedData = objs[j].fileData;
        // Drop this entity as we'll merge it
        objs.splice(j, 1);
        break;
      }// if
    }

    // Merge data
    if (relatedData) {
      data.constants.push(...relatedData.constants);
      data.types.push(...relatedData.types);
      data.variables.push(...relatedData.variables);
      data.exceptions.push(...relatedData.exceptions);

      for (const method of data.methods) {
        const toRemove = []
        for (const relatedMethod of relatedData.methods) {
          if (method.name === relatedMethod.name) {
            console.log('Deleting common method:', method.name);
            toRemove.push(relatedMethod)
          }
        }

        relatedData.methods.remove(...toRemove)
      }

      relatedData.methods.push(...data.methods)
    }

    data.sort()

    // Apply default description
    const defaultDescription = Description.from(options.defaultDescription)
    if (defaultDescription) {
      data.description ||= defaultDescription
      data.types.forEach(t => t.description ||= defaultDescription)
      data.exceptions.forEach(t => t.description ||= defaultDescription)
      data.constants.forEach(t => t.description ||= defaultDescription)
      data.variables.forEach(t => t.description ||= defaultDescription)
      data.methods.forEach(t => t.description ||= defaultDescription)
    }

    const filteredData = data.filter(options);

    objs[i].fileData = filteredData

    if (data !== filteredData) {
      const diff = data.diff(filteredData)
      console.log(diff)
    }
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
  for (const obj of objs) {
    obj.fileData.files = pmd.globalFiles;

    var markdown = obj.template(obj.fileData);

    if (console.debug) {
      console.logFile(obj.fileData.docFileName, markdown);
    }

    const outFullName = path.resolve(obj.folder.output.path, obj.fileData.docFileName)
    const outDir = path.dirname(outFullName)

    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir)
    }

    fs.writeFileSync(outFullName, markdown);
  }
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
    console.log('\nCreated TOC');
    var
      indexData = {
        files: [],
        projectDispName: config.projectDispName
      };

    for (const obj of objs) {
      const file = {
        docFileName: obj.fileData.docFileName,
        name: obj.fileData.name.toString()
      }

      indexData.files.push(file);
    }

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


module.exports = pmd
