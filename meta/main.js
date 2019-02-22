import { processMetadataFiles } from './meta';

/**
 * The "main" function.
 *
 * Execution begins here when the script is run from the command line with Node.
 * (Note that the execution actually begins in `index.js`, which includes this
 * file, which in turn invokes `main()`.)
 */
function main() {
  const [node, cmd, inputDir, outputDir] = process.argv;
  if (inputDir === '--help' || inputDir === '-h') {
    help();
    return;
  }
  processMetadataFiles(inputDir, outputDir);
}

/**
 * Display help message.
 */
function help() {
  console.log(`Usage:

./index.js [input] [output]`);
}

// invoke the "main" function
main();
