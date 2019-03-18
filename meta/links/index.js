#!/usr/bin/env node

const getStdin = require('get-stdin');
const fs = require('fs');
const fg = require('fast-glob');
const meow = require('meow');
const os = require('os');
const path = require('path');
const rimraf = require('rimraf');
const Rx = require('rxjs/Rx');
const RxOp = require('rxjs/operators');
const shell = require('shelljs');
const util = require('util');
const yaml = require('js-yaml');
const _ = require('lodash');
const childProcess = require('child_process');

/**
 * Help message to display when running with --help.
 */
const help = `Usage:

    metalinks [QUERY] [INPUTDIR] [OUTPUTDIR]

Examples:

    metalinks
    metalinks "foo bar"
    metalinks "foo bar" . ./_meta

The first command creates symlinks for all the files in the current
directory.

The second command performs a query in the current directory (.).

The third command performs a query while specifying the input
and output directories explicitly. By default, the input directory
is . and the output directory is ./_meta.`;

/**
 * The directory to look for metadata in.
 */
const sourceDir = '.';

/**
 * The directory to store links in.
 */
const destinationDir = '_meta';

/**
 * The subdirectory to store categories in.
 */
const categoryDir = 'cat';

/**
 * The subdirectory to store tags in.
 */
const tagDir = 'tag';

/**
 * The subdirectory to store queries in.
 */
const queryDir = 'q';

/**
 * The default category.
 */
const defaultCategory = '_';

/**
 * The directory to store metadata files in.
 */
const metaDir = '.meta';

/**
 * Temporary directory to generate symlinks in.
 */
const tmpDir = '_tmp';

/**
 * The dotfile prefix for metadata files.
 */
const metaPre = '.';

/**
 * The file extension for metadata files.
 */
const metaExt = '.yml';

/**
 * Whether to make symbolic links or copies.
 */
const makeSymLinks = true;

/**
 * Globbing pattern for directories to ignore.
 */
const ignorePattern = 'node_modules/**';

/**
 * Whether to normalize YAML files.
 */
const normalize = false;

/**
 * Promise wrapper for `childProcess.exec()`.
 * http://stackoverflow.com/questions/20643470/execute-a-command-line-binary-with-node-js#20643568
 */
const execAsync = util.promisify(childProcess.exec);

/**
 * The "main" function.
 *
 * Execution begins here when the script is run from the command line
 * with Node.
 */
function main() {
  const cli = meow(help);
  const [query, inputDir, outputDir] = cli.input;
  processMetadataFiles(inputDir, outputDir, query);
  // TODO: create RxJS stream for stdin, so that input can
  // be processed faster, as it arrives
  getStdin().then(str => {
    console.log(str);
  });
}

/**
 * Process all metadata files in the given directory.
 * @param [inputDir] the directory to look for metadata files in
 * (`sourceDir` by default)
 * @param [outputDir] the directory to create symlinks in
 * (`categoryDir` by default)
 */
function processMetadataFiles(inputDir, outputDir, query, options) {
  let inDir = inputDir;
  let outDir = outputDir;
  if (!inDir || inDir === '.') {
    inDir = sourceDir;
  }
  if (!outDir || outDir === '.') {
    outDir = destinationDir;
  }
  validateDirectories(inDir, outDir);
  return hasLn().then(ln => {
    console.log(`Input directory is: ${inDir}`);
    console.log(`Output directory is: ${outDir}`);
    if (query) {
      console.log(`Query is: ${query}`);
    }
    console.log('Processing metadata ...\n');
    return processMetadataFilesWithTmpDir(inDir, outDir, tmpDir, query, {
      makeSymLinks: makeSymLinks && ln,
      ...options
    }).then(() => {
      console.log('Done.\n');
    });
  });
}

/**
 * Verify that the input and output directories are safe.
 * If not, then throw an error to prevent data loss.
 */
function validateDirectories(inputDir, outputDir) {
  if (!outputDir || outputDir === '.') {
    throw new Error('Output directory cannot be the current directory');
  }
}

/**
 * Process metadata files by creating symlinks in a temporary directory
 * and then merging that into the target directory.
 * @param [inputDir] the directory to look for metadata files in
 * @param [outputDir] the directory to create symlinks in
 * @param [tempDir] the temporary directory to create symlinks in
 */
function processMetadataFilesWithTmpDir(
  inputDir,
  outputDir,
  tempDir,
  query,
  options
) {
  return makeTemporaryDirectory(tempDir || tmpDir).then(tempDirectory =>
    processMetadataFilesInDir(inputDir, tempDirectory, query, options).then(
      () =>
        mergeTmpDirAndOutputDir(tempDirectory, outputDir, {
          ...options,
          delete: !query
        })
    )
  );
}

