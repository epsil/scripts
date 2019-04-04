#!/usr/bin/env node

const childProcess = require('child_process');
const fg = require('fast-glob');
const fs = require('fs');
const meow = require('meow');
const nodeWatch = require('node-watch');
const os = require('os');
const path = require('path');
const readline = require('readline');
const redent = require('redent');
const Rx = require('rxjs/Rx');
const RxOp = require('rxjs/operators');
const shell = require('shelljs');
const util = require('util');
const ws = require('windows-shortcuts');
const yaml = require('js-yaml');
const _ = require('lodash');

/**
 * Help message to display when running with `--help`.
 */
const help = `metalinks performs queries on files tagged with metatag.
The files matching a query are listed in a "smart folder"
containing symbolic links (or shortcuts on Windows).

Usage:

    metalinks [OPTIONS...] [QUERIES...]

Examples:

    metalinks
    metalinks "*"

These commands are identical. They create links for all tagged files
in the current directory. The links are placed in the directory _q/_/:

    _q/
      _/
        file1.txt -> /path/to/file1.txt
        file2.txt -> /path/to/file2.txt

The default input directory is . (meaning the current directory).
The default output directory is _q (where the q stands for "query").
If necessary, the --input and --output options can be used to specify
different directories:

    metalinks --input "download" --output "_links" "*"

The following command performs a query for files tagged with
both "foo" and "bar":

    metalinks "foo bar"

The links are placed in the directory _q/foo bar/:

    _q/
      foo bar/
        file3.txt -> /path/to/file3.txt
        file4.txt -> /path/to/file4.txt

The next command executes multiple queries in one go,
which is faster since the metadata is read only once:

    metalinks "*" "foo bar"

To continually monitor a directory for metadata changes, use --watch:

    metalinks --watch "*" "foo bar"

Also, to split a long list of queries across multiple lines,
it is useful to escape newlines with a backslash:

    metalinks --watch \\
      "*" \\
      "foo bar" \\
      "baz quux"

Files can also be read from standard input. If files.txt is a
text file containing a newline-separated list of files to process,
then it can be piped to metalinks:

    cat files.txt | metalinks "foo bar"

metalinks is fully stream-enabled and will begin processing input
as soon as it arrives. This makes it easy to combine with other
utilities, such as find and grep.

Type metalinks --version for the current version. For the license,
type metalinks --license. For a hint, type metalinks --hint.
For a random quote, type metalinks --quote.

See also: metatag, yarch.`;

/**
 * License to display when running with `--license`.
 */
const license = `Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

/**
 * Hint to display when running with `--hint`.
 */
const hint = `The trick is to learn the trick.
The key to the treasure is the treasure.
The name of the thing is the thing itself.
The name of the game is to name the game.

The finger that points at the moon
points the way to the moon.`;

/**
 * Quotes to display when running with `--quote`.
 */
const quotes = [
  `Last night I invented a new pleasure, and as I was giving it the first
trial an angel and a devil came rushing toward my house. They met at
my door and fought with each other over my newly created pleasure;
the one crying, "It is a sin!"---the other, "It is a virtue!"

-- Kahlil Gibran: "The New Pleasure", *The Madman*`,

  `... It's in words that the magic is---Abracadabra, Open Sesame, and
the rest---but the magic words in one story aren't magical in the
next. The real magic is to understand which words work, and when,
and for what; the trick is to learn the trick.

... And those words are made from the letters of our alphabet:
a couple-dozen squiggles we can draw with the pen. This is the key!
And the treasure, too, if we can only get our hands on it! It's as
if---as if the key to the treasure *is* the treasure!

-- John Barth, *Chimera*`,

  `"You see, Kamala, when you throw a stone into the water, it hurries by
the swiftest possible path to the bottom. It is like this when
Siddhartha has a goal, a resolve. Siddhartha does nothing---he waits,
he thinks, he fasts---but he passes through the things of this world
like a stone through water, without doing anything, without moving; he
is drawn and lets himself fall. His goal draws him to it, for he
allows nothing into his soul that might conflict with this goal. This
is what Siddhartha learned among the Samanas. It is what fools call
magic and think is performed by demons. Nothing is performed by
demons; there are no demons. Anyone can perform magic. Anyone can
reach his goals if he can think, if he can wait, if he can fast."

