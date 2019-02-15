import fs from 'fs';
import glob from 'glob';
import matter from 'gray-matter';
import os from 'os';
import path from 'path';
import util from 'util';
import _ from 'lodash';
import { exec } from 'child_process';

// http://stackoverflow.com/questions/20643470/execute-a-command-line-binary-with-node-js#20643568
export const execAsync = util.promisify(exec);

/**
 * The directory to look for metadata in.
 */
export const sourceDir = 'lib';

/**
 * The directory to store tags in.
 */
export const tagDir = 'tag';

/**
 * The directory to store categories in.
 */
export const categoryDir = 'cat';

/**
 * Whether to make symbolic links or copies.
 */
export const makeSymLinks = true;

/**
 * Process all metadata files in the given directory.
 * @param [dir] the directory to look in
 */
export function processMetaFiles(dir, options) {
  const folder = dir || sourceDir;
  console.log(`Processing metadata in ${folder}/ ...\n`);
  iterateOverMetaFiles(folder, processMetaData, options);
}

/**
 * Iterate over all metadata files in the given directory.
 * @param dir the directory to look in
 * @param fn an iterator function, receiving a metadata object for each file
 * @return an array of return values
 */
export function iterateOverMetaFiles(dir, fn, options) {
  return findAllMetaFiles(dir, options).map(file =>
    fn(readMetaFile(file), options)
  );
}

/**
 * Find all metadata files in a directory
 * (i.e., in the `.meta` subdirectories of the directory).
 * @param dir the directory to look in
 * @param [options] options object passed to `glob.sync()`
 * @return an array of strings, where each string is
 * the file path of a metadata file
 */
export function findAllMetaFiles(dir, options) {
  return glob
    .sync('**/.meta/*.{yml,yaml}', {
      ...options,
      cwd: dir,
      dot: true,
      ignore: 'node_modules/**'
    })
    .map(file => path.join(dir, file))
    .sort();
}

/**
 * Read metadata from a metadata file.
 * @param filePath the file path to the metadata file
 * @return a metadata object
 */
export function readMetaFile(filePath) {
  return parseMetadata(readTextFile(filePath), filePath);
}

/**
 * Read a text file synchronously.
 * @param filePath the file path of the text file
 * @return a string containing the file's contents
 */
export function readTextFile(filePath) {
  return (
    fs
      .readFileSync(filePath)
      .toString()
      .trim() + '\n'
  );
}

/**
 * Process a metadata object.
 * @param meta a metadata object
 */
export function processMetaData(meta, options) {
  printMetaData(meta);
  processTagsAndCategories(meta, options);
}

/**
 * Process the `categories` and `tags` properties of a metadata object.
 * @param meta a metadata object
 */
export function processTagsAndCategories(meta, options) {
  const tags = meta.tags || [];
  const categories = meta.categories;
  if (!categories) {
    tags.forEach(tag => {
      makeTagLinkInCategory(meta.file, tagDir, tag, options);
    });
  } else {
    categories.forEach(category => {
      tags.forEach(tag => {
        makeTagLinkInCategory(meta.file, category, tag, options);
      });
    });
  }
}

/**
 * Process the `tags` property of a metadata object.
 * @param meta a metadata object
 */
export function processTags(meta, options) {
  const tags = meta.tags || [];
  tags.forEach(tag => {
    makeTagLink(meta.file, tag, options);
  });
}

/**
 * Make a tag link within a category.
 * @param filePath the file path of the referenced file
 * @param category the category to create a link within
 * @param tag the tag to create a link for
 */
export async function makeTagLinkInCategory(filePath, category, tag, options) {
  const dir = await makeCategoryDirectory(category);
  return makeTagLink(filePath, tag, { ...options, cwd: dir, tag: '.' });
}

/**
 * Make a tag link.
 * @param filePath the file path of the referenced file
 * @param tag the tag to create a link for
 */
export async function makeTagLink(filePath, tag, options) {
  const dir = await makeTagDirectory(tag, options);
  if (makeSymLinks) {
    const ln = await hasLn();
    if (ln) {
      return makeLink(filePath, dir, options);
    }
  }
  return makeCopy(filePath, dir, options);
}

/**
 * Make a category directory.
 */
export async function makeCategoryDirectory(category, options) {
  const dir = await makeCategoryContainer(options);
  return makeDirectory(`${dir}/${category}`, options);
}

/**
 * Make a tag directory.
 */
export async function makeTagDirectory(tag, options) {
  let dir = options && options.tag;
  if (!dir) {
    dir = await makeTagContainer(options);
  }
  return makeDirectory(`${dir}/${tag}`, options);
}

/**
 * Make a category container.
 */
export async function makeCategoryContainer(options) {
  return makeDirectory(categoryDir, options);
}

/**
 * Make a tag container.
 */
export async function makeTagContainer(options) {
  return makeDirectory(tagDir, options);
}

