// @ts-check
// This is the custom package for PLSQL to MD
const fs = require('fs-extra')
const path = require('path')
const console = require('./debug').child(__filename)
const { DocumentGenerator } = require('./dox.js');
const { Description, LinkTag, Tag, ParamTag, IncludeTag, VisibilityTag, ThrowsExceptionTag, Annotation } = require('./comment.js');
const Handlebars = require('handlebars');
const { PlsqlUnitName } = require('./plsql/name.js');
const { mustBeInstanceOf } = require('./guards');
const dox = new DocumentGenerator()
const { Entity, UnitEntity } = require("./entity");
const { ContentRenderer } = require('./renderer');
const { pathToFileURL } = require('url');

/**
 * @typedef {import('./entity').DiffResult} DiffResult
 * @typedef {import("./name").ItemName} ItemName
 *
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
  CONSTANT: 'constant',
  VARIABLE: 'variable',
  PRAGMA: 'pragma',
  FIELD: 'field',
  ATTRIBUTE: 'attribute',
  SUBTYPE: 'subtype',
  EXCEPTION: 'exception'
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
 * @typedef UnitObject
 * @property {UnitEntity} unit
 * @property {TemplateDelegate} template
 * @property {Folder} folder
 */


/**
 * @param {Entity} entity
 * @param {Tag} tag
 * @returns {void}
 */