-- Hermann Hesse: *Siddhartha: An Indian Poem*, "Kamala"`,

  `No reference is truly direct---every reference depends on *some*
kind of coding scheme. It's just a question of how implicit it is.

-- Douglas Hofstadter: *Gödel, Escher, Bach: an Eternal Golden Braid*,
   "Six-Part Ricercar"`
];

/**
 * Default values that determine the behavior of the program.
 */
const settings = {
  /**
   * The directory to look for metadata in.
   */
  sourceDir: '.',

  /**
   * The directory to store links in.
   */
  destinationDir: '_q',

  /**
   * Temporary directory to generate links in.
   */
  tmpDir: '_tmp',

  /**
   * The subdirectory to store queries in.
   */
  queryDir: '.',

  /**
   * The subdirectory to store categories in.
   */
  categoryDir: 'cat',

  /**
   * The subdirectory to store tags in.
   */
  tagDir: 'tag',

  /**
   * The directory to look for a metadata file in.
   */
  metaDir: '.meta',

  /**
   * The dotfile prefix for a metadata file.
   */
  metaPre: '.',

  /**
   * The file extension for a metadata file.
   */
  metaExt: '.yml',

  /**
   * Query for all files.
   */
  allQuery: '@',

  /**
   * Query for all tags.
   */
  tagsQuery: '#',

  /**
   * Query for all user tags.
   */
  userTagsQuery: '+',

  /**
   * Query for all categories.
   */
  categoriesQuery: '_',

  /**
   * The default queries.
   */
  defaultQueries: ['#', '+', '_'],

  /**
   * The default category.
   */
  defaultCategory: '_',

  /**
   * Whether to make links or copies.
   */
  makeLinks: true,

  /**
   * Whether to make shortcuts on Windows.
   */
  makeShortcuts: true,

  /**
   * Globbing pattern for directories to ignore.
   */
  ignorePattern: 'node_modules/**',

  /**
   * Whether to normalize YAML files.
   */
  normalize: false,

  /**
   * Maximum number of files being processed concurrently.
   */
  concurrent: 10,

  /**
   * Number of seconds to pause when running with `--watch`.
   */
  watchDelay: 60
};

/**
 * User-adjustable settings. `input` corresponds to `--input`,
 * `runBefore` corresponds to `--run-before`, etc.
 */
const flags = {
  flags: {
    /**
     * The directory to look for metadata in.
     * The default value is `settings.sourceDir`.
     */
    input: {
      type: 'string',
      alias: 'i'
    },

    /**
     * The directory to store links in.
     * The default value is `settings.destinationDir`.
     */
    output: {
      type: 'string',
      alias: 'o'
    },

    /**
     * Whether to run in watch mode.
     * The default value is `false`.
     */
    watch: {
      type: 'boolean',
      alias: 'w'
    },

    /**
     * Optional script to run before creating links.
     */
    runBefore: {
      type: 'string',
      alias: 'rb'
    },

    /**
     * Optional script to run before merging the temporary
     * directory (`settings.tmpDir`) into the destination directory
     * (`settings.destinationDir`).
     */
    runBeforeMerge: {
      type: 'string',
      alias: 'rm'
    },

    /**
     * Optional script to run after creating links.
     */
    runAfter: {
      type: 'string',
      alias: 'ra'
    },

    /**
     * Whether to delete any pre-existing source directory
     * (`settings.sourceDir`) before creating links.
     * The default value is `false`.
     */
    clean: {
      type: 'boolean',
      alias: 'c'
    },

    /**
     * Whether to display the license (`license`).
     */
    license: {},

    /**
     * Whether to display a hint (`hint`).
     */
    hint: {}
  }
};

/**
 * The "main" function.
 *
 * Execution begins here when the script is run
 * from the command line with Node.
 */
function main() {
  checkDependencies();

  const cli = meow(help, flags);
  let queries = cli.input;
  if (_.isEmpty(queries)) {
    queries = settings.defaultQueries;
  }

  let options = { ...settings, ...cli.flags };
  const {
    input,
    output,
    watch,
    clean,
    license: licenseFlag,
    hint: hintFlag,
    quote: quoteFlag,
    sourceDir,
    destinationDir,
    makeLinks
  } = options;
  const inputDir = input || sourceDir;
  const outputDir = output || destinationDir;

  if (licenseFlag) {
    printLicense();
    shell.exit(0);
  }

  if (hintFlag) {
    printHint();
    shell.exit(0);
  }

  if (quoteFlag) {
    printQuote();
    shell.exit(0);
  }

  validateDirectories(inputDir, outputDir);

  if (clean) {
    cleanUp(outputDir);
  } else if (isWindows()) {
    printYamlComment('On Windows, --clean should be specified.\n');
  }

  printParameters(queries, inputDir, outputDir);

  return hasLink().then(link => {
    options = {
      ...options,
      makeLinks: makeLinks && link
    };
    const hasStdin = !process.stdin.isTTY;
    if (hasStdin) {
      processStdin(queries, outputDir, options);
    } else if (watch) {
      watchDirectory(queries, inputDir, outputDir, options);
    } else {
      // process metadata in directory and exit
      processDirectory(queries, inputDir, outputDir, options).then(() => {
        printYamlComment('\nDone.\n');
      });
    }
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
 * Delete the output directory.
 * @param outputDir the output directory
 */
function cleanUp(outputDir) {
  printYamlComment(`Deleting ${outputDir} ...\n`);
  deleteDirectory(outputDir);
}

/**
 * Print the license.
 */
function printLicense() {
  printHelpString(license);
}

/**
 * Print a hint.
 */
function printHint() {
  printHelpString(hint);
}

function printQuote() {
  const quote = quotes[Math.floor(Math.random() * quotes.length)];
  printHelpString(quote);
}

/**
 * Print a string nicely with indentation.
 * @param str the string to print
 * @param [indent] the number of spaces to indent
 */
function printHelpString(str, indent) {
  const indentCount = indent || 2;
  console.log('\n' + redent(str.trim(), indentCount) + '\n');
}

/**
 * Print the input parameters to the console.
 * @param queries an array of queries
 * @param inputDir the directory to look for metadata in
 * @param outputDir the directory to create links in
 */
function printParameters(queries, inputDir, outputDir) {
  printYamlComment(`Input directory: ${inputDir}`);
  printYamlComment(`Output directory: ${outputDir}`);
  printYamlComment(`Queries: ${queries.join(', ')}\n`);
}

/**
 * Watch a directory for metadata changes and process queries on them.
 * (Extremely simple implementation for the time being.)
 * @param queries an array of queries
 * @param inputDir the directory to look for metadata in
 * @param outputDir the directory to create links in
 * @param [options] an options object
 */
function watchDirectory(queries, inputDir, outputDir, options) {
  processDirectory(queries, inputDir, outputDir, options).then(() => {
    printYamlComment('\nRunning in watch mode, press Ctrl+C to quit\n');
  });
  const stream$ = metadataChangesInDirectory(inputDir, options);
  stream$
    .pipe(
      RxOp.switchMap(() =>
        processDirectory(queries, inputDir, outputDir, options)
      )
    )
    .subscribe(() => {
      printYamlComment('\nRunning in watch mode, press Ctrl+C to quit\n');
    });
}

/**
 * Process queries on files read from standard input.
 * @param queries an array of queries
 * @param inputDir the directory to look for metadata in
 * @param outputDir the directory to create links in
 * @param [options] an options object
 */
function processStdin(queries, outputDir, options) {
  printYamlComment('Reading from standard input ...\n');
  const stream$ = metadataForFiles(stdin(), options);
  processQueries(queries, stream$, outputDir, options);
}

/**
 * Process queries on a metadata stream and create links in a given directory.
 * Also runs the `--run-before` and `--run-after` commands, if specified.
 * @param queries an array of queries, e.g., `['#', 'foo bar']`
 * @param stream$ an RxJS stream of metadata objects
 * @param inputDir the directory to look for metadata in
 * @param outputDir the directory to create links in
 * @param [options] an options object
 */
function processDirectory(queries, inputDir, outputDir, options) {
  const { runBefore, runAfter } = options;
  if (runBefore) {
    printYamlComment(`Executing --run-before: ${runBefore}\n`);
    shell.exec(runBefore);
    console.log();
  }
  const stream$ = metadataInDirectory(inputDir, options);
  return processQueries(queries, stream$, outputDir, options).then(() => {
    if (runAfter) {
      printYamlComment(`\nExecuting --run-after: ${runAfter}\n`);
      shell.exec(runAfter);
      console.log();
    }
  });
}

/**
 * Process queries on a metadata stream and create links in a given directory.
 * If running on a system supporting it, this function uses a temporary directory
 * for its working directory. See `processQueriesInTempDir()` for details.
 * @param queries an array of queries, e.g., `['#', 'foo bar']`
 * @param stream$ an RxJS stream of metadata objects
 * @param outputDir the directory to create links in
 * @param [tempDir] the working directory, default `tmpDir`
 * @param [options] an options object
 * @see processQueriesInTempDir
 */
function processQueries(queries, stream$, outputDir, options) {
  const hasTmpFileSupport = !isWindows(); // doesn't yet work on Windows
  const { tmpDir } = options;
  if (!hasTmpFileSupport) {
    return processQueriesInDir(queries, stream$, outputDir, options);
  }
  return processQueriesInTempDir(queries, stream$, outputDir, tmpDir, options);
}

/**
 * Process queries on a metadata stream and create links in a given directory.
 * Note that this function does its work in a temporary directory, `tempDir`, and
 * then merges that directory into the output directory, `outputDir`.
 * @param queries an array of queries, e.g., `['#', 'foo bar']`
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
  const { runBeforeMerge } = options;
  return makeTemporaryDirectory(tempDir || settings.tmpDir, options).then(
    tempDirectory =>
      processQueriesInDir(queries, stream$, tempDirectory, options).then(() => {
        if (runBeforeMerge) {
          printYamlComment(
            `\nExecuting --run-before-merge: ${runBeforeMerge}\n`
          );
          shell.exec(runBeforeMerge);
          console.log();
        }
        return mergeTmpDirAndOutputDir(tempDirectory, outputDir, {
          ...options,
          delete: true
        });
      })
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
  const tempDirIsEmpty = _.isEmpty(fs.readdirSync(tempDir));
  if (tempDirIsEmpty) {
    printYamlComment('Working directory is empty, aborting merge.');
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
      printYamlComment('Windows is locking the directory, copying instead.');
      shell.cp('-r', tempDir, outputDir);
    });
  }
  const trashDir = tempDir + '2'; // '_tmp2'
  return moveFile(outputDir, trashDir)
    .then(() => moveFile(tempDir, outputDir))
    .catch(() => {
      printYamlComment('Windows is locking the directory, copying instead.');
      const outputDirStillExists = fs.existsSync(outputDir);
      if (outputDirStillExists) {
        // moveFile() didn't succeed either, acting accordingly
        printYamlComment('Copying into previous directory ...');
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
 * @param queries an array of queries, e.g., `['#', 'foo bar']`
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
  const { concurrent } = options;
  const cwd = (options && options.cwd) || '.';
  const directory = joinPaths(cwd, dir);
  const stream = fg.stream([createGlobPattern()], {
    dot: true,
    ignore: [settings.ignorePattern],
    cwd: directory
  });
  stream.on('data', entry => {
    const file = path.join(directory, entry);
    stream$.next(file);
  });
  stream.once('end', () => stream$.complete());
  stream$ = filterInvalidMetadata(stream$, options);
  stream$ = stream$.pipe(
    RxOp.mergeMap(
      file =>
        readMetadataForFile(file, {
          ...options,
          print: true
        }),
      concurrent
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
  meta$ = filterInvalidMetadata(meta$, options);
  meta$ = meta$.pipe(
    RxOp.mergeMap(file =>
      readMetadataForFile(file, {
        ...options,
        print: true
      })
    )
  );
  meta$ = meta$.pipe(
    RxOp.filter(meta => !_.isEmpty(meta)),
    RxOp.share()
  );
  return meta$;
}

/**
 * Create a RxJS observable for changes to metadata files
 * in a directory. Returns a stream of event objects on
 * the form `{ evt: 'update', name: '/path/to/file' }`.
 * @param dir the directory to look in
 * @param [options] an options object
 * @return a RxJS stream of event objects
 */
function metadataChangesInDirectory(dir, options) {
  const stream$ = new Rx.Subject();
  const cwd = (options && options.cwd) || '.';
  const directory = joinPaths(cwd, dir);
  const watcher = nodeWatch(dir, {
    ...options,
    filter: isMetadataFile,
    recursive: true
  });
  watcher.on('change', function(evt, name) {
    const file = path.join(directory, name);
    stream$.next({ evt, name: file });
  });
  return stream$;
}

/**
 * Get standard input line by line, as a RxJS observable.
 * Returns data as soon as it arrives.
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
function filterInvalidMetadata(stream$, options) {
  const { normalize } = options;
  return stream$.pipe(
    RxOp.filter(metaFile => {
      const metaFileExists = fs.existsSync(metaFile);
      if (!metaFileExists) {
        printYamlComment(`${metaFile} does not exist!`);
        return false;
      }
      if (normalize) {
        normalizeYamlFile(metaFile);
      }
      const origFile = getFilenameFromMetadataFilename(metaFile);
      const origFileExists = fs.existsSync(origFile);
      if (!origFileExists) {
        printYamlComment(`${origFile} does not exist!
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
  const metaDirStr = mDir || settings.metaDir;
  const metaExtStr = mExt || settings.metaExt;
  return '**/' + metaDirStr + '/*' + metaExtStr;
}

