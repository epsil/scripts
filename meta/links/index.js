#!/usr/bin/env node

const childProcess = require('child_process');
const fg = require('fast-glob');
const fs = require('fs');
const meow = require('meow');
const os = require('os');
const path = require('path');
const readline = require('readline');
const Rx = require('rxjs/Rx');
const RxOp = require('rxjs/operators');
const shell = require('shelljs');
const util = require('util');
const ws = require('windows-shortcuts');
const yaml = require('js-yaml');
const _ = require('lodash');

/**
 * Help message to display when running with --help.
 */
const help = `metalinks performs queries on files tagged with metatag.
The files matching a query are presented as a folder
containing symbolic links (or shortcuts on Windows).

Usage:

    metalinks [OPTIONS...] [QUERIES...]

Examples:

    metalinks
    metalinks "*"

These commands are identical. They create links for all tagged files
in the current directory. The links are placed in the directory _q/_/.

    metalinks "foo bar"

This command performs a query for files tagged with both "foo" and "bar".
The links are placed in the directory _q/foo bar/.

    metalinks "*" "foo bar"

This command executes the above commands in one go, which is faster
since the metadata is read only once. To split the queries across
multiple lines, write:

    metalinks "*" \\
      "foo bar" \\
      "baz quux"

The --input and --output options can be used to specify the input
and output directories explicitly:

    metalinks --input . --output _q "foo bar"

By default, the input directory is . (the current directory)
and the output directory is _q.

Files can also be read from standard input. If files.txt is a
text file containing a newline-separated list of files to process,
then it can be piped to metalinks:

    cat files.txt | metalinks "foo bar"

metalinks is fully stream-enabled, and will begin processing input
as soon as it arrives. This makes it easy to combine with other
utilities, such as find and grep.

Type metalinks --version to see the current version.

See also: metatag, yarch.`;

/**
 * The directory to look for metadata in.
 */
const sourceDir = '.';

/**
 * The directory to store links in.
 */
const destinationDir = '_q';

/**
 * Temporary directory to generate links in.
 */
const tmpDir = '_tmp';

/**
 * The subdirectory to store queries in.
 */
const queryDir = '.';

/**
 * The subdirectory to store categories in.
 */
const categoryDir = 'cat';

/**
 * The subdirectory to store tags in.
 */
const tagDir = 'tag';

/**
 * The directory to look for a metadata file in.
 */
const metaDir = '.meta';

/**
 * The dotfile prefix for a metadata file.
 */
const metaPre = '.';

/**
 * The file extension for a metadata file.
 */
const metaExt = '.yml';

/**
 * The default query.
 */
const defaultQuery = '*';

/**
 * The default category.
 */
const defaultCategory = '*';

/**
 * Whether to make links or copies.
 */
const makeLinks = true;

/**
 * Globbing pattern for directories to ignore.
 */
const ignorePattern = 'node_modules/**';

/**
 * Whether to normalize YAML files.
 */
const normalize = false;

/**
 * Maximum number of files being processed concurrently.
 */
const concurrent = 10;

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
  checkDependencies();
  const cli = meow(help, {
    flags: {
      input: {
        type: 'string',
        alias: 'i'
      },
      output: {
        type: 'string',
        alias: 'o'
      },
      clean: {
        type: 'boolean',
        alias: 'c'
      }
    }
  });

  let queries = cli.input;
  if (queries.length === 0) {
    queries = [defaultQuery];
  }

  const { input, output, clean } = cli.flags;
  const inputDir = input || sourceDir;
  const outputDir = output || destinationDir;
  validateDirectories(inputDir, outputDir);

  if (clean) {
    console.log(`Deleting ${outputDir} ...\n`);
    deleteDirectory(outputDir);
  }

  console.log(`Input directory: ${inputDir}`);
  console.log(`Output directory: ${outputDir}`);
  console.log(`Queries: ${queries.join(', ')}\n`);

  return hasLink().then(link => {
    let stream$;
    const options = {
      makeLinks: makeLinks && link
    };
    const hasStdin = !process.stdin.isTTY;
    if (hasStdin) {
      console.log('Reading from standard input ...\n');
      stream$ = metadataForFiles(stdin(), options);
    } else {
      stream$ = metadataInDirectory(inputDir, options);
    }
    processQueries(queries, stream$, outputDir, options).then(() => {
      console.log('\nDone.\n');
    });
  });
}

/**
 * Check if required libraries are available on the system.
 * If not, display a warning and exit.
 */