pmd.applyTag = function (entity, tag) {
  switch (tag.kind) {
    case 'param':
      {
        mustBeInstanceOf(tag, ParamTag)
        const param = entity.params.find(p => p.id === tag.id)
        if (param) {
          param.descriptionTags.push(tag)
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

    case 'return':
    case 'returns':
      if (entity.return) {
        entity.return.descriptionTags.push(tag)
      } else {
        console.info(`${tag.textSpan} Found return for ${entity.kind} ${entity.id}.  Skipping`)
      }
      break;

    case 'api':
    case 'public':
    case 'private':
    case 'protected':
    case 'internal':
    case 'package':
      // visibility
      mustBeInstanceOf(tag, VisibilityTag)
      entity.visibility = tag.value
      break

    // Single-line content
    case 'author':
      entity.authorTag = tag
      break;
    case 'created':
      entity.createdTag = tag
      break;
    case 'since':
      entity.sinceTag = tag
      break

    // Multi-line content
    case 'description':
      entity.descriptionTags.push(tag)
      // if (tag) {
      //   // If there is more than one description, concatenate them.
      //   entity.description = Description.concat(entity.description, tag)
      // } else {
      //   console.warn('no content text', tag)
      // }
      break

    case 'example':
      entity.examples.push({
        number: entity.examples.length + 1,
        descriptionTag: tag
      })
      break;

    case 'notes':
    case 'remarks':
      entity.remarkTags.push(tag)
      break

    case 'see':
    case 'seealso':
      mustBeInstanceOf(tag, LinkTag)
      entity.linkTags.push(tag)
      break

    case 'include':
      mustBeInstanceOf(tag, IncludeTag)
      entity.includeTags.push(tag)
      break

    // inheritdoc: LATER: implement

    case 'throws':
    case 'exception':
      mustBeInstanceOf(tag, ThrowsExceptionTag)
      entity.throws.push({
        name: tag.name.text,
        descriptionTag: tag
      });
      break;

    case 'issue':
      //This will parse the current issue to be <issue reference> | <issue description>
      // FIXME
      console.warn('issue not supported at this time')
      entity.issueTags.push(tag)
      // const match = /^\s*([\S]+)\s*(.*)/.exec(contentText)
      // if (match) {
      //   entity.issues.push({
      //     number: match[1].replace(/^#+/, ''), //Remove any leading hashes to get the ticket number
      //     description: match[2]
      //   })
      // }
      break;

    // Annotations
    case 'abstract': // for pseudo-abstract
    case 'autonomous_transaction':
    case 'commit':
    case 'commits':
    case 'deprecated':
    case 'enum':
    case 'override': // for pseudo-override
    case 'virtual': // for pseudo-virtual
      entity.annotations.push(new Annotation(tag, entity.context))
      break

    // link/link*: these are inline, will not show up here

    default:
      console.infoOnce(tag.kind, `${entity.textSpan} not handling tag '${tag.kind}'`, tag, entity)
      break
  }//switch
}



/**
 * Processes a PL/SQL file to extract the JavaDoc contents
 *
 * @param {FileInfo} file
 * @returns {Generator<Entity>} A sequence of objects representing the resolved PL/SQL units and members.
 * @generator
 * @yields {Entity}
 */
pmd.readEntitiesFromFile = function* (file) {
  console.log('\nProcessing:', file.path);

  // Read the data.  Assume UTF-8 or UTF-8-BOM, but strip the BOM.
  const data = fs.readFileSync(file.path, 'utf8').replace(/^\uFEFF/, '')
  const comments = [...dox.parseComments(data, { filename: file.path })]

  for (const comment of comments) {
    const entity = new Entity(comment)
    for (const tag of comment.tags) {
      pmd.applyTag(entity, tag)
    }

    // SPECIAL: resolve link text
    for (const link of entity.linkTags) {
      if (link.content) continue
      console.assert(false, 'we still doing this?')
      link.content = link.href ? [link.href.toString()] : []
    }

    entity.code = comment.code?.toString()
    yield entity
  }

}// processFile


/**
 * Processes a PL/SQL file to extract the JavaDoc contents unit-by-unit.
 *
 * @param file object {path} is required
 * @returns {Generator<UnitEntity>} A sequence of objects representing the resolved PL/SQL units and members.
 * @generator
 * @yields {UnitEntity}
 */
pmd.readUnitsFromFile = function* (file) {
  let /** @type {UnitEntity?} */ unit = null
  let /** @type {Array<Entity>?} */ stack

  for (const entity of pmd.readEntitiesFromFile(file)) {
    if (!entity.context.parent) {
      // Top-level entity.
      // Return the original top-level entity at the top of the hierarchy stack.
      if (unit) {
        yield unit
      }

      // Now start the stack anew with our entity at the top.
      unit = new UnitEntity(entity)
      unit.sourceFileName = file
      stack = [unit]
      continue
    }

    // We have a parent; find it.
    const parentIndex = stack.findLastIndex(ancestor => ancestor.context === entity.context.parent)
    console.assert(parentIndex >= 0, `${entity.path}: ANCESTOR NOT FOUND: ${stack.at(-1)?.path}`, entity.context.parent, stack)

    if (stack.length > parentIndex + 1) {
      stack.length = parentIndex + 1
    }

    const parent = entity.parent = stack.at(-1)
    console.assert(parent && parent.context === entity.context.parent, 'oops parent context')
    stack.push(entity)

    // Add ourselves to the parent properly.
    switch (entity.kind) {
      case pmd.DOCTYPES.METHOD:
        parent.methods.push(entity);
        break;
      case pmd.DOCTYPES.CONSTANT:
        parent.constants.push(entity)
        break;
      case pmd.DOCTYPES.VARIABLE:
      case pmd.DOCTYPES.ATTRIBUTE:
        parent.variables.push(entity)
        break;
      case pmd.DOCTYPES.EXCEPTION:
        parent.exceptions.push(entity)
        break;
      case pmd.DOCTYPES.TYPE:
        // This is a type *inside* another unit (e.g., SUBTYPE or RECORD inside a package).
        parent.types.push(entity)
        break;
      case pmd.DOCTYPES.PRAGMA:
        // these shouldn't end up out here
        console.warn(entity.kind, entity)
        break;

      case pmd.DOCTYPES.FIELD: {
        const field = parent.fields.find(f => f.id === entity.id)
        if (field) {
          field.descriptionTags.push(...entity.descriptionTags)
        } else {
          console.warn('Cannot locate field', field, parent)
        }
        break
      }
      default:
        console.warn('Unknown kind: ', entity.kind, entity.name ?? entity.code);
        break;
    }
  }

  // End of file; return the final unit if there is one.
  if (unit) {
    yield unit
  }
}

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
 * @typedef FileInfo
 * @property {string} ext
 * @property {string} name
 * @property {string} path
 */


/**
 * @param {Config} config
 * @param {Folder} folder
 * @returns {Generator<UnitObject>}
 * @yields {UnitObject}
 */
pmd.readFolder = function* (config, folder) {
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

      yield* pmd.readFolder(config, childFolder);
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

    if (folder.source.fileFilterRegexp instanceof RegExp && !folder.source.fileFilterRegexp.test(sourceFile)) {
      continue
    }

    // These are probably all you'll want; however: in case filenames have more extensions due to either
    //  a) schema.object, or
    //  b) object.TYPE.sql (e.g. object.pkg.sql, object.pkgb.sql)
    // we want those too.
    file.name = sourceFile
    file.ext = path.extname(file.name);
    file.base = path.basename(file.name, file.ext);

    file.path = fs.realpathSync.native(path.resolve(folder.source.path, file.name))


    const /** @type {UnitEntity[]?} */ debugUnits = config.debug ? [] : null

    // Process all children.
    for (const unit of pmd.readUnitsFromFile(file)) {
      console.assert(unit && unit.name instanceof PlsqlUnitName, 'really')
      debugUnits?.push(unit)

      // Change the docFileName to be based on a template, if desired.
      // Parameters will be
      //  - ext (the doc extension, .md)
      //  - owner (a PL/SQL identifier part)
      //  - name (a PL/SQL identifier part)
      //  - source (the source file, in case that is helpful)
      if (folder.output.compiledTemplate) {
        const params = {
          owner: unit.name.owner?.toString('FILE'),
          name: unit.name.name?.toString('FILE'),
          ext: folder.output.ext,
          source: file,
        }

        if (params.owner && params.name) {
          unit.docFileName = folder.output.compiledTemplate(params)
        } else {
          console.assert(false, 'Missing one or more fields, will not invoke filename template', params)
        }
      }


      // If docFileName wasn't set by the template, fallback in order to:
      //  - the entity's name (sanitized for a filename; e.g. `SYS.DBMS_UTILITY.md`)
      //  - the original file name
      if (!unit.docFileName) {
        console.assert(false, 'no docfilename')
        if (unit.name) {
          unit.docFileName = `${unit.name.toString('FILE')}${folder.output.ext}`
        } else if (unit.textSpan.start.line > 1) {
          unit.docFileName = `${file.base}-${unit.textSpan.start.line}${folder.output.ext}`
        } else {
          // 0th file does not say `-0`.
          unit.docFileName = `${file.base}${folder.output.ext}`
        }
      }

      console.assert(unit && unit.docFileName, 'WHY')
      yield {
        unit,
        template: folder.compiledTemplate,
        folder: folder
      }

    }

    // Output JSON and md data
    if (debugUnits) {
      console.logFile(file.base + file.ext + '.json', JSON.stringify(debugUnits, null, '  '));
    }
  }
}

/**
 * Generates the data based on the files
 *
 * @param {Config} config Config JSON
 * @return {Generator<UnitObject>} A sequence of PL/SQL units
 * @yields {UnitObject}
 */
pmd.generateData = function* (config) {
  for (const folder of config.folders) {
    yield* pmd.readFolder(config, folder);
  }
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
    const unit = obj.unit
    let /** @type {UnitEntity?} */ relatedUnit // Holds any unit

    // Loop over array but starting at next element
    for (var j = i + 1; j < objs.length; j++) {
      if (objs[j].unit.name === unit.name) {
        console.log('Found matching entity:', objs[j].unit.name);
        relatedUnit = objs[j].unit;
        unit.merge(relatedUnit)
        // Drop this entity as we have merged it
        objs.splice(j, 1);
        break;
      }// if
    }

    unit.sort()

    const filteredUnit = unit.filter(options);
    console.assert(filteredUnit && filteredUnit.docFileName, 'oops')

    objs[i].unit = filteredUnit

    if (unit !== filteredUnit) {
      const diff = unit.diff(filteredUnit)
      console.log(diff)
    }
  }); //objs.forEach

  return objs;
}// pmd.mergeObjs