/**
 * Process the metadata for a file in the context of a query.
 * @param file a file
 * @param query a query
 * @param [options] an options object
 */
function processMetadataQuery(meta, query, options) {
  return performQueryOnFile(meta, query, options).then(() => query);
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
    const { defaultCategory } = options;
    const result = [];
    let tags = (meta && meta.tags) || [];
    tags = tags.filter(tag => typeof tag === 'string');
    let categories = (meta && meta.categories) || [defaultCategory];
    categories = categories.filter(category => typeof category === 'string');
    categories.forEach(category => {
      tags.forEach(tag => {
        result.push(makeTagLinkInCategory(meta.file, category, tag, options));
      });
    });
    Promise.all(result).then(() => resolve(meta));
  });
}

/**
 * Process the `tags` properties of a metadata object.
 * @param meta a metadata object
 * @param [options] an options object
 */
function processTags(meta, options) {
  return processProperty(meta, 'tag', makeTagLink, options);
}

/**
 * Process the `_tags` properties of a metadata object.
 * @param meta a metadata object
 * @param [options] an options object
 */
function processUserTags(meta, options) {
  const { userTagsQuery } = options;
  const makeUserTagLink = (file, tag, opts) =>
    makeTagLink(file, tag, { tagDir: userTagsQuery, ...opts });
  return processProperty(meta, '_tag', makeUserTagLink, options);
}

