import fs from 'fs';
import fg from 'fast-glob';
import os from 'os';
import path from 'path';
import rimraf from 'rimraf';
import util from 'util';
import yaml from 'js-yaml';
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
 * The directory to store queries in.
 */
export const queryDir = 'q';

/**
 * The default category.
 */
export const defaultCategory = '_';

/**
 * The directory to store metadata files in.
 */
export const metaDir = '.meta';

/**
 * Temporary directory to generate symlinks in.
 */
export const tmpDir = 'tmp';

/**
 * The dotfile prefix for metadata files.
 */
export const metaPre = '.';

/**
 * The file extension for metadata files.
 */
export const metaExt = '.yml';

/**
 * Whether to make symbolic links or copies.
 */
export const makeSymLinks = true;

/**
 * Globbing pattern for directories to ignore.
 */
export const ignorePattern = 'node_modules/**';

/**
 * Whether to normalize YAML files.
 */
export const normalize = false;

/**
 * Process all metadata files in the given directory.
 * @param [inputDir] the directory to look for metadata files in
 * (`sourceDir` by default)
 * @param [outputDir] the directory to create symlinks in
 * (`categoryDir` by default)
 */
export function processMetadataFiles(inputDir, outputDir, query, options) {
  const inDir = inputDir || sourceDir;
  const outDir = outputDir || categoryDir;
  return hasLn().then(ln => {
    console.log(`Processing metadata in ${inDir}/ ...\n`);
    return processMetadataFilesWithTmpDir(inDir, outDir, tmpDir, query, {
      makeSymLinks: makeSymLinks && ln,
      ...options
    }).then(() => {
      console.log('Done.');
    });
  });
}

/**
 * Process metadata files by creating symlinks in a temporary directory
 * and then merging that into the target directory.
 * @param [inputDir] the directory to look for metadata files in
 * @param [outputDir] the directory to create symlinks in
 * @param [tempDir] the temporary directory to create symlinks in
 */
export function processMetadataFilesWithTmpDir(
  inputDir,
  outputDir,
  tempDir,
  query,
  options
) {
  makeTemporaryDirectory(tempDir || tmpDir).then(tempDirectory =>
    processMetadataFilesInDir(inputDir, tempDirectory, query, options).then(
      () => mergeTmpDirAndOutputDir(tempDirectory, outputDir, options)
    )
  );
}

/**
 * Process metadata files by creating symlinks in a target directory.
 * @param [inputDir] the directory to look for metadata files in
 * @param [outputDir] the directory to create symlinks in
 */
export function processMetadataFilesInDir(inputDir, outputDir, query, options) {
  if (query) {
    return iterateOverFilesStream(
      file => processMetadataQuery(file, query, options),
      inputDir,
      {
        ...options,
        categoryDir: outputDir
      }
    );
  }
  return iterateOverFilesStream(processMetadata, inputDir, {
    ...options,
    categoryDir: outputDir
  });
}

/**
 * Merge a temporary directory of symlinks into the target directory.
 * @param [tempDir] the temporary directory
 * @param [outputDir] the output directory
 */
export function mergeTmpDirAndOutputDir(tempDir, outputDir, options) {
  return hasRsync().then(rsync => {
    if (rsync) {
      return mergeTmpDirAndOutputDirWithRsync(tempDir, outputDir, options);
    }
    return mergeTmpDirAndOutputDirWithMv(tempDir, outputDir, options);
  });
}

/**
 * Use `rsync` to merge a temporary directory into the target directory.
 * @param [tempDir] the temporary directory
 * @param [outputDir] the output directory
 */
export function mergeTmpDirAndOutputDirWithRsync(tempDir, outputDir, options) {
  const temporaryDir = tempDir + '/';
  return makeDirectory(outputDir)
    .then(() =>
      invokeRsync(temporaryDir, outputDir, {
        errorValue: true,
        delete: true
      })
    )
    .then(() => deleteDirectory(tempDir));
}

/**
 * Use `mv` to merge a temporary directory into the target directory.
 * @param [tempDir] the temporary directory
 * @param [outputDir] the output directory
 */