/**
 * Make a directory in the current directory.
 * No error is thrown if the directory already exists.
 */
export function makeDirectory(dir, options) {
  const dirPath = path.normalize(dir);
  return invokeMkdir(dirPath, options).catch(err => dir);
}

/**
 * Make a link to a file.
 * @param source the file to link to
 * @param destination the location of the link
 */
export function makeLink(source, destination, options) {
  return invokeLn(source, destination, options);
}

/**
 * Make a copy of a file.
 * @param source the source file
 * @param destination the destination file
 */
export async function makeCopy(source, destination, options) {
  const rsync = await hasRsync();
  if (rsync) {
    return invokeRsync(source, destination, options);
  }
  return invokeCp(source, destination, options);
}

/**
 * Use `ln` to make a symbolic link to a file.
 * @param source the file to link to
 * @param destination the location of the link
 */
export function invokeLn(source, destination, options) {
  const cmd = `ln -s "${source}" "${destination}"`;
  if (options && options.debug) {
    return cmd;
  }
  return execAsync(cmd, options)
    .then(() => destination)
    .catch(err => destination);
}

/**
 * Use `rsync` to make a copy of a file.
 * @param source the source file
 * @param destination the destination file
 */
export function invokeRsync(source, destination, options) {
  const cmd = `rsync -avz "${source}" "${destination}"`;
  if (options && options.debug) {
    return cmd;
  }
  return execAsync(cmd, options).then(() => destination);
}

/**
 * Use `cp` to make a copy of a file.
 * @param source the source file
 * @param destination the destination file
 */
export function invokeCp(source, destination, options) {
  const cmd = `cp "${source}" "${destination}"`;
  if (options && options.debug) {
    return cmd;
  }
  return execAsync(cmd, options).then(() => destination);
}

/**
 * Use `mkdir` to make a directory in the current directory.
 * @param dir the directory to make
 */
export function invokeMkdir(dir, options) {
  const cmd = `mkdir "${dir}"`;
  if (options && options.debug) {
    return cmd;
  }
  return execAsync(cmd, options).then(() => dir);
}

/**
 * Whether `rsync` is available on the system.
 * @return `true` if `rsync` is available, `false` otherwise
 */
export function hasRsync(options) {
  return hasCmd('rsync', options);
}

/**
 * Whether `ln` is available on the system.
 * @return `true` if `ln` is available, `false` otherwise
 */
export function hasLn(options) {
  return !isWindows() && hasCmd('ln', options);
}

/**
 * Whether a command is available on the system.
 * @param command the command
 * @return `true` if `command` is available, `false` otherwise
 */
export function hasCmd(command, options) {
  const cmd = `${command} --version`;
  if (options && options.debug) {
    return cmd;
  }
  return execAsync(cmd, options)
    .then(() => true)
    .catch(err => false);
}

/**
 * Print a metadata object to the console.
 * @param meta a metadata object
 */
export function printMetaData(meta) {
  console.log(referencedFilePath(meta));
  // console.log(meta);
  // console.log('');
}

/**
 * Create a metadata object from a YAML string.
 * @param str a YAML string
 * @return a metadata object
 */
export function parseMetadata(str, filePath, options) {
  const meta = parseYaml(str);
  if (meta.file === undefined) {
    meta.file = getFilenameFromMetaFilename(filePath);
  }
  meta.meta = filePath;
  meta.path = meta.file;
  if (!(options && options.debug)) {
    meta.file = referencedAbsoluteFilePath(meta);
  }
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
export function addYamlFences(str) {
  let yaml = str.trim();
  if (!yaml.match(/^---/)) {
    yaml = '---\n' + yaml;
    if (!yaml.match(/---$/)) {
      yaml += '\n---\n';
    }
    return yaml;
  }
  return str;
}

/**
 * Get the filename of the file that a metadata file is referring to,
 * by looking at the metadata file's filename.
 * @param filePath the filename of the metadata file
 * @return the filename of the referenced file
 */
export function getFilenameFromMetaFilename(filePath) {
  const dir = '..';
  let origName = path.basename(filePath);
  origName = origName.replace(/^\./, '');
  origName = origName.replace(/\.ya?ml$/, '');
  origName = dir + '/' + origName;
  return origName;
}

/**
 * Get the absolute file path of the file referenced by a meta object.
 * @param meta a metadata object
 * @return an absolute file path
 */
export function referencedAbsoluteFilePath(meta) {
  return path.resolve(referencedFilePath(meta));
}

/**
 * Get the file path of the file referenced by a meta object.
 * @param meta a metadata object
 * @return a file path (relative to the current directory)
 */
export function referencedFilePath(meta) {
  return path.join(path.dirname(meta.meta), meta.path);
}

/**
 * Whether the current system is Windows.
 * @return `true` if the system is Windows, `false` otherwise
 */
export function isWindows() {
  return os.platform() === 'win32';
}

export default {};