/**
 * Process the `tags` properties of a metadata object.
 * @param meta a metadata object
 * @param [options] an options object
 */
function processProperty(meta, prop, fn, options) {
  return new Promise((resolve, reject) => {
    const result = [];
    const iterator = fn || (x => x);
    const vals = getProp(meta, prop);
    vals.forEach(val => {
      result.push(iterator(meta.file, val, options));
    });
    Promise.all(result).then(() => resolve(meta));
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
  const tDir = (options && options.tagDir) || toFilename(settings.tagDir);
  const dir = toFilename(tag);
  return makeLinkInDirectory(filePath, `${tDir}/${dir}`, options);
}

/**
 * Make a link to a file in a given directory.
 * @param file The file to link to
 * @param dir The directory to place the link in
 * @param [options] an options object
 */
function makeLinkInDirectory(file, dir, options) {
  return new Promise((resolve, reject) => {
    const cwd = (options && options.cwd) || '.';
    const dirPath = joinPaths(cwd, dir);
    const dirExists = fs.existsSync(dirPath);
    if (!dirExists) {
      shell.mkdir('-p', dirPath);
    }
    makeLink(file, dirPath, options).then(resolve);
  });
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
function makeLink(source, destination, options) {
  if (options && options.makeShortcuts && isWindows()) {
    return makeShortcut(source, destination, options);
  }
  if (options && options.makeLinks) {
    return makeSymLink(source, destination, options);
  }
  return makeCopy(source, destination, options);
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
  const tagDir = { options };
  const dir = (options && options.tagDir) || toFilename(tagDir);
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
  const dir = (options && options.categoryDir) || settings.categoryDir;
  return makeDirectory(dir, options);
}

/**
 * Make a tag container directory (usually `tag/`).
 * @param [options] an options object
 */
function makeTagContainer(options) {
  const dir = (options && options.tagDir) || settings.tagDir;
  return makeDirectory(dir, options);
}

/**
 * Make a query container directory (usually `q/`).
 * @param [options] an options object
 */
function makeQueryContainer(options) {
  const dir = (options && options.queryDir) || settings.queryDir;
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
    const sourcePath = joinPaths(cwd, source);
    const destinationPath = joinPaths(cwd, destination);
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
          printYamlComment(err);
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
 * Promise wrapper for `childProcess.exec()`.
 * http://stackoverflow.com/questions/20643470/execute-a-command-line-binary-with-node-js#20643568
 */
const execAsync = util.promisify(childProcess.exec);

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
  const obj = {};
  const props = {};
  if (meta && meta.tags) {
    props.tags = meta.tags;
  }
  if (meta && meta.categories) {
    props.categories = meta.categories;
  }
  obj[meta.file] = props;
  const yml = yaml.safeDump(obj, { lineWidth: 255, flowLevel: 2 }).trim();
  console.log(yml);
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
    printYamlComment(err);
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
  printYamlComment('Normalized ' + file);
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
 * Regular expression for matching the `settings.metaPre` part
 * of a metadata filename.
 */
function metadataPreRegExp() {
  return new RegExp('^' + _.escapeRegExp(settings.metaPre));
}

/**
 * Regular expression for matching the `settings.metaExt` part
 * of a metadata filename.
 */
function metadataPostRegExp() {
  return new RegExp(_.escapeRegExp(settings.metaExt) + '$');
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
  const { allQuery, tagsQuery, userTagsQuery, categoriesQuery } = options;
  if (!query || query === categoriesQuery) {
    return performCategoriesQuery(metaArr, options);
  }
  if (query === tagsQuery) {
    return performTagsQuery(metaArr, options);
  }
  if (query === userTagsQuery) {
    return performUserTagsQuery(metaArr, options);
  }
  if (query === allQuery) {
    return performAllQuery(metaArr, options);
  }
  const matches = filterByQuery(metaArr, query);
  return Promise.all(
    matches.map(match => makeQueryLink(match, query, options))
  );
}

/**
 * Perform an all query (`settings.allQuery`).
 * @param metaArr a metadata object array
 * @param [options] an options object
 */
function performAllQuery(metaArr, options) {
  const { allQuery } = options;
  const dir = toFilename(allQuery);
  return Promise.all(
    metaArr.map(meta => makeLinkInDirectory(meta.file, dir, options))
  );
}

/**
 * Perform a tags query (`settings.tagsQuery`).
 * @param metaArr a metadata object array
 * @param [options] an options object
 */
function performTagsQuery(metaArr, options) {
  const { tagsQuery } = options;
  const tDir = toFilename(tagsQuery);
  return makeDirectory(tDir, options).then(dir =>
    Promise.all(
      metaArr.map(meta =>
        processTags(meta, {
          ...options,
          tagDir: dir
        })
      )
    )
  );
}

/**
 * Perform a user tags query (`settings.userTagsQuery`).
 * @param metaArr a metadata object array
 * @param [options] an options object
 */
function performUserTagsQuery(metaArr, options) {
  const { userTagsQuery } = options;
  const tDir = toFilename(userTagsQuery);
  return makeDirectory(tDir, options).then(dir =>
    Promise.all(
      metaArr.map(meta =>
        processUserTags(meta, {
          ...options,
          tagDir: dir
        })
      )
    )
  );
}

/**
 * Perform a categories query (`settings.categoriesQuery`).
 * @param metaArr a metadata object array
 * @param [options] an options object
 */
function performCategoriesQuery(metaArr, options) {
  const { categoriesQuery } = options;
  const qDir = (options && options.queryDir) || settings.queryDir;
  const cDir = toFilename(categoriesQuery);
  return makeDirectory(`${qDir}/${cDir}`, options).then(dir =>
    Promise.all(
      metaArr.map(meta =>
        processTagsAndCategories(meta, {
          ...options,
          categoryDir: dir
        })
      )
    )
  );
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
  const qDir = (options && options.queryDir) || toFilename(settings.queryDir);
  const dir = toFilename(query);
  return makeLinkInDirectory(meta.file, `${qDir}/${dir}`, options);
}

/**
 * Convert a string to a filename-safe string. This function returns
 * a pure ASCII string stripped of unsafe characters.
 * @param str a string
 * @param [options] an options object
 * @return a filename
 * @example
 *
 * toFilename('*');
 * // => '_'
 *
 * toFilename('foo:bar');
 * // => 'foo_bar'
 */
function toFilename(str, options) {
  let file = str;
  if (
    file === settings.allQuery ||
    file === settings.tagsQuery ||
    file === settings.userTagsQuery
  ) {
    return file;
  }
  file = file.replace(/^https?:\/\//i, '');
  file = file.replace(/^www\./i, '');
  file = file.replace(/\/+$/i, '');
  file = file.replace(/ &+ /gi, ' and ');
  file = _.deburr(file);
  file = file.replace(/[/?=*:&]/gi, '_');
  file = file.replace(/[^-0-9a-z_.,' ]/gi, '');
  file = _.truncate(file, { length: 100, omission: '', ...options });
  return file;
}

/**
 * Whether a metadata object has a tag.
 * @param meta a metadata object
 * @param tag a tag
 * @return `true` if it has the tag, `false` otherwise
 */
function hasTag(meta, tag) {
  return hasProp(meta, 'tag', tag);
}

/**
 * Whether a metadata object has a category.
 * @param meta a metadata object
 * @param category a category
 * @return `true` if it has the category, `false` otherwise
 */
function hasCategory(meta, category) {
  return hasProp(meta, 'category', category);
}

/**
 * Whether a metadata property contains a value.
 * @param meta a metadata object
 * @param prop a property string
 * @param val a value
 * @return `true` if it contains the value, `false` otherwise
 */
function hasProp(meta, prop, val) {
  if (!meta) {
    return false;
  }
  if (meta[prop] === val) {
    return true;
  }
  const arr = meta[plural(prop)];
  return _.includes(arr, val);
}

/**
 * Get the value of a metadata property.
 * @param meta a metadata object
 * @param prop the property's name, a string
 * @return an array of all values assigned to the property
 */
function getProp(meta, prop) {
  let result = [];
  if (!meta) {
    return result;
  }
  if (meta[prop]) {
    result.push(meta[prop]);
  }
  if (meta[plural(prop)]) {
    result = result.concat(meta[plural(prop)]);
  }
  result = result.filter(tag => typeof tag === 'string');
  result = _.uniq(result);
  return result;
}

/**
 * Return the plural form of a string.
 * @param str a singular string
 * @return the plural form
 * @example
 *
 * plural('tag');
 * // => 'tags'
 *
 * plural('category');
 * // => 'categories'
 */
function plural(str) {
  if (str === 'category') {
    return 'categories';
  }
  return str + 's';
}

/**
 * Print a string as a YAML comment.
 * The string is prefixed with `# `. If it spans multiple lines,
 * then each line is prefixed.
 * @param str a string
 */
function printYamlComment(str) {
  if (str === '') {
    console.log();
  }
  const hasLeadingWhitespace = str.match(/^\s+/);
  const hasTrailingWhitespace = str.match(/\s+$/);
  const lineBeginnings = /^/gm;
  const commentMarker = '# ';
  const yml = str.trim().replace(lineBeginnings, commentMarker);
  if (hasLeadingWhitespace) {
    console.log();
  }
  console.log(yml);
  if (hasTrailingWhitespace) {
    console.log();
  }
}

// export functions for testing
module.exports = {
  createGlobPattern,
  createTagDictionary,
  filterByTagList,
  getFilenameFromMetadataFilename,
  getMetadataFilenameFromFilename,
  getProp,
  hasCategory,
  hasCmd,
  hasProp,
  hasTag,
  invokeRsync,
  makeCategoryContainer,
  makeDirectory,
  makeQueryLink,
  makeTagContainer,
  mergeTmpDirAndOutputDirWithRsync,
  parseMetadata,
  parseQuery,
  parseYaml,
  plural,
  settings,
  toFilename,
  validateDirectories
};

// invoke the "main" function
if (require.main === module) {
  main();
}
