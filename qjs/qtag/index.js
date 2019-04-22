#!/usr/bin/env node

const fs = require('fs');
const getStdin = require('get-stdin');
const meow = require('meow');
const path = require('path');
const shell = require('shelljs');
const ws = require('windows-shortcuts');
const yaml = require('js-yaml');
const _ = require('lodash');

/**
 * Help message to display when running with `--help`.
 */
const help = `Usage:

    qtag [FILES...]

Example:

    qtag FILE

This launches a text editor for editing the metadata of FILE.

    qtag FILE1 FILE2 FILE3

This launches text editors for editing the metadata of FILE1,
FILE2 and FILE3.

    qtag --tag foo FILE1 FILE2 FILE3

This adds the tag foo to FILE1, FILE2 and FILE3.

Type qtag --version to see the current version.

See also: q, qget.`;

/**
 * Default values that determine the behavior of the program.
 */
const settings = {
  /**
   * Text editor for editing metadata files.
   */
  editor: 'gvim', // or emacs?

  /**
   * Template string for audio metadata.
   */
  audioTemplate:
    `---
tags:
  - ...` + // whitespace
    `
categories:
  - audio`,

  /**
   * Template string for image metadata.
   */
  imgTemplate:
    `---
tags:
  - ...` + // whitespace
    `
categories:
  - img`,

  /**
   * Template string for general metadata.
   */
  defTemplate: `---
tags:
  - ...`,

  /**
   * File extensions for audio files.
   */
  audioExtensions: ['.wav', '.mp3', '.ogg', '.aiff', '.m4a', '.flac', '.ape'],

  /**
   * File extensions for image files.
   */
  imgExtensions: ['.jpg', '.jpeg', '.png', '.bmp', '.gif', '.heif', '.heic'],

  /**
   * File extensions for YAML files.
   */
  yamlExtensions: ['.yml', '.yaml'],

  /**
   * The directory to store metadata files in.
   */
  metaDir: '.meta',

  /**
   * The dotfile prefix for metadata files.
   */
  metaPre: '.',

  /**
   * The file extension for metadata files.
   */
  metaExt: '.yml',

  /**
   * Whether to output a "rich" YAML prefix.
   */
  richHeader: true
};

/**
 * User-adjustable settings.
 */
const flags = {
  flags: {
    tag: {
      type: 'string',
      alias: 't'
    }
  }
};

/**
 * "Main" function.
 */
function main() {
  const cli = meow(help, flags);
  let files = cli.input;
  const tag = cli.flags.tag;
  const hasStdin = !process.stdin.isTTY && !files;
  if (hasStdin) {
    getStdin().then(str => {
      files = str
        .trim()
        .split('\n')
        .filter(x => x !== '');
      processFiles(files, tag);
    });
  } else {
    processFiles(files, tag);
  }
}

/**
 * Process a list of files.
 * @param files an array of file paths
 * @param [tag] a tag to set, optional
 */
function processFiles(files, tag) {
  if (tag) {
    files.forEach(file => setTagForFile(tag, file));
    return;
  }
  editMetadataFileForFiles(files);
}

/**
 * Whether a file is an audio file.
 * @param file a file
 * @return `true` if `file` is an audio file, `false` otherwise
 */
function isAudioFile(file) {
  const ext = path.extname(file).toLowerCase();
  return _.includes(settings.audioExtensions, ext);
}

/**
 * Whether a file is an image file.
 * @param file a file
 * @return `true` if `file` is an image file, `false` otherwise
 */
function isImageFile(file) {
  const ext = path.extname(file).toLowerCase();
  return _.includes(settings.imgExtensions, ext);
}

/**
 * Whether a file is a YAML file.
 * @param file a file
 * @return `true` if `file` is a YAML file, `false` otherwise
 */
function isYamlFile(file) {
  const ext = path.extname(file).toLowerCase();
  return _.includes(settings.yamlExtensions, ext);
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
  // If we are tagging a symlink, dereference it.
  // TODO: dereference Windows shortcuts.
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
    const ymlDoc = addYAMLHeader(yml, metaFile);
    fs.writeFileSync(metaFile, ymlDoc);
  };
  if (!fileAlreadyExist) {
    return createMetadataFile(metaFile, '').then(continuation);
  }
  continuation();
  return null;
}

/**
 * Dereference a symbolic link or Windows shortcut.
 * @param file the file to dereference
 * @return a deferenced file path
 */
function dereference(file) {
  const isShortcut = file.match(/\.lnk$/i);
  if (isShortcut) {
    return dereferenceShortcut(file);
  }
  const realFile = fs.realpathSync(file);
  return Promise.resolve(realFile);
}

/**
 * Dereference a Windows shortcut.
 * @param file the shortcut to dereference
 * @return a deferenced file path
 */
