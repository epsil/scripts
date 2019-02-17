import fs from 'fs';
import fg from 'fast-glob';
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
 * The directory to store categories in.
 */
export const categoryDir = 'cat';

/**
 * The directory to store tags in.
 */
export const tagDir = 'tag';

/**
 * Whether to make symbolic links or copies.
 */
export const makeSymLinks = true;

/**
 * Process all metadata files in the given directory.
 * @param [dir] the directory to look in, default `.`
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
  return new Promise((resolve, reject) => {
    const result = [];
    const stream = fg.stream(['**/.meta/*.yml'], {
      cwd: dir,
      dot: true,
      ignore: ['node_modules/**']
    });
    stream.on('data', entry => {
      const file = path.join(dir, entry);
      fs.readFile(file, 'utf8', (err, data) => {
        result.push(fn(parseMetadata(data.toString().trim() + '\n', file)));
      });
    });
    stream.once('end', () => resolve(result));
  });
}

/**
 * Process a metadata object.
 * @param meta a metadata object
 */
export function processMetaData(meta, options) {
  printMetaData(meta);
  return processTagsAndCategories(meta, options);
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
  return meta;
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
  return meta;
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
export function makeCategoryContainer(options) {
  return makeDirectory(categoryDir, options);
}

/**
 * Make a tag container.
 */
export function makeTagContainer(options) {
  return makeDirectory(tagDir, options);
}

/**
 * Make a directory in the current directory.
 * No error is thrown if the directory already exists.
 */
export function makeDirectory(dir, options) {
  return invokeMkdir(path.normalize(dir), options);
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
  return invokeCmd(`ln -s "${source}" "${destination}"`, {
    ...options,
    successValue: destination,
    errorValue: true
  });
}

/**
 * Use `rsync` to make a copy of a file.
 * @param source the source file
 * @param destination the destination file
 */
export function invokeRsync(source, destination, options) {
  return invokeCmd(`rsync -avz "${source}" "${destination}"`, {
    ...options,
    successValue: destination
  });
}

/**
 * Use `cp` to make a copy of a file.
 * @param source the source file
 * @param destination the destination file
 */
export function invokeCp(source, destination, options) {
  return invokeCmd(`cp "${source}" "${destination}"`, {
    ...options,
    successValue: destination
  });
}

/**
 * Use `mkdir` to make a directory in the current directory.
 * No error is thrown if the directory already exists.
 * @param dir the directory to make
 */
export function invokeMkdir(dir, options) {
  return invokeCmd(`mkdir "${dir}"`, {
    ...options,
    successValue: dir,
    errorValue: dir
  });
}

/**
 * Invoke a command in the current working directory.
 * @param cmd the command to invoke
 */
export function invokeCmd(cmd, options) {
  if (options && options.debug) {
    return cmd;
  }
  let promise = execAsync(cmd, options);
  if (options && options.successValue !== undefined) {
    promise = promise.then(() => options.successValue);
  }
  if (options && options.errorValue !== undefined) {
    promise = promise.catch(() => options.errorValue);
  }
  return promise;
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
  return invokeCmd(`${command} --version`, {
    ...options,
    successValue: true,
    errorValue: false
  });
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