/**
 *
 * @param {Entity} entity
 * @param {ContentRenderer} renderer
 */
pmd.renderEntityTags = function (entity, renderer) {
  entity.description = Description.from(renderer.render(...entity.descriptionTags))
  entity.author = renderer.render(entity.authorTag)
  entity.created = renderer.render(entity.createdTag)
  entity.since = renderer.render(entity.sinceTag)
  entity.links = entity.linkTags.map(r => renderer.render(r))
  entity.includes = entity.includeTags.map(r => renderer.render(r))
  entity.remarks = entity.remarkTags.map(r => renderer.render(r))

  for (const annotation of entity.annotations) {
    annotation.message = renderer.render(annotation.messageNode)
  }

  for (const type of entity.types) {
    pmd.renderEntityTags(type, renderer)
  }
  for (const constant of entity.constants) {
    pmd.renderEntityTags(constant, renderer)
  }
  for (const methodGroup of entity.methods) {
    methodGroup.description = Description.from(renderer.render(...methodGroup.descriptionTags))
    for (const method of methodGroup) {
      pmd.renderEntityTags(method, renderer)
    }
  }
  for (const variable of entity.variables) {
    pmd.renderEntityTags(variable, renderer)
  }
  for (const exception of entity.exceptions) {
    pmd.renderEntityTags(exception, renderer)
  }
  if (entity.fields) {
    for (const field of entity.fields) {
      field.description = Description.from(renderer.render(...field.descriptionTags))
    }
  }
  if (entity.params) {
    for (const param of entity.params) {
      param.description = Description.from(renderer.render(...param.descriptionTags))
    }
  }
  if (entity.return) {
    entity.return.description = Description.from(renderer.render(...entity.return.descriptionTags))
  }
  for (const throwItem of entity.throws) {
    throwItem.description = Description.from(renderer.render(throwItem.descriptionTag))
  }
  for (const example of entity.examples) {
    example.description = Description.from(renderer.render(example.descriptionTag))
  }

}

