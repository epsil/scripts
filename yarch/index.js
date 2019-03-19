#!/usr/bin/env node

const fs = require('fs');
const getStdin = require('get-stdin');
const meow = require('meow');
const prompt = require('cli-input');
const shell = require('shelljs');
const yaml = require('js-yaml');
const _ = require('lodash');

/**
 * Help message to display when running with --help.
 */
const help = `Usage:

    yarch [URL]
    yarch [URL1] [URL2] [URL3] ...

If invoked without arguments, yarch prompts the user for URLs.

yarch can also read URLs from standard input. If urls.txt is a
text file containing a newline-separated list of URLs to download,
then the following instructs yarch to read URLs from urls.txt:

    cat urls.txt | yarch

Each URL is saved to its own directory, named after the URL.
Metadata is stored in the subdirectory .meta.

yarch requires youtube-dl, AtomicParsley and wget.
It will complain if these are missing.`;

/**
 * The "main" function.
 *
 * Execution begins here when the script is run from the command line
 * with Node.
 */
function main() {
  checkDependencies();
  const cli = meow(help);
  const hasStdin = !process.stdin.isTTY;
  if (hasStdin) {
    getStdin().then(str => {
      const urls = str.trim().split('\n');
      downloadUrls(urls);
      shell.exit(0);
    });
  } else {
    const noArgs = cli.input.length === 0;
    if (noArgs) {
      promptForURLs()
        .then(urls => {
          downloadUrls(urls);
          shell.exit(0);
        })
        .catch(err => {
          shell.exit(1);
        });
    } else {
      const urls = cli.input;
      downloadUrls(urls);
      shell.exit(0);
    }
  }
}

/**
 * Check if `youtube-dl`, `atomicparsley` and `wget` are available
 * on the system. If the former is unavailable, the program
 * will exit. If only the latter is unavailable, the program
 * will display a warning, but continue execution.
 */
function checkDependencies() {
  checkYoutubeDl();
  checkAtomicParsley();
  checkWget();
}

/**
 * Check if `youtube-dl` is available on the system.
 * If not, display a help message and exit.
 */
function checkYoutubeDl() {
  const youtubeDlIsMissing = !shell.which('youtube-dl');
  if (youtubeDlIsMissing) {
    shell.echo(`youtube-dl is missing. Get it from:
http://ytdl-org.github.io/youtube-dl/`);
    shell.exit(1);
  }
}

/**
 * Check if `atomicparsley` is available on the system.
 * If not, display a help message.
 */
function checkAtomicParsley() {
  const atomicParsleyIsMissing = !shell.which('AtomicParsley');
  if (atomicParsleyIsMissing) {
    shell.echo(`AtomicParsley is missing. Get it from:
http://atomicparsley.sourceforge.net/
`);
  }
}

/**
 * Check if `wget` is available on the system.
 * If not, display a help message.
 */
function checkWget() {
  const wgetIsMissing = !shell.which('wget');
  if (wgetIsMissing) {
    shell.echo(`wget is missing. Get it from:
http://www.gnu.org/software/wget/
`);
  }
}

/**
 * Read URLs from a prompt.
 */
function promptForURLs() {
  return new Promise((resolve, reject) => {
    console.log('Enter URLs separated by newlines. Submit with Ctrl-D.\n');
    const ps = prompt();
    ps.multiline(function(err, lines, str) {
      ps.close();
      if (err) {
        console.log(err);
        reject(err);
      }
      const urls = lines.filter(line => line.trim() !== '');
      resolve(urls);
    });
  });
}

/**
 * Download URLs.
 * @param urls an array of URLs
 */
function downloadUrls(urls) {
  urls.forEach(download);
}

/**
 * Download a URL.
 * @param url the URL to download
 */
function download(url) {
  const dir = convertUrlToFilename(url);
  shell.mkdir('-p', dir);
  shell.pushd('-q', dir);
  const statusCode = youtubeDl(url);
  const downloadWasSuccessful = statusCode === 0;
  if (downloadWasSuccessful) {
    fixMetadata();
    shell.popd('-q');
  } else {
    shell.popd('-q');
    wget(url);
  }
}

/**
 * Download a URL with `youtube-dl`.
 * @param url the URL to download
 * @return the status code returned by `youtube-dl` (`0` for success)
 */
function youtubeDl(url) {
  // FIXME: clean up this mess
  const ydl = 'youtube-dl';
  const opt =
    '--add-metadata --embed-thumbnail --all-subs --embed-subs --sub-format srt --write-info-json';
  const mp4 = `${ydl} -f mp4 --add-metadata --embed-thumbnail --all-subs --embed-subs --sub-format srt --write-info-json --merge-output-format mp4 "${url}"`;
  const mkv = `${ydl} ${opt} --merge-output-format mkv "${url}"`;
  const def = `${ydl} ${opt} "${url}"`;
  const cmd = mp4;
  return shell.exec(cmd).code;
}

/**
 * Download a URL with `wget`.
 * @param url the URL to download
 * @return the status code returned by `wget` (`0` for success)
 */
function wget(url) {
  const wget = 'wget';
  const opt =
    '--mirror --convert-links --adjust-extension --page-requisites --no-parent --no-check-certificate';
  const cmd = `${wget} ${opt} "${url}"`;
  return shell.exec(cmd).code;
}

/**
 * Convert a URL to a filename.
 * @param url a URL
 * @return a filename
 * @example
 *
 * convertUrlToFilename('http://www.example.org/foo');
 * // => 'example.org_foo'
 */
function convertUrlToFilename(url) {
  let file = url;
  file = file.replace(/^https?:\/\//i, '');
  file = file.replace(/^www\./i, '');
  file = file.replace(/\/+$/i, '');
  file = _.deburr(file);
  file = file.replace(/[/?=]/gi, '_');
  file = file.replace(/[^-0-9a-z_.,]/gi, '');
  return file;
}

/**
 * Look for a JSON metadata file in the current directory.
 * @return a file path, or the empty string if not found
 */
function findJsonFile() {
  const jsonFiles = shell.ls('-R', '*.json');
  const foundFiles = jsonFiles.length > 0;
  if (foundFiles) {
    const file = jsonFiles.shift();
    return file;
  }
  return '';
}

/**
 * Look for a JSON metadata file and convert it to YAML.
 */
function fixMetadata() {
  const jsonFile = findJsonFile();
  if (jsonFile) {
    convertJSONFileToYAMLFile(jsonFile);
  }
}

/**
 * Convert a JSON file to a YAML file.
 * This deletes the original file.
 * @param file a JSON file
 */
function convertJSONFileToYAMLFile(file) {
  const metaDir = '.meta';
  const json = fs.readFileSync(file);
  const yml = convertJSONtoYAML(json);
  shell.mkdir('-p', metaDir);
  let ymlFileName = file;
  ymlFileName = ymlFileName.replace(/\.info\.json$/, '');
  ymlFileName = '.' + ymlFileName + '.mp4' + '.yml';
  const ymlPath = metaDir + '/' + ymlFileName;
  fs.writeFileSync(ymlPath, yml);
  shell.rm('-f', file);
}

/**
 * Convert a JSON string to a YAML string.
 * @param json a JSON string
 * @return a YAML string
 */
function convertJSONtoYAML(json) {
  const obj = JSON.parse(json);
  let yml = yaml.safeDump(obj);
  yml = '---\n' + yml.trim();
  return yml;
}

// invoke the "main" function
if (require.main === module) {
  main();
}
