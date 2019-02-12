import glob from 'glob';
import fs from 'fs';
import matter from 'gray-matter';
import path from 'path';
import _ from 'lodash';
import util from 'util';
import { exec } from 'child_process';

// http://stackoverflow.com/questions/20643470/execute-a-command-line-binary-with-node-js#20643568
const execAsync = util.promisify(exec);

/**
 * The directory to look for metadata in.
 */
const sourceDir = 'lib';

/**
 * The directory to store tags in.
 */
const tagDir = 'tag';

/**
 * Whether to make symbolic links or copies.
 */
const makeSymLinks = true;

/**
 * The "main" function.
 *
 * Execution begins here when the script is run from the command line with Node.
 * (Note that the execution actually begins in `index.js`, which includes this
 * file, which in turn invokes `main()`.)
 */
function main() {
  processMetaFiles(sourceDir);
}

/**
 * Process all metadata files in the given directory.
 * @param dir the directory to look in
 */
function processMetaFiles(dir) {
  console.log(`Processing metadata in ${dir}/ ...\n`);
  iterateOverMetaFiles(dir, processMetaData);
}

/**
 * Process a metadata object.
 * @param meta a metadata object
 */
function processMetaData(meta) {
  printMetaData(meta);
  processTags(meta);
}

/**
 * Process the `tags` property of a metadata object.
 * @param meta a metadata object
 */
function processTags(meta) {
  const tags = meta.tags || [];
  tags.forEach(tag => {
    makeTagLink(meta.file, tag);
  });
}

/**
 * Make a tag link.
 * @param filePath the file path of the referenced file
 * @param tag the tag to create a link for
 */
async function makeTagLink(filePath, tag) {
  await makeTagDirectory(tag);
  if (makeSymLinks) {
    const ln = await hasLn();
    if (ln) {
      return makeLink(filePath, `${tagDir}/${tag}`);
    }
  }
  return makeCopy(filePath, `${tagDir}/${tag}`);
}

/**
 * Make a tag directory.
 */
async function makeTagDirectory(tag) {
  await makeTagContainer();
  await makeDirectory(`${tagDir}/${tag}`);
}

/**
 * Make a tag container.
 */
async function makeTagContainer() {
  await makeDirectory(tagDir);
}

/**
 * Make a directory in the current directory.
 * No error is thrown if the directory already exists.
 */
function makeDirectory(dir) {
  const dirPath = path.normalize(dir);
  return invokeMkdir(dirPath).catch(err => null);
}

/**
 * Make a link to a file.
 * @param source the file to link to
 * @param destination the location of the link
 */
function makeLink(source, destination) {
  return invokeLn(source, destination);
}

/**
 * Make a copy of a file.
 * @param source the source file
 * @param destination the destination file
 */
async function makeCopy(source, destination) {
  const rsync = await hasRsync();
  if (rsync) {
    return invokeRsync(source, destination);
  }
  return invokeCp(source, destination);
}

/**
 * Use `ln` to make a symbolic link to a file.
 * @param source the file to link to
 * @param destination the location of the link
 */
function invokeLn(source, destination) {
  return execAsync(`ln -s "${source}" "${destination}"`).catch(err => null);
}

/**
 * Use `rsync` to make a copy of a file.
 * @param source the source file
 * @param destination the destination file
 */
function invokeRsync(source, destination) {
  return execAsync(`rsync -avz "${source}" "${destination}"`);
}

/**
 * Use `cp` to make a copy of a file.
 * @param source the source file
 * @param destination the destination file
 */
function invokeCp(source, destination) {
  return execAsync(`cp "${source}" "${destination}"`);
}

/**
 * Use `mkdir` to make a directory in the current directory.
 * @param dir the directory to make
 */
function invokeMkdir(dir) {
  return execAsync(`mkdir "${dir}"`);
}

/**
 * Whether `rsync` is available on the system.
 * @return `true` if `rsync` is available, `false` otherwise
 */
function hasRsync() {
  return hasCmd('rsync');
}

/**
 * Whether `ln` is available on the system.
 * @return `true` if `ln` is available, `false` otherwise
 */
function hasLn() {
  return hasCmd('ln');
}

/**
 * Whether a command is available on the system.
 * @param cmd the command
 * @return `true` if `cmd` is available, `false` otherwise
 */
function hasCmd(cmd) {
  return execAsync(`${cmd} --version`)
    .then(() => true)
    .catch(err => false);
}

