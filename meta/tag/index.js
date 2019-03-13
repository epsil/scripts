#!/usr/bin/env node

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');
const yaml = require('js-yaml');
const _ = require('lodash');

/**
 * Help message to display when running with --help.
 */
const helpMessage = `Usage:

    metatag [FILES...]

Example:

    metatag FILE

This launches a text editor for editing the metadata of FILE.

    metatag FILE1 FILE2 FILE3

This launches text editors for editing the metadata of FILE1,
FILE2 and FILE3.

    metatag --tag foo FILE1 FILE2 FILE3

This adds the tag foo to FILE1, FILE2 and FILE3.`;

/**
 * Text editor for editing metadata files.
 */
const editor = 'gvim'; // or emacs?

/**
 * Template string for audio metadata.
 */
const audioTemplate =
  `---
tags:
  - ` + // whitespace
  `
categories:
  - audio`;

/**
 * Template string for image metadata.
 */
const imgTemplate =
  `---
tags:
  - ` + // whitespace
  `
categories:
  - img`;

/**
 * Template string for general metadata.
 */
const defTemplate = `---
tags:
  - `;

/**
 * File extensions for audio files.
 */
const audioExtensions = [
  '.wav',
  '.mp3',
  '.ogg',
  '.aiff',
  '.m4a',
  '.flac',
  '.ape'
];

/**
 * File extensions for image files.
 */
const imgExtensions = [
  '.jpg',
  '.jpeg',
  '.png',
  '.bmp',
  '.gif',
  '.heif',
  '.heic'
];

/**
 * File extensions for YAML files.
 */
const yamlExtensions = ['.yml', '.yaml'];

/**
 * The directory to store metadata files in.
 */
const metaDir = '.meta';

/**
 * The dotfile prefix for metadata files.
 */
const metaPre = '.';

/**
 * The file extension for metadata files.
 */
const metaExt = '.yml';

/**
 * Promise wrapper for `childProcess.exec()`.
 * http://stackoverflow.com/questions/20643470/execute-a-command-line-binary-with-node-js#20643568
 */
const execAsync = util.promisify(childProcess.exec);

/**
 * "Main" function.
 */
function main() {
  const [node, cmd, ...args] = process.argv;
  const files = args;
  const noArgs = !files || files.length === 0;
  const helpArg = files && (files[0] === '--help' || files[0] === '-h');
  if (noArgs || helpArg) {
    help();
    return;
  }
  if (files && files[0] === '--tag') {
    files.shift();
    const tag = files.shift();
    files.forEach(file => {
      setTagForFile(tag, file);
    });
    return;
  }
  editMetadataFileForFiles(files);
}

/**
 * Display help message.
 */
function help() {
  console.log(helpMessage);
}

/**
 * Whether a file is an audio file.
 * @param file a file
 * @return `true` if `file` is an audio file, `false` otherwise
 */
function isAudioFile(file) {
  const ext = path.extname(file).toLowerCase();
  return _.includes(audioExtensions, ext);
}

/**
 * Whether a file is an image file.
 * @param file a file
 * @return `true` if `file` is an image file, `false` otherwise
 */
function isImageFile(file) {
  const ext = path.extname(file).toLowerCase();
  return _.includes(imgExtensions, ext);
}

/**
 * Whether a file is a YAML file.
 * @param file a file
 * @return `true` if `file` is a YAML file, `false` otherwise
 */
function isYamlFile(file) {
  const ext = path.extname(file).toLowerCase();
  return _.includes(yamlExtensions, ext);
}

/**
 * Whether a file is a metadata file.
 * @param file a file
 * @return `true` if `file` is a metadata file, `false` otherwise
 */
function isMetadataFile(file) {
  const fileName = path.basename(file);
  return (
    fileName.match(metadataPreRegExp()) && fileName.match(metadataPostRegExp())
  );
}

/**
 * Add a tag to a file.
 * @param tag the tag to add
 * @param file the file to tag
 */
function setTagForFile(tag, file) {
  const fileExists = fs.existsSync(file);
  if (!fileExists) {
    console.log(`${file} does not exist!`);
    return null;
  }
  console.log(`Setting tag ${tag} for ${file} ...`);
  const realFile = fs.realpathSync(file);
  const metaFile = getMetadataFilenameFromFilename(realFile);
  const fileAlreadyExist = fs.existsSync(metaFile);
  const continuation = () => {
    let yml = fs.readFileSync(metaFile) + '';
    const meta = parseYaml(yml);
    let tags = (meta && meta.tags) || [];
    tags.push(tag);
    tags = _.uniq(tags.sort());
    meta.tags = tags;
    yml = yaml.safeDump(meta);
    yml = '---\n' + yml.trim();
    fs.writeFileSync(metaFile, yml);
  };
  if (!fileAlreadyExist) {
    return createMetadataFile(metaFile, '').then(continuation);
  } else {
    continuation();
  }
}

/**
 * Edit metadata for multiple files.
 * @param files an array of file names
 * @param [tmp] a template string
 */
function editMetadataFileForFiles(files, tmp) {
  return files.map(file => editMetadataFileForFile(file, tmp));
}

/**
 * Edit metadata for a single file.
 * @param file a file name
 * @param [tmp] a template string
 */