/**
 * Process metadata files by creating symlinks in a target directory.
 * @param [inputDir] the directory to look for metadata files in
 * @param [outputDir] the directory to create symlinks in
 */
function processMetadataFilesInDir(inputDir, outputDir, query, options) {
  const inputDirectory = path.relative(outputDir, inputDir);
  const opt = {
    ...options,
    cwd: outputDir
  };
  if (query) {
    return iterateOverDirectory(
      inputDirectory,
      (file, opts) => processMetadataQuery(file, query, opts),
      opt
    );
  }
  return iterateOverDirectory(inputDirectory, processMetadata, opt);
}

/**
 * Merge a temporary directory of symlinks into the target directory.
 * @param [tempDir] the temporary directory
 * @param [outputDir] the output directory
 */
function mergeTmpDirAndOutputDir(tempDir, outputDir, options) {
  return hasRsync().then(rsync => {
    if (rsync) {
      return mergeTmpDirAndOutputDirWithRsync(tempDir, outputDir, options);
    }
    return mergeTmpDirAndOutputDirWithMv(tempDir, outputDir, options);
  });
}

/**
 * Use `rsync` to merge a temporary directory into the target directory.
 * If `delete: true` is specified in `options`, then `rsync` is invoked
 * with the `--delete` option. This function is potentially destructive
 * and is equipped with a number of validation checks to prevent data loss.
 * Even so, the caller should take the most utmost care to ensure that the
 * parameters are correct.
 * @param tempDir the working directory (temporary)
 * @param outputDir the output directory
 * @see mergeTmpDirAndOutputDirWithMv
 */
function mergeTmpDirAndOutputDirWithRsync(tempDir, outputDir, options) {
  // validation checks
  const tempDirIsCurrentDir = tempDir === '.' || tempDir === '';
  if (tempDirIsCurrentDir) {
    throw new Error('The working directory cannot be the current directory');
  }
  const absTempDir = path.resolve(tempDir);
  const absOutputDir = path.resolve(outputDir);
  const isSameDir = absTempDir === absOutputDir;
  if (isSameDir) {
    throw new Error(
      'The working directory cannot be equivalent to the output directory'
    );
  }
  const outputDirIsParentOfTempDir = absTempDir.startsWith(absOutputDir);
  if (outputDirIsParentOfTempDir) {
    throw new Error(
      'The output directory cannot be a parent of the working directory'
    );
  }
  const tempDirDoesNotExist = !fs.existsSync(tempDir);
  if (tempDirDoesNotExist) {
    throw new Error('The working directory does not exist');
  }
  const tempDirIsEmpty = fs.readdirSync(tempDir).length === 0;
  if (tempDirIsEmpty) {
    console.log('Working directory is empty, aborting merge.');
    if (options && options.delete) {
      deleteDirectory(tempDir);
    }
    return Promise.resolve(null);
  }
  // directories look okay, proceed with merge
  const temporaryDir = tempDir + '/';
  return makeDirectory(outputDir)
    .then(() =>
      invokeRsync(temporaryDir, outputDir, {
        errorValue: true,
        delete: true, // destructive!
        ...options
      })
    )
    .then(() => {
      if (options && options.delete) {
        deleteDirectory(tempDir);
      }
    }); // destructive!
}

/**
 * Use `mv` to merge a temporary directory into the target directory.
 * If `delete: true` is specified in `options`, and the target
 * directory already exists, then it is replaced completely.
 * @param tempDir the working directory (temporary)
 * @param outputDir the output directory
 * @see mergeTmpDirAndOutputDirWithRsync
 */
function mergeTmpDirAndOutputDirWithMv(tempDir, outputDir, options) {
  const outputDirExists = fs.existsSync(outputDir);
  if (!outputDirExists) {
    return moveFile(tempDir, outputDir, options);
  }
  const trashDir = tempDir + '2'; // '_tmp2'
  return moveFile(outputDir, trashDir)
    .then(() => moveFile(tempDir, outputDir))
    .then(() => {
      if (options && options.delete) {
        deleteDirectory(trashDir);
      }
    });
}

/**
 * Iterate over all metadata files in a given directory.
 * @param fn an iterator function, receiving a file path for each metadata file
 * @param dir the directory to look in
 * @return a Promise-wrapped array of return values
 */
function iterateOverDirectory(dir, fn, options) {
  const files$ = metadataInDirectory(dir, options);
  return iterateOverStream(files$, fn, options);
}

/**
 * Iterate over all metadata files in a RxJS stream.
 * @param files$ a RxJS stream of metadata file paths
 * @param fn an iterator function, receiving a file path for each metadata file
 * @return a Promise-wrapped array of return values
 */
function iterateOverStream(files$, fn, options) {
  return new Promise((resolve, reject) => {
    const files = [];
    const iterator = fn || (x => x);
    return files$.subscribe(
      file => {
        files.push(iterator(file, options));
      },
      null,
      () => {
        resolve(Promise.all(files));
      }
    );
  });
}

