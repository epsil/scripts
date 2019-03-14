#!/usr/bin/env node

const shell = require('shelljs');

/**
 * Help message to display when running with --help.
 */
const helpMessage = `Usage:

    yarch [URL]
    yarch [URL1] [URL2] [URL3] ...

Data is saved to its own folder.`;

/**
 * The "main" function.
 *
 * Execution begins here when the script is run from the command line
 * with Node.
 */
function main() {
  const [node, cmd, ...args] = process.argv;
  const noArgs = !args || args.length === 0;
  const helpArg = args && (args[0] === '--help' || args[0] === '-h');
  if (noArgs || helpArg) {
    help();
    return;
  }
}

/**
 * Display help message.
 */
function help() {
  console.log(helpMessage);
}

// invoke the "main" function
if (require.main === module) {
  main();
}