function dereferenceShortcut(file) {
  return new Promise((resolve, reject) =>
    ws.query(file, info => resolve(info.target))
  );
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
    return settings.audioTemplate;
  }
  if (isImageFile(file)) {
    return settings.imgTemplate;
  }
  return settings.defTemplate;
}

/**
 * Launch a text editor to edit the metadata for a file.
 * @param file a file name
 * @param [tmp] a template string
 */
function editMetadataForFileWithEditor(file, tmp) {
  if (isYamlFile(file)) {
    return launchEditor(file, settings.editor);
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
  const metaDirectory = path.join(origDir, settings.metaDir);
  const origName = path.basename(filePath);
  const metaName = settings.metaPre + origName + settings.metaExt;
  let metaFile = path.join(metaDirectory, metaName);
  if (options && options.unix) {
    metaFile = metaFile.replace(/\\/g, '/'); // test
  }
  return metaFile;
}

/**
 * Get the filename of the file that a metadata file is referring to,
 * by looking at the metadata file's filename.
 * @param filePath the filename of the metadata file
 * @param [options] an options object
 * @return the filename of the referenced file
 * @see getMetadataFilenameFromFilename
 */
function getFilenameFromMetadataFilename(filePath, options) {
  if (!isMetadataFile(filePath)) {
    return filePath;
  }
  const metaDirectory = path.dirname(filePath);
  const parentDir = '..';
  const origDir = path.join(metaDirectory, parentDir);
  const metaName = path.basename(filePath);
  const origName = metaName
    .replace(metadataPreRegExp(), '')
    .replace(metadataPostRegExp(), '');
  let origFile = path.join(origDir, origName);
  if (options && options.unix) {
    origFile = origFile.replace(/\\/g, '/'); // test
  }
  return origFile;
}

/**
 * Regexp for matching the `metaPre` part of a metadata filename.
 */
function metadataPreRegExp() {
  return new RegExp('^' + _.escapeRegExp(settings.metaPre));
}

/**
 * Regexp for matching the `metaExt` part of a metadata filename.
 */
function metadataPostRegExp() {
  return new RegExp(_.escapeRegExp(settings.metaExt) + '$');
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
    return launchEditor(metaFile, settings.editor).then(() =>
      normalizeYamlFile(metaFile)
    );
  }
  return createMetadataFile(metaFile, tmp)
    .then(() => launchEditor(metaFile, settings.editor))
    .then(() => normalizeYamlFile(metaFile));
}

/**
 * Launch a text editor to edit a file.
 * @param file a file name
 * @param textEditor the editor to use
 */
function launchEditor(file, textEditor) {
  return new Promise((resolve, reject) => {
    shell.exec(
      `${textEditor} "${file}"`,
      { async: true, silent: true },
      (code, stdout, stderr) => {
        if (code === 0) {
          resolve(code);
        } else {
          reject(code);
        }
      }
    );
  });
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
  const tmp = addYAMLHeader(str || '', metaFile);
  return new Promise((resolve, reject) => {
    fs.writeFile(metaFile, tmp, function(err) {
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
  const fileExists = fs.existsSync(file);
  if (!fileExists) {
    return;
  }
  const data = fs.readFileSync(file) + '';
  let yml = data;
  yml = yml.trim();
  const isEmptyFile = yml === '';
  const meta = parseYaml(yml);
  const isEmptyObject = _.isEmpty(meta);
  if (isEmptyFile || isEmptyObject) {
    shell.rm(file);
    const metaDirectory = path.dirname(file);
    const metaDirectoryIsEmpty = fs.readdirSync(metaDirectory).length === 0;
    if (metaDirectoryIsEmpty) {
      shell.rm('-rf', metaDirectory);
    }
    return;
  }
  if (meta.tags) {
    meta.tags = _.uniq(meta.tags.sort());
  }
  if (meta.categories) {
    meta.categories = _.uniq(meta.categories.sort());
  }
  yml = yaml.safeDump(meta);
  const ymlDoc = addYAMLHeader(yml, file);
  if (ymlDoc !== data) {
    fs.writeFileSync(file, ymlDoc);
  }
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

/**
 * Add a YAML header to a YAML string.
 * Any previous header is overwritten.
 * @param yml a YAML string
 * @param [metaFile] the file name of the YAML file
 * @return a YAML document
 */
function addYAMLHeader(yml, metaFile) {
  let ymlHeader = '---' + '\n';

  if (settings.richHeader && metaFile) {
    const origFile = path.basename(getFilenameFromMetadataFilename(metaFile));
    ymlHeader = '---' + ' # ' + origFile + '\n';
  }

  const hasHeader = yml.match(/^---\n/i);
  if (hasHeader) {
    return yml.replace(/^---.*\n/, ymlHeader);
  }

  const ymlDoc = ymlHeader + yml.trim();
  return ymlDoc;
}

// invoke the "main" function
if (require.main === module) {
  main();
}
