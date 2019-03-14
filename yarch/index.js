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

  const youtubedlIsMissing = !shell.which('youtube-dl');
  if (youtubedlIsMissing) {
    shell.echo(`youtube-dl is missing. Get it from:
http://ytdl-org.github.io/youtube-dl/`);
    shell.exit(1);
  }

  const noArgs = !args || args.length === 0;
  const helpArg = args && (args[0] === '--help' || args[0] === '-h');
  if (noArgs || helpArg) {
    help();
    shell.exit(0);
  }

  const urls = args;
  urls.forEach(download);
  shell.exit(0);
}

function download(url) {
  youtubedl(url);
}

function youtubedl(url) {
  const ydl = `youtube-dl`;
  const opt =
    '--add-metadata --embed-thumbnail --all-subs --embed-subs --sub-format srt --write-info-json';
  const mp4 = `${ydl} -f mp4 --add-metadata --embed-thumbnail --all-subs --embed-subs --sub-format srt --write-info-json --merge-output-format mp4 "${url}"`;
  const mkv = `${ydl} ${opt} --merge-output-format mkv "${url}"`;
  const def = `${ydl} ${opt} "${url}"`;
  const cmd = mp4;
  return shell.exec(cmd);
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
