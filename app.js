// @ts-check
const path = require('path')
const fs = require('./lib/fs.js')
const Handlebars = require('./lib/handlebars.js')
const extend = require('node.extend')
const console = require('./lib/debug')
const pmd = require('./lib/pmd.js')

// Handle parameters
const arguments = pmd.getArguments(process);

const defaultConfig = require('./default.json'),
  defaultConfigFolder = require('./defaultFolder.json'),
  userConfig = require(arguments.config)
  ;

// Check that project exists in config.
if (!userConfig[arguments.project]) {
  pmd.raiseError('Can not find project: ' + arguments.project + ' in config.json');
}

/**
 * @typedef {import("./lib/config").Config} Config
 * @typedef {import("./lib/config").Folder} Folder
 */

/** @type {Config} */
const config = extend(true, {}, defaultConfig, userConfig[arguments.project]);


console.debug = config.debug;
console.setup();

// #10
if (config.projectDispName.trim().length === 0) {
  config.projectDispName = arguments.project;
}

console.log('config: ', config);

// If only one folder (i.e. not an array), covert to array
if (!Array.isArray(config.folders)) {
  config.folders = [config.folders];
}

// Apply the default config to each element
config.folders.forEach(function (folder, key) {
  folder = extend(true, {}, defaultConfigFolder, folder)

  // Convert the regexp into a regexp object
  if (folder.source.fileFilterRegexp && typeof folder.source.fileFilterRegexp === 'string') {
    folder.source.fileFilterRegexp = new RegExp(folder.source.fileFilterRegexp, 'i');
  }

  // Check that template exists
  pmd.validatePathRef(folder.template, 'template');
  // @ts-ignore LATER: readFileSync
  folder.templateContent = fs.readFileSync(path.resolve(folder.template), 'utf8');
  folder.compiledTemplate = Handlebars.compile(folder.templateContent)
  if (!folder.compiledTemplate) {
    throw new Error("Template failed to compile")
  }


  // Check that the srcPath exists
  pmd.validatePathRef(folder.source.path, 'folder.source.path');

  // Check if output path is defined
  if (folder.output.path.length == 0) {
    pmd.raiseError('folder.output.path is required', true);
  }

  // Create outputPath if doesn't exist
  // @ts-ignore LATER: ensureDirSync
  fs.ensureDirSync(path.resolve(folder.output.path));

  // #11 Delete if told to
  if (folder.output.delete) {
    // @ts-ignore LATER: emptyDirSync
    fs.emptydirSync(path.resolve(folder.output.path));
  }

  if (folder.output.template) {
    folder.output.compiledTemplate = Handlebars.compile(folder.output.template, { noEscape: true })
  }

  config.folders[key] = folder;

});// config.folders.forEach

if (config.toc.template) {
  pmd.validatePathRef(config.toc.template, 'config.toc.template');
}

// Object.entries(Handlebars.helpers).forEach(a => console.log(...a))

// Process data and write to file
var objs = [...pmd.generateData(config)];
objs = pmd.mergeObjs(objs, config.options);

// First generate the TOC than the files, so the packages also have a TOC
pmd.generateToc(config, objs);
pmd.saveToFile(config, objs);
pmd.copyResources(config)