function editMetadataFileForFile(file, tmp) {
  if (!file) {
    return null;
  }

  const fileExists = fs.existsSync(file);
  if (!fileExists) {
    console.log(`${file} does not exist!`);
    return null;
  }

  console.log(`Editing metadata for ${file} ...`);
  const template = tmp || getTemplateForFile(file);
  return editMetadataForFileWithEditor(file, template);
}

/**
 * Return the most fitting template string for a file.
 * @param file a file name
 * @return a template string
 */
function getTemplateForFile(file) {
  if (isAudioFile(file)) {
    return audioTemplate;
  }
  if (isImageFile(file)) {
    return imgTemplate;
  }
  return defTemplate;
}

/**
 * Launch a text editor to edit the metadata for a file.
 * @param file a file name
 * @param [tmp] a template string
 */
function editMetadataForFileWithEditor(file, tmp) {
  if (isYamlFile(file)) {
    return launchEditor(file, editor);
  }
  const realFile = fs.realpathSync(file);
  const metaFile = getMetadataFilenameFromFilename(realFile);
  return editMetadataFile(metaFile, tmp);
}

/**
 * Get the filename of the metadata file for a file,
 * by looking at the file's filename.
 * @param filePath the filename of the file
 * @return the filename of the file's metadata file
 * @see getFilenameFromMetadataFilename
 */
function getMetadataFilenameFromFilename(filePath, options) {
  if (isMetadataFile(filePath)) {
    return filePath;
  }
  const origDir = path.dirname(filePath);
  const metaDirectory = path.join(origDir, metaDir);
  const origName = path.basename(filePath);
  const metaName = metaPre + origName + metaExt;
  let metaFile = path.join(metaDirectory, metaName);
  if (options && options.unix) {
    metaFile = metaFile.replace(/\\/g, '/'); // test
  }
  return metaFile;
}

/**
 * Regexp for matching the `metaPre` part of a metadata filename.
 */
function metadataPreRegExp() {
  return new RegExp('^' + _.escapeRegExp(metaPre));
}

/**
 * Regexp for matching the `metaExt` part of a metadata filename.
 */
function metadataPostRegExp() {
  return new RegExp(_.escapeRegExp(metaExt) + '$');
}

/**
 * Launch a text editor to edit a metadata file.
 * @param metaFile a metadata file name
 * @param [tmp] a template string
 */
function editMetadataFile(metaFile, tmp) {
  const fileAlreadyExist = fs.existsSync(metaFile);
  if (fileAlreadyExist) {
    normalizeYamlFile(metaFile);
    return launchEditor(metaFile, editor);
  }
  return createMetadataFile(metaFile, tmp).then(() =>
    launchEditor(metaFile, editor)
  );
}

/**
 * Launch a text editor to edit a file.
 * @param file a file name
 * @param textEditor the editor to use
 */
function launchEditor(file, textEditor) {
  return execAsync(`${textEditor} "${file}"`);
}

/**
 * Create a new metadata file from a template string.
 * @param metaFile a metadata file name
 * @param [tmp] a template string
 */
function createMetadataFile(metaFile, tmp) {
  const dir = path.dirname(metaFile);
  return makeDirectory(dir).then(() =>
    createMetadataFileFromTemplate(metaFile, tmp)
  );
}

/**
 * Create a new metadata file.
 * @param metaFile a metadata file name
 * @param [str] the contents of the metadata file
 */
function createMetadataFileFromTemplate(metaFile, str) {
  return new Promise((resolve, reject) => {
    fs.writeFile(metaFile, str || '', function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(metaFile);
      }
    });
  });
}

/**
 * Make a directory in the current directory.
 * No error is thrown if the directory already exists.
 */
function makeDirectory(dir, options) {
  return new Promise((resolve, reject) => {
    const cwd = (options && options.cwd) || '.';
    const dirPath = joinPaths(cwd, dir);
    fs.mkdir(dirPath, { recursive: true }, err => {
      if (err) {
        const dirAlreadyExists = err.code === 'EEXIST';
        if (dirAlreadyExists) {
          resolve(dir);
        } else {
          reject(dir);
        }
      } else {
        resolve(dir);
      }
    });
  });
}

/**
 * Join a directory path and a file path.
 * This is essentially a wrapper around `path.join()`,
 * but with some added safeguards in order to work
 * better on Windows.
 * @param dir the current working directory
 * @param file a file path
 * @return a combined file path
 */
function joinPaths(dir, file) {
  const directory = path.resolve(dir);
  let filePath = file;
  if (path.isAbsolute(filePath)) {
    filePath = path.relative(directory, filePath);
  }
  return path.join(directory, filePath);
}

/**
 * Normalize a YAML file.
 */
function normalizeYamlFile(file) {
  let yml = fs.readFileSync(file) + '';
  const meta = parseYaml(yml);
  if (meta.tags) {
    meta.tags = meta.tags.sort();
  }
  if (meta.categories) {
    meta.categories = meta.categories.sort();
  }
  yml = yaml.safeDump(meta);
  yml = '---\n' + yml.trim();
  fs.writeFileSync(file, yml);
  // console.log('Normalized ' + file);
}

/**
 * Parse a YAML string.
 * @param str a YAML string (may be fenced by `---`)
 * @return a metadata object, containing the YAML properties
 */
function parseYaml(str) {
  const yml = str.trim().replace(/---$/, '');
  let meta = {};
  try {
    meta = yaml.safeLoad(yml);
  } catch (err) {
    console.log(err);
    return {};
  }
  return meta || {};
}

// invoke the "main" function
if (require.main === module) {
  main();
}
