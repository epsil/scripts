import glob from 'glob';
import fs from 'fs';
import matter from 'gray-matter';
import path from 'path';
import _ from 'lodash';
import util from 'util';
import { exec } from 'child_process';

// http://stackoverflow.com/questions/20643470/execute-a-command-line-binary-with-node-js#20643568
const execAsync = util.promisify(exec);

const sourceFolder = 'lib';

/**
 * The "main" function.
 */
function main() {
  processMetaFiles(sourceFolder);
}

/**
 * Process all metadata files in the current directory.
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
    makeTagLink(meta.filePath, tag);
  });
}

/**
 * Make a tag link.
 * @param filePath the file path of the referenced file
 * @param tag the tag to create a link for
 */
async function makeTagLink(filePath, tag) {
  await makeTagFolder(tag);
  await makeCopy(filePath, `tag/${tag}`);
}

/**
 * Make a tag folder.
 */
async function makeTagFolder(tag) {
  await makeTagContainer();
  await makeFolder(`tag/${tag}`);
}

/**
 * Make a tag container.
 */
async function makeTagContainer() {
  await makeFolder('tag');
}

/**
 * Make a folder in the current directory.
 * No error is thrown if the folder already exists.
 */
function makeFolder(folder) {
  const folderPath = path.normalize(folder);
  return execAsync(`mkdir "${folderPath}"`).catch(x => x);
}

/**
 * Make a copy of a file.
 * @param source the source file
 * @param destination the destination file
 */
function makeCopy(source, destination) {
  return execAsync(`cp "${source}" "${destination}"`);
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
  meta.yaml = filePath;
  meta.filePath = referencedAbsoluteFilePath(meta);
  return meta;
}

/**
 * Parse a YAML string.
 * @param str a YAML string (may be fenced by `---`)
 * @return a metadata object, containing the YAML properties
 */
function parseYaml(str) {
  let meta = {};
  try {
    meta = matter(str);
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
 * Get the filename of the file that a metadata file is referring to,
 * by looking at the metadata file's filename.
 * @param filePath the filename of the metadata file
 * @return the filename of the referenced file
 */
function getFilenameFromMetaFilename(filePath) {
  const fileFolder = '..';
  const basename = path.basename(filePath);
  let origname = fileName(basename);
  origname = origname.replace(/^\./, '');
  origname = fileFolder + '/' + origname;
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
  return relativeTo(folderName(meta.yaml), meta.file);
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
 * Get the folder part of a file path.
 * @param filePath a file path
 * @return a folder path
 */
function folderName(filePath) {
  return filePath.substr(0, filePath.length - path.basename(filePath).length);
}

main();