/**
 * Create a RxJS observable to iterate over all metadata files
 * in the given directory.
 * @param dir the directory to look in
 * @return a stream object, in the form of a RxJS observable
 */
function metadataInDirectory(dir, options) {
  const files$ = new Rx.Subject();
  const cwd = (options && options.cwd) || '.';
  const directory = joinPaths(cwd, dir);
  const stream = fg.stream([createGlobPattern()], {
    dot: true,
    ignore: [ignorePattern],
    cwd: directory
  });
  stream.on('data', entry => {
    const file = path.join(directory, entry);
    files$.next(file);
  });
  stream.once('end', () => files$.complete());
  return filterNonExistentFiles(files$);
}

/**
 * Filter a RxJS observable for non-existing files.
 * Only existing files are retained.
 * @param files$ a RxJS observable of file paths
 * @return a filtered RxJS observable
 */
function filterNonExistentFiles(files$) {
  return files$.pipe(
    RxOp.filter(file => {
      if (normalize) {
        normalizeYamlFile(file);
      }
      const origFile = getFilenameFromMetadataFilename(file);
      const origFileExists = fs.existsSync(origFile);
      if (!origFileExists) {
        console.log(`${origFile} does not exist!
  (referenced by ${file})`);
        return false;
      }
      return true;
    })
  );
}

/**
 * Create a glob string for matching all metadata files in a directory.
 * Note that the pattern treats dots (`.`) as normal characters,
 * so it is necessary to set `dot: true` in the globbing options.
 * @param [mDir] the metadata file directory
 * @param [mExt] the metadata file extension
 * @return a globbing pattern
 */
function createGlobPattern(mDir, mExt) {
  const metaDirStr = mDir || metaDir;
  const metaExtStr = mExt || metaExt;
  return '**/' + metaDirStr + '/*' + metaExtStr;
}

/**
 * Process the metadata for a file.
 * @param file a file
 */