function checkDependencies() {
  if (isWindows()) {
    checkShortcut();
  }
}

/**
 * Check if `Shortcut.exe` is available on the system.
 * If not, display a warning and exit.
 */
function checkShortcut() {
  if (!hasShortcut()) {
    shell.echo(`Shortcut.exe is required on Windows. Get it from:
http://www.optimumx.com/downloads.html#Shortcut`);
    shell.exit(1);
  }
}

/**
 * Process queries on a metadata stream and create links in a given directory.
 * If running on a system supporting it, this function uses a temporary directory
 * for its working directory. See `processQueriesInTempDir()` for details.
 * @param queries an array of queries, e.g., `['*', 'foo bar']`
 * @param stream$ an RxJS stream of metadata objects
 * @param outputDir the directory to create links in
 * @param [tempDir] the working directory, default `tmpDir`
 * @param [options] an options object
 * @see processQueriesInTempDir
 */
function processQueries(queries, stream$, outputDir, options) {
  const hasTmpFileSupport = !isWindows(); // doesn't yet work on Windows
  if (!hasTmpFileSupport) {
    return processQueriesInDir(queries, stream$, outputDir, options);
  }
  return processQueriesInTempDir(queries, stream$, outputDir, tmpDir, options);
}

/**
 * Process queries on a metadata stream and create links in a given directory.
 * Note that this function does its work in a temporary directory, `tempDir`, and
 * then merges that directory into the output directory, `outputDir`.
 * @param queries an array of queries, e.g., `['*', 'foo bar']`
 * @param stream$ an RxJS stream of metadata objects
 * @param outputDir the directory to create links in
 * @param [tempDir] the working directory, default `tmpDir`
 * @param [options] an options object
 */
function processQueriesInTempDir(
  queries,
  stream$,
  outputDir,
  tempDir,
  options
) {
  return makeTemporaryDirectory(tempDir || tmpDir, options).then(
    tempDirectory =>
      processQueriesInDir(queries, stream$, tempDirectory, options).then(() =>
        mergeTmpDirAndOutputDir(tempDirectory, outputDir, {
          ...options,
          delete: true
        })
      )
  );
}

/**
 * Merge a temporary directory, containing links, into the target directory.
 * @param [tempDir] the temporary directory
 * @param [outputDir] the output directory
 * @param [options] an options object
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
 * @param [options] an options object
 * @see mergeTmpDirAndOutputDirWithMv
 */
function mergeTmpDirAndOutputDirWithRsync(tempDir, outputDir, options) {
  const validParams = validateRsyncParams(tempDir, outputDir, options);
  if (!validParams) {
    return Promise.resolve(false);
  }
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
        deleteDirectory(tempDir); // destructive!
      }
    });
}

/**
 * Verify that `rsync`'s parameters are safe.
 * Invoking `rsync` with incorrect parameters may cause data loss.
 * This function throws an error if an issue is detected,
 * stalling execution.
 * @param tempDir the working directory
 * @param outputDir the output directory
 * @param [options] an options object
 * @see mergeTmpDirAndOutputDirWithRsync
 */
function validateRsyncParams(tempDir, outputDir, options) {
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
    return false;
  }
  return true;
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
 * Use `mv` to merge a temporary directory into the target directory.
 * If `delete: true` is specified in `options`, and the target
 * directory already exists, then it is replaced completely.
 * @param tempDir the working directory (temporary)
 * @param outputDir the output directory
 * @param [options] an options object
 * @see mergeTmpDirAndOutputDirWithRsync
 */
function mergeTmpDirAndOutputDirWithMv(tempDir, outputDir, options) {
  const outputDirExists = fs.existsSync(outputDir);
  if (!outputDirExists) {
    return moveFile(tempDir, outputDir, options).catch(() => {
      // the wonders of working with files on Windows ...
      console.log('Windows is locking the directory, copying instead.');
      shell.cp('-r', tempDir, outputDir);
    });
  }
  const trashDir = tempDir + '2'; // '_tmp2'
  return moveFile(outputDir, trashDir)
    .then(() => moveFile(tempDir, outputDir))
    .catch(() => {
      console.log('Windows is locking the directory, copying instead.');
      const outputDirStillExists = fs.existsSync(outputDir);
      if (outputDirStillExists) {
        // moveFile() didn't succeed either, acting accordingly
        console.log('Copying into previous directory ...');
        shell.cp('-r', tempDir + '/*', outputDir);
      } else {
        shell.cp('-r', tempDir, outputDir);
      }
    })
    .then(() => {
      if (options && options.delete) {
        deleteDirectory(trashDir);
      }
    });
}