export function mergeTmpDirAndOutputDirWithMv(tempDir, outputDir, options) {
  if (isWindows()) {
    console.log(`Windows: cannot move ${tempDir}/ to ${outputDir}/.`);
    return null;
  }
  const outputDirExists = fs.existsSync(outputDir);
  if (!outputDirExists) {
    return invokeCmd(`mv "${tempDir}" "${outputDir}"`);
  }
  const trashDir = tempDir + '2'; // 'tmp2'
  return invokeCmd(`mv "${outputDir}" "${trashDir}"`)
    .then(() => invokeCmd(`mv "${tempDir}" "${outputDir}"`))
    .then(() => deleteDirectory(trashDir));
}

/**
 * Iterate over all metadata files in the given directory.
 * @param fn an iterator function, receiving a file path for each metadata file
 * @param dir the directory to look in
 * @return an array of return values
 */
function iterateOverFiles(fn, dir, options) {
  const iterator = fn || (x => x);
  return fg
    .async([createGlobPattern()], {
      ...options,
      dot: true,
      ignore: [ignorePattern],
      cwd: dir
    })
    .then(entries =>
      entries
        .map(entry => {
          const file = path.join(dir, entry);
          if (normalize) {
            normalizeYamlFile(file);
          }
          const origFile = getFilenameFromMetadataFilename(file);
          const origFileExists = fs.existsSync(origFile);
          if (!origFileExists) {
            console.log(`${origFile} does not exist!
  (referenced by ${file})`);
            return null;
          }
          return iterator(file, options);
        })
        .filter(x => x !== null)
    );
}

/**
 * Iterate over all metadata files in the given directory, as a stream.
 * @param fn an iterator function, receiving a file path for each metadata file
 * @param dir the directory to look in
 * @return an array of return values
 */
export function iterateOverFilesStream(fn, dir, options) {
  return new Promise((resolve, reject) => {
    const result = [];
    const iterator = fn || (x => x);
    const stream = fg.stream([createGlobPattern()], {
      dot: true,
      ignore: [ignorePattern],
      cwd: dir
    });
    stream.on('data', entry => {
      const file = path.join(dir, entry);
      if (normalize) {
        normalizeYamlFile(file);
      }
      const origFile = getFilenameFromMetadataFilename(file);
      const origFileExists = fs.existsSync(origFile);
      if (!origFileExists) {
        console.log(`${origFile} does not exist!
  (referenced by ${file})`);
      } else {
        result.push(iterator(file, options));
      }
    });
    stream.once('end', () => resolve(Promise.all(result)));
  });
}

/**
 * Iterate over all metadata files in the given directory, in parallel.
 * @param fn an iterator function, receiving a file path for each metadata file
 * @param dir the directory to look in
 * @return an array of return values
 */
export function iterateOverFilesAsync(fn, dir, options) {
  const iterator = fn || (x => x);
  return iterateOverFiles(null, dir, options).then(files => {
    const proms = files.map(file => iterator(file, options));
    return Promise.all(proms);
  });
}

/**
 * Create a glob string for matching all metadata files in a directory.
 * Note that the pattern treats dots (`.`) as normal characters,
 * so it is necessary to set `dot: true` in the globbing options.
 * @param [mDir] the metadata file directory
 * @param [mExt] the metadata file extension
 * @return a globbing pattern
 */
export function createGlobPattern(mDir, mExt) {
  const metaDirStr = mDir || metaDir;
  const metaExtStr = mExt || metaExt;
  return '**/' + metaDirStr + '/*' + metaExtStr;
}

/**
 * Process the metadata for a file.
 * @param file a file
 */
export function processMetadata(file, options) {
  return readMetadataForFile(file, {
    ...options,
    print: true
  }).then(meta => {
    processTagsAndCategories(meta, options);
    return file;
  });
}

/**
 * Process the metadata for a file in the context of a query.
 * @param file a file
 * @param query a query
 */
export function processMetadataQuery(file, query, options) {
  return readMetadataForFile(file, {
    ...options,
    print: true
  }).then(meta => {
    performQueryOnFile(meta, query, options);
    return query;
  });
}

/**
 * Read the metadata for a file.
 * If `print: true` is specified in `options`,
 * then the metadata is printed to the console.
 * @param file a file
 * @return a metadata object (wrapped in a promise)
 */