/**
 * Saves data to files
 * @param {Config} config
 * @param {UnitObject[]} objs array of all data
 */
pmd.saveToFile = function (config, objs) {
  // Finally print out data
  for (const { unit, template, folder } of objs) {
    unit.files = pmd.globalFiles;

    const outputRoot = fs.realpathSync.native(path.resolve(folder.output.path))
    const outFullName = path.resolve(outputRoot, unit.docFileName)
    const outDir = path.dirname(outFullName)

    const renderer = new ContentRenderer({
      unitName: unit.name,
      baseURL: pathToFileURL(outFullName)
    })

    pmd.renderEntityTags(unit, renderer)

    /** */
    var markdown = template(unit, {
      data: { renderer }
    });

    if (console.debug) {
      console.logFile(unit.docFileName, markdown);
    }

    fs.ensureDirSync(outDir)
    fs.writeFileSync(outFullName, markdown);
  }
}//saveToFile

/**
 * Generates Table of Conents (TOC)
 *
 * @issue 12: Original issue
 *
 * @param {Config} config
 * @param {UnitObject[]} objs array of objs
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
        docFileName: obj.unit.docFileName,
        name: obj.unit.name.toString()
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

    const tocFileName = path.resolve(config.folders[0].output.path, config.toc.fileName)

    const renderer = new ContentRenderer({
      baseURL: pathToFileURL(tocFileName)
    })

    const templateContent = fs.readFileSync(path.resolve(config.toc.template), 'utf8')
    const compiledTemplate = Handlebars.compile(templateContent);
    const markdown = compiledTemplate(indexData, {
      data: {
        renderer
      }
    });

    pmd.globalFiles = indexData.files;

    fs.writeFileSync(tocFileName, markdown);
  }//config.templates.index
}// generateToc


/**
 * @param {Config} config
 */
pmd.copyResources = (config) => {
  for (const folder of config.folders) {
    for (const resource of folder.resources) {
      const source = path.resolve(resource.source)
      const output = path.resolve(folder.output.path, resource.output)
      fs.copyFileSync(source, output)
    }
  }
}

module.exports = pmd