/**
 * Process queries on a metadata stream and create links in a given directory.
 * @param queries an array of queries, e.g., `['*', 'foo bar']`
 * @param stream$ an RxJS stream of metadata objects
 * @param outputDir the directory to create links in
 * @param [options] an options object
 * @return a Promise-wrapped array of return values,
 * resolved when execution has finished
 */
function processQueriesInDir(queries, stream$, outputDir, options) {
  return new Promise((resolve, reject) => {
    const opts = { cwd: outputDir, ...options };
    const result = [];
    (queries || []).forEach(query => {
      result.push(
        iterateOverStream(
          stream$,
          (meta, opt) => processMetadataQuery(meta, query, opt),
          opts
        )
      );
    });
    resolve(Promise.all(result));
  });
}

/**
 * Iterate over all metadata objects in a RxJS metadata stream.
 * @param stream$ a RxJS stream of metadata objects
 * @param fn an iterator function, invoked as `fn(meta, options)`
 * @param [options] an options object
 * @return a Promise-wrapped array of return values,
 * resolved when execution has finished
 */
function iterateOverStream(stream$, fn, options) {
  return new Promise((resolve, reject) => {
    const files = [];
    const iterator = fn || (x => x);
    const subscription = stream$.subscribe(
      meta => {
        files.push(iterator(meta, options));
      },
      null,
      () => {
        subscription.unsubscribe();
        resolve(Promise.all(files));
      }
    );
  });
}

/**
 * Create a RxJS observable to iterate over all metadata
 * in the given directory.
 * @param dir the directory to look in
 * @param [options] an options object
 * @return a RxJS stream of metadata objects
 */
function metadataInDirectory(dir, options) {
  let stream$ = new Rx.Subject();
  const cwd = (options && options.cwd) || '.';
  const concurrentFiles = (options && options.concurrent) || concurrent;
  const directory = joinPaths(cwd, dir);
  const stream = fg.stream([createGlobPattern()], {
    dot: true,
    ignore: [ignorePattern],
    cwd: directory
  });
  stream.on('data', entry => {
    const file = path.join(directory, entry);
    stream$.next(file);
  });
  stream.once('end', () => stream$.complete());
  stream$ = filterInvalidMetadata(stream$);
  stream$ = stream$.pipe(
    RxOp.mergeMap(
      file =>
        readMetadataForFile(file, {
          ...options,
          print: true
        }),
      concurrentFiles
    ),
    RxOp.share()
  );
  return stream$;
}

/**
 * Create a RxJS observable to iterate over all metadata
 * for a stream of files.
 * @param stream$ a RxJS stream of file paths
 * @param [options] an options object
 * @return a RxJS stream of metadata objects
 */
function metadataForFiles(stream$, options) {
  const cwd = (options && options.cwd) || '.';
  let meta$ = stream$.pipe(
    RxOp.mergeMap(f => {
      const file = joinPaths(cwd, f);
      const isDirectory = fs.lstatSync(file).isDirectory();
      if (isDirectory) {
        const dir$ = metadataInDirectory(file);
        return dir$;
      }
      const metaFile = getMetadataFilenameFromFilename(file);
      const metaFile$ = Rx.Observable.of(metaFile);
      return metaFile$;
    })
  );
  meta$ = filterInvalidMetadata(meta$);
  meta$ = meta$.pipe(
    RxOp.mergeMap(file =>
      readMetadataForFile(file, {
        ...options,
        print: true
      })
    )
  );
  meta$ = meta$.pipe(RxOp.share());
  return meta$;
}

/**
 * Return standard input line by line, as a RxJS observable.
 * @return a RxJS stream
 */
function stdin() {
  const rl = readline.createInterface({
    input: process.stdin
  });
  return Rx.Observable.fromEvent(rl, 'line').takeUntil(
    Rx.Observable.fromEvent(rl, 'close')
  );
}

/**
 * Filter a RxJS observable for invalid metadata files. Metadata files
 * that reference non-existent files are regarded as invalid,
 * and a warning is displayed.
 * @param stream$ a RxJS observable of file paths
 * @return a filtered RxJS observable
 */