function processMetadata(file, options) {
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
function processMetadataQuery(file, query, options) {
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
function readMetadataForFile(file, options) {
  return new Promise((resolve, reject) => {
    fs.readFile(file, 'utf8', (err, data) => {
      if (err) {
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
function processTagsAndCategories(meta, options) {
  return new Promise((resolve, reject) => {
    const tags = (meta && meta.tags) || [];
    const categories = (meta && meta.categories) || [defaultCategory];
    categories.forEach(category => {
      tags.forEach(tag => {
        makeTagLinkInCategory(meta.file, category, tag, options);
      });
    });
    resolve(meta);
  });
}

/**
 * Process the `tags` property of a metadata object.
 * @param meta a metadata object
 */
function processTags(meta, options) {
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
function makeTagLinkInCategory(filePath, category, tag, options) {
  return makeCategoryDirectory(category, options).then(dir =>
    makeTagLink(filePath, tag, { ...options, cwd: dir, tagDir: '.' })
  );
}

/**
 * Make a tag link.
 * @param filePath the file path of the referenced file
 * @param tag the tag to create a link for
 */
function makeTagLink(filePath, tag, options) {
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
function makeLinkOrCopy(source, destination, options) {
  if (options && options.makeSymLinks) {
    return makeLink(source, destination, options);
  }
  return makeCopy(source, destination, options);
}

/**
 * Make a category directory.
 */
function makeCategoryDirectory(category, options) {
  return makeCategoryContainer(options).then(dir =>
    makeDirectory(`${dir}/${category}`, options)
  );
}

/**
 * Make a tag directory.
 */
function makeTagDirectory(tag, options) {
  const dir = (options && options.tagDir) || tagDir;
  if (!dir) {
    return makeTagContainer(options).then(directory =>
      makeDirectory(`${directory}/${tag}`, options)
    );
  }
  return makeDirectory(`${dir}/${tag}`, options);
}

/**
 * Make a category container directory (usually `cat/`).
 */
function makeCategoryContainer(options) {
  const dir = (options && options.categoryDir) || categoryDir;
  return makeDirectory(dir, options);
}

/**
 * Make a tag container directory (usually `tag/`).
 */
function makeTagContainer(options) {
  const dir = (options && options.tagDir) || tagDir;
  return makeDirectory(dir, options);
}

/**
 * Make a query container directory (usually `q/`).
 */
function makeQueryContainer(options) {
  const dir = (options && options.queryDir) || queryDir;
  return makeDirectory(dir, options);
}

/**
 * Make a temporary empty directory.
 * @param tempDir the directory to create
 */
function makeTemporaryDirectory(tempDir) {
  deleteDirectory(tempDir);
  return makeDirectory(tempDir);
}

/**
 * Make a directory in the current directory.
 * Works similarly to the Unix command `mkdir`.
 * No error is thrown if the directory already exists.
 */
function makeDirectory(dir, options) {
  return new Promise((resolve, reject) => {
    const cwd = (options && options.cwd) || '.';
    const dirPath = joinPaths(cwd, dir);
    // warning: the `recursive` option does not work
    // with old Node versions
    fs.mkdir(dirPath, { recursive: true }, err => {
      if (err) {
        const dirAlreadyExists = err.code === 'EEXIST';
        if (dirAlreadyExists) {
          resolve(dirPath);
        } else {
          reject(dirPath);
        }
      } else {
        resolve(dirPath);
      }
    });
  });
}

/**
 * Make a link to a file.
 * Works similarly to the Unix command `ln`.
 * @param source the file to link to
 * @param destination the location of the link
 */
function makeLink(source, destination, options) {
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
 * Works similarly to the Unix command `cp`.
 * @param source the source file
 * @param destination the destination file
 */
function makeCopy(source, destination, options) {
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
 * Move a file.
 * Works similarly to the Unix command `mv`.
 * @param source the file to move
 * @param destination the destination
 */
function moveFile(source, destination, options) {
  return new Promise((resolve, reject) => {
    const cwd = (options && options.cwd) || '.';
    const sourcePath = joinPaths(cwd, source);
    const destinationPath = joinPaths(cwd, destination);
    fs.rename(sourcePath, destinationPath, err => {
      if (err) {
        reject(err);
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
function deleteDirectory(dir) {
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
function invokeRsync(source, destination, options) {
  const opt = { ...options, successValue: destination };
  const param = opt.delete ? '-avz --delete' : '-avz';
  const cmd = `rsync ${param} "${source}" "${destination}"`;
  return invokeCmd(cmd, opt);
}

/**
 * Invoke a command in the current working directory.
 * @param cmd the command to invoke
 */
function invokeCmd(cmd, options) {
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
function hasRsync(options) {
  return hasCmd('rsync', options);
}

/**
 * Whether `ln` is available on the system.
 * @return `true` if `ln` is available, `false` otherwise
 */
function hasLn(options) {
  if (isWindows()) {
    return Promise.resolve(false);
  }
  return hasCmd('ln', options);
}

/**
 * Whether a command is available on the system.
 * @param command the command
 * @return `true` if `command` is available, `false` otherwise
 */
function hasCmd(command, options) {
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
function printMetadata(meta, options) {
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
function parseMetadata(str, filePath, options) {
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
  console.log('Normalized ' + file);
}

/**
 * Get the filename of the file that a metadata file is referring to,
 * by looking at the metadata file's filename.
 * @param filePath the filename of the metadata file
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
 * Whether a file is a metadata file.
 * @param file a file name
 * @return `true` if `file` is a metadata file, `false` otherwise
 */
function isMetadataFile(file) {
  const fileName = path.basename(file);
  return (
    fileName.match(metadataPreRegExp()) && fileName.match(metadataPostRegExp())
  );
}

/**
 * Regular expression for matching the `metaPre` part of a metadata filename.
 */
function metadataPreRegExp() {
  return new RegExp('^' + _.escapeRegExp(metaPre));
}

/**
 * Regular expression for matching the `metaExt` part of a metadata filename.
 */
function metadataPostRegExp() {
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
function joinPaths(dir, file) {
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
function createTagDictionary(metaArr, tagFilter) {
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
function isWindows() {
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
function parseQuery(tagListStr) {
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
function filterByTagList(metaArr, tagList) {
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
function filterByQuery(metaArr, query) {
  const tagList = parseQuery(query);
  return filterByTagList(metaArr, tagList);
}

/**
 * Make query links for a metadata object array.
 * @param metaArr a metadata object array
 * @param query a query
 * @param [options] an options object
 */
function performQuery(metaArr, query, options) {
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
function performQueryOnFile(meta, query, options) {
  return performQuery([meta], query, options);
}

/**
 * Make a query link.
 * @param meta a metadata object
 * @param query a query
 * @param [options] an options object
 */
function makeQueryLink(meta, query, options) {
  return makeQueryContainer(options)
    .then(dir => makeDirectory(`${dir}/${query}`, options))
    .then(dir => makeLinkOrCopy(meta.file, dir, options));
}

// export functions for testing
module.exports = {
  categoryDir,
  createGlobPattern,
  createTagDictionary,
  filterByTagList,
  getFilenameFromMetadataFilename,
  getMetadataFilenameFromFilename,
  hasCmd,
  invokeRsync,
  makeCategoryContainer,
  makeDirectory,
  makeTagContainer,
  mergeTmpDirAndOutputDirWithRsync,
  metaDir,
  metaExt,
  parseMetadata,
  parseQuery,
  parseYaml,
  tagDir,
  validateDirectories
};

// invoke the "main" function
if (require.main === module) {
  main();
}
