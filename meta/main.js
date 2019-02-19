import { processMetadataFiles } from './meta';

/**
 * The "main" function.
 *
 * Execution begins here when the script is run from the command line with Node.
 * (Note that the execution actually begins in `index.js`, which includes this
 * file, which in turn invokes `main()`.)
 */
function main() {
  processMetadataFiles('lib');
}

// invoke the "main" function
main();