/**
 * Print a metadata object to the console.
 * @param meta a metadata object
 */
function printMetaData(meta) {
  console.log(referencedFilePath(meta));
  console.log(meta);
  console.log('');
}

/**
 * Iterate over all metadata files in the given directory.
 * @param dir the directory to look in
 * @param fn an iterator function, receiving a metadata object for each file
 * @return an array of return values
 */
function iterateOverMetaFiles(dir, fn) {
  return findAllMetaFiles(dir)
    .map(readMetaFile)
    .map(fn);
}

/**
 * Find all metadata files in the current directory
 * (i.e., in the .meta subdirectories of the current directory).
 * @return an array of strings, where each string is
 * the file path of a metadata file
 */
function findAllMetaFiles(dir) {
  return glob
    .sync('**/.meta/*.yml', { cwd: dir, dot: true, ignore: 'node_modules/**' })
    .map(file => relativeTo(dir, file))
    .sort();
}

/**
 * Read metadata from a metadata file.
 * @param filePath the file path to the metadata file
 * @return a metadata object
 */
function readMetaFile(filePath) {
  return parseMetadata(readTextFile(filePath), filePath);
}

/**
 * Read a text file synchronously.
 * @param filePath the file path of the text file
 * @return a string containing the file's contents
 */
function readTextFile(filePath) {
  return (
    fs
      .readFileSync(filePath)
      .toString()
      .trim() + '\n'
  );
}

/**
 * Create a metadata object from a YAML string.
 * @param str a YAML string
 * @return a metadata object
 */
function parseMetadata(str, filePath) {
  const meta = parseYaml(str);
  if (meta.file === undefined) {
    meta.file = getFilenameFromMetaFilename(filePath);
  }
  meta.meta = filePath;
  meta.path = meta.file;
  meta.file = referencedAbsoluteFilePath(meta);
  return meta;
}

/**
 * Parse a YAML string.
 * @param str a YAML string (may be fenced by `---`)
 * @return a metadata object, containing the YAML properties
 */
export function parseYaml(str) {
  let meta = {};
  try {
    const yaml = addYamlFences(str);
    meta = matter(yaml, { lang: 'yaml' });
    const data = _.assign({}, meta.data);
    delete meta.data;
    meta = _.assign({}, data, meta);
    if (meta.content === '') {
      delete meta.content;
    }
    if (meta.excerpt === '') {
      delete meta.excerpt;
    }
    if (!meta.isEmpty) {
      delete meta.isEmpty;
    }
  } catch (err) {
    return {};
  }
  return meta;
}

/**
 * Add `---` fences to a YAML string if they are missing.
 * @param str a YAML string
 * @return a fenced YAML string
 */
function addYamlFences(str) {
  if (!str.match(/^---/)) {
    return '---\n' + str;
  }
  return str;
}

/**
 * Get the filename of the file that a metadata file is referring to,
 * by looking at the metadata file's filename.
 * @param filePath the filename of the metadata file
 * @return the filename of the referenced file
 */
function getFilenameFromMetaFilename(filePath) {
  const dir = '..';
  const basename = path.basename(filePath);
  let origname = fileName(basename);
  origname = origname.replace(/^\./, '');
  origname = dir + '/' + origname;
  return origname;
}

/**
 * Get the absolute file path of the file referenced by a meta object.
 * @param meta a metadata object
 * @return an absolute file path
 */
function referencedAbsoluteFilePath(meta) {
  return path.resolve(referencedFilePath(meta));
}

/**
 * Get the file path of the file referenced by a meta object.
 * @param meta a metadata object
 * @return a file path (relative to the current directory)
 */
function referencedFilePath(meta) {
  return relativeTo(dirName(meta.meta), meta.path);
}

/**
 * Return a file path relative to a base path.
 * The returned path is relative to the current working directory, `.`.
 * @param base the base path
 * @param filePath the file path
 * @return a relative file path
 */
function relativeTo(base, filePath) {
  return path.relative('.', path.resolve(base, filePath));
}

/**
 * Get the filename part of a file path.
 * @param filePath a file path
 * @return a filename
 */
function fileName(filePath) {
  return filePath.substr(0, filePath.length - path.extname(filePath).length);
}

/**
 * Get the directory part of a file path.
 * @param filePath a file path
 * @return a directory path
 */
export function dirName(filePath) {
  return filePath.substr(0, filePath.length - path.basename(filePath).length);
}

export default {
  dirName
};

// invoke the "main" function
main();