export function readMetadataForFile(file, options) {
  return new Promise((resolve, reject) => {
    fs.readFile(file, 'utf8', (err, data) => {
      if (err) {
        console.log(err);
        reject(err);
      } else {
        const yml = data.toString().trim() + '\n';
        const meta = parseMetadata(yml, file);
        if (options && options.print) {
          printMetadata(meta, options);
        }
        resolve(meta);
      }
    });
  });
}

/**
 * Process the `categories` and `tags` properties of a metadata object.
 * @param meta a metadata object
 */
export function processTagsAndCategories(meta, options) {
  return new Promise((resolve, reject) => {
    const tags = meta.tags || [];
    const categories = meta.categories;
    if (!categories) {
      const category = defaultCategory;
      tags.forEach(tag =>
        makeTagLinkInCategory(meta.file, category, tag, options)
      );
    } else {
      categories.forEach(category => {
        tags.forEach(tag =>
          makeTagLinkInCategory(meta.file, category, tag, options)
        );
      });
    }
    resolve(meta);
  });
}

/**
 * Process the `tags` property of a metadata object.
 * @param meta a metadata object
 */
export function processTags(meta, options) {
  return new Promise((resolve, reject) => {
    const tags = meta.tags || [];
    tags.forEach(tag => makeTagLink(meta.file, tag, options));
    resolve(meta);
  });
}

/**
 * Make a tag link within a category.
 * @param filePath the file path of the referenced file
 * @param category the category to create a link within
 * @param tag the tag to create a link for
 */
export function makeTagLinkInCategory(filePath, category, tag, options) {
  return makeCategoryDirectory(category, options).then(dir =>
    makeTagLink(filePath, tag, { ...options, cwd: dir, tagDir: '.' })
  );
}

/**
 * Make a tag link.
 * @param filePath the file path of the referenced file
 * @param tag the tag to create a link for
 */
export function makeTagLink(filePath, tag, options) {
  return makeTagDirectory(tag, options).then(dir =>
    makeLinkOrCopy(filePath, dir, options)
  );
}

/**
 * Make a link to, or a copy of, a file.
 * If `makeSymLinks: true` is specified in `options`,
 * a link is made; otherwise, the function performs copying.
 * This function can be used to provide file copying as a fall-back
 * on systems that do not support links.
 * @param source the file to link to
 * @param destination the location of the link
 */
export function makeLinkOrCopy(source, destination, options) {
  if (options && options.makeSymLinks) {
    return makeLink(source, destination, options);
  }
  return makeCopy(source, destination, options);
}

/**
 * Make a category directory.
 */
export function makeCategoryDirectory(category, options) {
  return makeCategoryContainer(options).then(dir =>
    makeDirectory(`${dir}/${category}`, options)
  );
}

/**
 * Make a tag directory.
 */
export function makeTagDirectory(tag, options) {
  const dir = (options && options.tagDir) || tagDir;
  if (!dir) {
    return makeTagContainer(options).then(directory =>
      makeDirectory(`${directory}/${tag}`, options)
    );
  }
  return makeDirectory(`${dir}/${tag}`, options);
}

/**
 * Make a category container.
 */
export function makeCategoryContainer(options) {
  const dir = (options && options.categoryDir) || categoryDir;
  return makeDirectory(dir, options);
}

/**
 * Make a tag container.
 */
export function makeTagContainer(options) {
  const dir = (options && options.tagDir) || tagDir;
  return makeDirectory(dir, options);
}

/**
 * Make a temporary empty directory.
 * @param tempDir the directory to create
 */
export function makeTemporaryDirectory(tempDir) {
  deleteDirectory(tempDir);
  return makeDirectory(tempDir);
}

/**
 * Make a directory in the current directory.
 * Works similarly to the Unix command `mkdir -p`.
 * No error is thrown if the directory already exists.
 */
