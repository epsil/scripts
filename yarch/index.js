#!/usr/bin/env node

const fs = require('fs');
const prompt = require('cli-input');
const shell = require('shelljs');
const yaml = require('js-yaml');
const _ = require('lodash');

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
  checkYoutubedl();

  const helpArg = args && (args[0] === '--help' || args[0] === '-h');
  if (helpArg) {
    help();
    shell.exit(0);
  }

  const noArgs = !args || args.length === 0;
  if (noArgs) {
    console.log('Enter URLs separated by newlines. Submit with Ctrl-D.\n');
    const ps = prompt();
    ps.multiline(function(err, lines, str) {
      ps.close();
      if (err) {
        console.log(err);
        shell.exit(1);
      }
      const urls = lines.filter(line => line.trim() !== '');
      downloadUrls(urls);
      shell.exit(0);
    });
  } else {
    const urls = args;
    downloadUrls(urls);
    shell.exit(0);
  }
}

/**
 * Display help message.
 */
function help() {
  console.log(helpMessage);
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
  shell.cd(dir);
  youtubedl(url);
  fixMetadata();
}

/**
 * Check if `youtube-dl` is available on the system.
 * If not, display a help message and exit.
 */
function checkYoutubedl() {
  const youtubedlIsMissing = !shell.which('youtube-dl');
  if (youtubedlIsMissing) {
    shell.echo(`youtube-dl is missing. Get it from:
http://ytdl-org.github.io/youtube-dl/`);
    shell.exit(1);
  }
}

/**
 * Download a URL with `youtube-dl`.
 * @param url the URL to download
 */
function youtubedl(url) {
  const ydl = 'youtube-dl';
  const opt =
    '--add-metadata --embed-thumbnail --all-subs --embed-subs --sub-format srt --write-info-json';
  const mp4 = `${ydl} -f mp4 --add-metadata --embed-thumbnail --all-subs --embed-subs --sub-format srt --write-info-json --merge-output-format mp4 "${url}"`;
  const mkv = `${ydl} ${opt} --merge-output-format mkv "${url}"`;
  const def = `${ydl} ${opt} "${url}"`;
  const cmd = mp4;
  shell.exec(cmd);
  return url; // FIXME: return name of downloaded file
}

/**
 * Convert a URL to a filename.
 * @param url a URL
 * @return a filename
 */
function convertUrlToFilename(url) {
  let file = url;
  file = file.replace(/^https?:\/\//i, '');
  file = file.replace(/^www\./i, '');
  file = _.deburr(file);
  file = file.replace(/[/?=]/gi, '_');
  file = file.replace(/[^-0-9a-z_.,]/gi, '');
  return file;
}

/**
 * Look for `.json` files in the current directory.
 * @return a `ShellString` listing found files
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
 * Normalize metadata as YAML, if any.
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