function filterInvalidMetadata(stream$) {
  return stream$.pipe(
    RxOp.filter(metaFile => {
      const metaFileExists = fs.existsSync(metaFile);
      if (!metaFileExists) {
        console.log(`${metaFile} does not exist!`);
        return false;
      }
      if (normalize) {
        normalizeYamlFile(metaFile);
      }
      const origFile = getFilenameFromMetadataFilename(metaFile);
      const origFileExists = fs.existsSync(origFile);
      if (!origFileExists) {
        console.log(`${origFile} does not exist!
  (referenced by ${metaFile})`);
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
 * Process the metadata for a file in the context of a query.
 * @param file a file
 * @param query a query
 * @param [options] an options object
 */
function processMetadataQuery(meta, query, options) {
  performQueryOnFile(meta, query, options);
  return query;
}

/**
 * Read the metadata for a file.
 * If `print: true` is specified in `options`,
 * then the metadata is printed to the console.
 * @param file a file
 * @param [options] an options object
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
 * @param [options] an options object
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
 * Make a tag link within a category.
 * @param filePath the file path of the referenced file
 * @param category the category to create a link within
 * @param tag the tag to create a link for
 * @param [options] an options object
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
 * @param [options] an options object
 */
function makeTagLink(filePath, tag, options) {
  return makeTagDirectory(tag, options).then(dir =>
    makeLinkOrCopy(filePath, dir, options)
  );
}

/**
 * Make a link to, or a copy of, a file.
 * If `makeLinks: true` is specified in `options`,
 * a link is made; otherwise, the function performs copying.
 * This function can be used to provide file copying as a fall-back
 * on systems that do not support links.
 * @param source the file to link to
 * @param destination the location of the link
 * @param [options] an options object
 */
function makeLinkOrCopy(source, destination, options) {
  if (options && options.makeLinks) {
    return makeLink(source, destination, options);
  }
  return makeCopy(source, destination, { ...options, force: true });
}

/**
 * Make a symbolic link or a shortcut to a file.
 * Does the former on Unix and the latter on Windows.
 * @param source the file to link to
 * @param destination the location of the link
 * @param [options] an options object
 */
function makeLink(source, destination, options) {
  if (isWindows()) {
    return makeShortcut(source, destination, options);
  }
  return makeSymLink(source, destination, options);
}

/**
 * Make a category directory.
 * @param [options] an options object
 */
function makeCategoryDirectory(category, options) {
  const cDir = toFilename(category);
  return makeCategoryContainer(options).then(dir =>
    makeDirectory(`${dir}/${cDir}`, options)
  );
}

/**
 * Make a tag directory.
 * @param [options] an options object
 */
function makeTagDirectory(tag, options) {
  let dir = (options && options.tagDir) || tagDir;
  dir = toFilename(dir);
  const tDir = toFilename(tag);
  if (!dir) {
    return makeTagContainer(options).then(directory =>
      makeDirectory(`${directory}/${tDir}`, options)
    );
  }
  return makeDirectory(`${dir}/${tDir}`, options);
}

/**
 * Make a category container directory (usually `cat/`).
 * @param [options] an options object
 */
function makeCategoryContainer(options) {
  const dir = (options && options.categoryDir) || categoryDir;
  return makeDirectory(dir, options);
}

/**
 * Make a tag container directory (usually `tag/`).
 * @param [options] an options object
 */
function makeTagContainer(options) {
  const dir = (options && options.tagDir) || tagDir;
  return makeDirectory(dir, options);
}

/**
 * Make a query container directory (usually `q/`).
 * @param [options] an options object
 */
function makeQueryContainer(options) {
  const dir = (options && options.queryDir) || queryDir;
  return makeDirectory(dir, options);
}

/**
 * Make a temporary empty directory.
 * @param tempDir the directory to create
 * @param [options] an options object
 */
function makeTemporaryDirectory(tempDir, options) {
  deleteDirectory(tempDir, options);
  return makeDirectory(tempDir, options);
}

/**
 * Make a directory in the current directory.
 * Works similarly to the Unix command `mkdir`.
 * No error is thrown if the directory already exists.
 * @param dir the directory to create
 * @param [options] an options object
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
 * Make a symbolic link to a file.
 * Works similarly to the Unix command `ln`.
 * @param source the file to link to
 * @param destination the location of the link
 * @param [options] an options object
 */
function makeSymLink(source, destination, options) {
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
 * Make a Windows shortcut to a file.
 * This function requires `Shortcut.exe` to be in `PATH`:
 * http://www.optimumx.com/downloads.html#Shortcut
 * @param source the file to link to
 * @param destination the location of the link
 * @param [options] an options object
 */
function makeShortcut(source, destination, options) {
  return new Promise((resolve, reject) => {
    const cwd = (options && options.cwd) || '.';
    const sourcePath = escapePath(joinPaths(cwd, source));
    const destinationPath = escapePath(joinPaths(cwd, destination));
    ws.create(destinationPath, sourcePath);
    resolve(destination);
  });
}

/**
 * Make a copy of a file.
 * Works similarly to the Unix command `cp`.
 * @param source the source file
 * @param destination the destination file
 * @param [options] an options object
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
        if (options && options.force) {
          resolve(destination); // ignore errors
        } else {
          console.log(err);
          reject(destination);
        }
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
 * @param [options] an options object
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
 * Works similarly to the Unix command `rm -rf`
 * (sometimes called "rimraf").
 * @param dir a directory
 */
function deleteDirectory(dir) {
  return shell.rm('-rf', dir);
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
 * @param [options] an options object
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
 * @param [options] an options object
 * @return `true` if `rsync` is available, `false` otherwise
 * @see invokeRsync
 */
function hasRsync(options) {
  return hasCmd('rsync', options);
}

/**
 * Whether some sort of linking capability -- symlinks or
 * shortcuts -- is available on the system.
 * @param [options] an options object
 * @return `true` if linking is available, `false` otherwise
 * @see hasLn
 * @see hasShortcut
 */
function hasLink(options) {
  if (isWindows()) {
    return Promise.resolve(hasShortcut(options));
  }
  return hasLn(options);
}

/**
 * Whether `ln` is available on the system.
 * @param [options] an options object
 * @return `true` if `ln` is available, `false` otherwise
 */
function hasLn(options) {
  if (isWindows()) {
    return Promise.resolve(false);
  }
  return hasCmd('ln', options);
}
/**
 * Whether `shortcut.exe` is available on the system.
 * @param [options] an options object
 * @return `true` if `rsync` is available, `false` otherwise
 * @see invokeRsync
 */
function hasShortcut(options) {
  return shell.which('Shortcut', options);
}

/**
 * Whether a command is available on the system.
 * @param command the command
 * @param [options] an options object
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
 * @param [options] an options object
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
 * @param [options] an options object
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
 * Get the filename of the metadata file for a file,
 * by looking at the file's filename.
 * @param filePath the filename of the file
 * @param [options] an options object
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
 * This is basically a multimap -- i.e., a mapping from
 * keys (tags) to multiple values (metadata objects).
 * @param metaArr an array of metadata objects
 * @param [tagFilter] a filtering function for tags
 * @return a tag dictionary
 * @example
 *
 * createTagDictionary([
 *   {
 *     tags: ['bar', 'foo']
 *   }
 * ]);
 * // => {
 * //   bar: [
 * //     {
 * //       tags: ['bar', 'foo']
 * //     }
 * //   ],
 * //   foo: [
 * //     {
 * //       tags: ['bar', 'foo']
 * //     }
 * //   ]
 * // }
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
  if (!query || query === '*') {
    const qDir = (options && options.queryDir) || queryDir;
    const cDir = toFilename('*');
    return makeDirectory(`${qDir}/${cDir}`, options).then(dir =>
      metaArr.forEach(meta =>
        processTagsAndCategories(meta, {
          ...options,
          categoryDir: dir
        })
      )
    );
  }
  const matches = filterByQuery(metaArr, query);
  return matches.forEach(match => makeQueryLink(match, query, options));
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
  const qDir = toFilename(query);
  return makeQueryContainer(options)
    .then(dir => makeDirectory(`${dir}/${qDir}`, options))
    .then(dir => makeLinkOrCopy(meta.file, dir, options));
}

/**
 * Convert a string to a filename-safe string. This function returns
 * a pure ASCII string stripped of unsafe characters.
 * @param str a string
 * @return a filename
 * @example
 *
 * toFilename('*');
 * // => '_'
 *
 * toFilename('foo:bar');
 * // => 'foo_bar'
 */
function toFilename(str) {
  let file = str;
  file = file.replace(/^https?:\/\//i, '');
  file = file.replace(/^www\./i, '');
  file = file.replace(/\/+$/i, '');
  file = file.replace(/ &+ /gi, ' and ');
  file = _.deburr(file);
  file = file.replace(/[/?=*:&]/gi, '_');
  file = file.replace(/[^-0-9a-z_.,' ]/gi, '');
  return file;
}

/**
 * Escape a file path.
 * @param str a file path
 * @return an escaped file path
 */
function escapePath(str) {
  return str.replace(/ /g, ' ');
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