export function makeDirectory(dir, options) {
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
 * Make a link to a file.
 * @param source the file to link to
 * @param destination the location of the link
 */
export function makeLink(source, destination, options) {
  return new Promise((resolve, reject) => {
    const cwd = (options && options.cwd) || '.';
    const sourcePath = joinPaths(cwd, source);
    let destinationPath = joinPaths(cwd, destination);
    const isDirectory = fs.lstatSync(destinationPath).isDirectory();
    if (isDirectory) {
      // `fs.symlink()` cannot link in a directory like `ln`;
      // the link name must be specified explicitly
      const fileName = path.basename(sourcePath);
      destinationPath = path.join(destinationPath, fileName);
    }
    fs.symlink(sourcePath, destinationPath, err => {
      if (err) {
        const linkAreadyExists = err.code === 'EEXIST';
        if (linkAreadyExists) {
          resolve(destination);
        } else {
          reject(destination);
        }
      } else {
        resolve(destination);
      }
    });
  });
}

/**
 * Make a copy of a file.
 * @param source the source file
 * @param destination the destination file
 */
export function makeCopy(source, destination, options) {
  return new Promise((resolve, reject) => {
    const cwd = (options && options.cwd) || '.';
    const sourcePath = joinPaths(cwd, source);
    let destinationPath = joinPaths(cwd, destination);
    const isDirectory = fs.lstatSync(destinationPath).isDirectory();
    if (isDirectory) {
      // `fs.copyFile()` cannot copy to a directory like `cp`;
      // the file name must be specified explicitly
      const fileName = path.basename(sourcePath);
      destinationPath = path.join(destinationPath, fileName);
    }
    fs.copyFile(sourcePath, destinationPath, err => {
      if (err) {
        // ignore errors
        console.log(err);
        resolve(destination);
      } else {
        resolve(destination);
      }
    });
  });
}

/**
 * Recursively delete a directory and all its contents.
 * Works similarly to the Unix command `rm -rf`.
 * @param dir a directory
 */
export function deleteDirectory(dir) {
  rimraf.sync(dir);
}

/**
 * Use `rsync` to copy a file or a directory.
 * The command is invoked with the parameters `-avz`.
 * If `delete: true` is specified in `options`,
 * then `--delete` is passed as well.
 * @param source the source path
 * @param destination the destination path
 * @param [options] options object
 * @see hasRsync
 */
export function invokeRsync(source, destination, options) {
  const params = options && options.delete ? '-avz --delete' : '-avz';
  return invokeCmd(`rsync ${params} "${source}" "${destination}"`, {
    ...options,
    successValue: destination
  });
}

/**
 * Invoke a command in the current working directory.
 * @param cmd the command to invoke
 */
export function invokeCmd(cmd, options) {
  if (options && options.debug) {
    return cmd; // test
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
 * @see invokeRsync
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
export function printMetadata(meta, options) {
  console.log(meta && meta.file);
  if (options && options.debug) {
    // test
    console.log(meta);
    console.log('');
  }
}

/**
 * Create a metadata object from a YAML string.
 * @param str a YAML string
 * @return a metadata object
 */
export function parseMetadata(str, filePath, options) {
  const meta = parseYaml(str);
  if (meta.file === undefined) {
    meta.file = getFilenameFromMetadataFilename(filePath, options);
  }
  meta.meta = filePath;
  if (!(options && options.debug)) {
    meta.file = path.resolve(meta.file); // test
  }
  return meta;
}

/**
 * Parse a YAML string.
 * @param str a YAML string (may be fenced by `---`)
 * @return a metadata object, containing the YAML properties
 */
export function parseYaml(str) {
  const yml = str.trim().replace(/---$/, '');
  let meta = {};
  try {
    meta = yaml.safeLoad(yml);
  } catch (err) {
    console.log(err);
    return {};
  }
  return meta;
}

/**
 * Normalize a YAML file.
 */
export function normalizeYamlFile(file) {
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
  console.log('Normalized ' + file);
}

/**
 * Get the filename of the file that a metadata file is referring to,
 * by looking at the metadata file's filename.
 * @param filePath the filename of the metadata file
 * @return the filename of the referenced file
 * @see getMetadataFilenameFromFilename
 */
export function getFilenameFromMetadataFilename(filePath, options) {
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
 * Get the filename of the metadata file for a file,
 * by looking at the file's filename.
 * @param filePath the filename of the file
 * @return the filename of the file's metadata file
 * @see getFilenameFromMetadataFilename
 */
export function getMetadataFilenameFromFilename(filePath, options) {
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
 * Whether a file is a metadata file.
 * @param file a file name
 * @return `true` if `file` is a metadata file, `false` otherwise
 */
export function isMetadataFile(file) {
  const fileName = path.basename(file);
  return (
    fileName.match(metadataPreRegExp()) && fileName.match(metadataPostRegExp())
  );
}

/**
 * Regular expression for matching the `metaPre` part of a metadata filename.
 */
export function metadataPreRegExp() {
  return new RegExp('^' + _.escapeRegExp(metaPre));
}

/**
 * Regular expression for matching the `metaExt` part of a metadata filename.
 */
export function metadataPostRegExp() {
  return new RegExp(_.escapeRegExp(metaExt) + '$');
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
export function joinPaths(dir, file) {
  const directory = path.resolve(dir);
  let filePath = file;
  if (path.isAbsolute(filePath)) {
    filePath = path.relative(directory, filePath);
  }
  return path.join(directory, filePath);
}

/**
 * Create a dictionary mapping tags to metadata objects.
 * @param metaArr an array of metadata objects
 * @param [tagFilter] a filtering function for tags
 * @return a tag dictionary
 */
export function createTagDictionary(metaArr, tagFilter) {
  const dict = {};
  const filter = tagFilter || _.identity;

  const addToTag = (tag, meta) => {
    if (dict[tag]) {
      dict[tag].push(meta);
    } else {
      dict[tag] = [meta];
    }
  };

  // https://github.com/lodash/lodash/issues/1459
  const sortDictionary = d =>
    _(d)
      .toPairs()
      .sortBy(0)
      .fromPairs()
      .value();

  metaArr.forEach(meta => {
    const tags = meta.tags || [];
    tags.forEach(tag => {
      if (filter(tag)) {
        addToTag(tag, meta);
      }
    });
  });

  return sortDictionary(dict);
}

/**
 * Whether the current system is Windows.
 * @return `true` if the system is Windows, `false` otherwise
 */
export function isWindows() {
  return os.platform() === 'win32';
}

/**
 * Parse a tag list string.
 * @param tagListStr a space-separated list of tags
 * @return an alphabetically sorted array of strings
 * @example
 *
 * parseQuery('foo bar');
 * // => ['bar', 'foo']
 */
export function parseQuery(tagListStr) {
  const arr = tagListStr
    .trim()
    .split(' ')
    .map(s => s.trim())
    .filter(s => s !== '')
    .sort();
  return _.uniq(arr);
}

/**
 * Filter a metadata object array by a list of tags.
 * @param metaArr a metadata object array
 * @param tagList an array of tags
 * @return a filtered metadata object array
 */
export function filterByTagList(metaArr, tagList) {
  const hasTag = (meta, tag) => {
    const tags = meta.tags || [];
    return _.includes(tags, tag);
  };

  const filter = meta => {
    for (let i = 0; i < tagList.length; i++) {
      const tag = tagList[i];
      if (!hasTag(meta, tag)) {
        return false;
      }
    }
    return true;
  };

  return metaArr.filter(filter);
}

/**
 * Filter a metadata object array by a query.
 * @param metaArr a metadata object array
 * @param query a query
 * @return a filtered metadata object array
 */
export function filterByQuery(metaArr, query) {
  const tagList = parseQuery(query);
  return filterByTagList(metaArr, tagList);
}

/**
 * Make query links for a metadata object array.
 * @param metaArr a metadata object array
 * @param query a query
 * @param [options] an options object
 */
export function performQuery(metaArr, query, options) {
  const matches = filterByQuery(metaArr, query);
  matches.forEach(match => makeQueryLink(match, query, options));
}

/**
 * Make a query link for a file if the file
 * is matched by the query.
 * @param meta a metadata object
 * @param query a query
 * @param [options] an options object
 */
export function performQueryOnFile(meta, query, options) {
  return performQuery([meta], query, options);
}

/**
 * Make a query link.
 * @param meta a metadata object
 * @param query a query
 * @param [options] an options object
 */
export function makeQueryLink(meta, query, options) {
  const qDir = (options && options.queryDir) || queryDir;
  return makeDirectory(`${qDir}/${query}`).then(dir =>
    makeLinkOrCopy(meta.file, dir, options)
  );
}

export default {};
