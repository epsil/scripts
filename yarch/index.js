#!/usr/bin/env node

const fs = require('fs');
const getStdin = require('get-stdin');
const meow = require('meow');
const path = require('path');
const prompt = require('cli-input');
const shell = require('shelljs');
const yaml = require('js-yaml');
const _ = require('lodash');

/**
 * Help message to display when running with `--help`.
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
It will complain if these are missing.

Type yarch --version to see the current version.

See also: metalinks, metatag.`;

/**
 * Default values that determine the behavior of the program.
 */
const settings = {
  /**
   * The directory to store metadata files in.
   */
  metaDir: '.meta',

  /**
   * The dotfile prefix for metadata files.
   */
  metaPre: '.',

  /**
   * The file extension for metadata files.
   */
  metaExt: '.yml',

  /**
   * Whether to output a "rich" YAML prefix.
   */
  richHeader: true
};

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
  const file = youtubeDl(url);
  const downloadWasSuccessful = file !== '';
  if (downloadWasSuccessful) {
    fixMetadata(url);
    shell.popd('-q');
    const directory = file.replace(/\.mp4$/i, '');
    shell.mv(dir, directory);
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
  const statusCode = shell.exec(cmd).code;
  const downloadWasSuccessful = statusCode === 0;
  if (downloadWasSuccessful) {
    const mp4Files = shell.ls('-R', '*.mp4');
    const foundFiles = mp4Files.length > 0;
    if (foundFiles) {
      const file = mp4Files.shift();
      return file;
    }
  }
  return '';
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
  file = file.replace(/[/?=*]/gi, '_');
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
function fixMetadata(url) {
  const jsonFile = findJsonFile();
  if (jsonFile) {
    convertJSONFileToYAMLFile(jsonFile, url);
  }
}

/**
 * Convert a JSON file to a YAML file.
 * This deletes the original file.
 * @param file a JSON file
 */
function convertJSONFileToYAMLFile(file, url) {
  const json = fs.readFileSync(file);
  let ymlFileName = file;
  ymlFileName = ymlFileName.replace(/\.info\.json$/, '');
  ymlFileName = '.' + ymlFileName + '.mp4' + '.yml';
  const ymlPath = settings.metaDir + '/' + ymlFileName;
  const yml = convertJSONtoYAML(json, url, ymlFileName);
  shell.mkdir('-p', settings.metaDir);
  fs.writeFileSync(ymlPath, yml);
  shell.rm('-f', file);
}

/**
 * Convert a JSON string to a YAML string.
 * @param json a JSON string
 * @return a YAML string
 */
function convertJSONtoYAML(json, url, file) {
  let obj = JSON.parse(json);
  if (url) {
    const normUrl = normalizeUrl(url);
    if (obj.url) {
      obj.urls = [normUrl, obj.url];
      obj.urls = _.uniq(obj.urls);
    }
    obj.url = normUrl;
  }
  obj = reorderProperties(obj);
  let yml = yaml.safeDump(obj);
  yml = addYAMLHeader(yml, file);
  return yml;
}

/**
 * Add a YAML header to a YAML string.
 * Any previous header is overwritten.
 * @param yml a YAML string
 * @param [metaFile] the file name of the YAML file
 * @return a YAML document
 */
function addYAMLHeader(yml, metaFile) {
  let ymlHeader = '---' + '\n';

  if (settings.richHeader && metaFile) {
    const origFile = path.basename(getFilenameFromMetadataFilename(metaFile));
    ymlHeader = '---' + ' # ' + origFile + '\n';
  }

  const hasHeader = yml.match(/^---\n/i);
  if (hasHeader) {
    return yml.replace(/^---.*\n/, ymlHeader);
  }

  const ymlDoc = ymlHeader + yml.trim();
  return ymlDoc;
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
 * Whether a file is a metadata file.
 * @param file a file
 * @return `true` if `file` is a metadata file, `false` otherwise
 */
function isMetadataFile(file) {
  const fileName = path.basename(file);
  return (
    fileName.match(metadataPreRegExp()) && fileName.match(metadataPostRegExp())
  );
}

/**
 * Regexp for matching the `metaPre` part of a metadata filename.
 */
function metadataPreRegExp() {
  return new RegExp('^' + _.escapeRegExp(settings.metaPre));
}

/**
 * Regexp for matching the `metaExt` part of a metadata filename.
 */
function metadataPostRegExp() {
  return new RegExp(_.escapeRegExp(settings.metaExt) + '$');
}

/**
 * Simple normalization function for URLs.
 * @param url a relative URL or URL fragment
 * @return an absolute URL
 */
function normalizeUrl(url) {
  let normUrl = url;
  const hasProtocol = normUrl.match(/^https?:\/\//i);
  if (!hasProtocol) {
    normUrl = 'http://' + normUrl;
  }
  return normUrl;
}

/**
 * Reorder the properties of a metadata object.
 * Salient properties like `title` and `author`
 * are listed at the top, making for a much more
 * readable YAML file.
 * @param obj a metadata object
 * @return a reordered metadata object
 */
function reorderProperties(obj) {
  // FIXME: there should be a less tedious way to write this,
  // but shorthand property syntax results in `undefined` values
  // that are rejected by js-yaml's `safeDump()` method ...
  const result = {};
  if (obj['_filename']) {
    result['_filename'] = obj['_filename'];
  }
  if (obj.title) {
    result.title = obj.title;
  }
  if (obj.subtitle) {
    result.subtitle = obj.subtitle;
  }
  if (obj.fulltitle) {
    result.fulltitle = obj.fulltitle;
  }
  if (obj.description) {
    result.description = obj.description;
  }
  if (obj.author) {
    result.author = obj.author;
  }
  if (obj.uploader) {
    result.uploader = obj.uploader;
  }
  if (obj['uploader_id']) {
    result['uploader_id'] = obj['uploader_id'];
  }
  if (obj['uploader_url']) {
    result['uploader_url'] = obj['uploader_url'];
  }
  if (obj.date) {
    result.date = obj.date;
  }
  if (obj['upload_date']) {
    result['upload_date'] = obj['upload_date'];
  }
  if (obj.tags) {
    result.tags = obj.tags;
    if (Array.isArray(result.tags)) {
      result.tags = result.tags.sort();
    }
  }
  if (obj.categories) {
    result.categories = obj.categories;
    if (Array.isArray(result.categories)) {
      result.categories = result.categories.sort();
    }
  }
  if (obj.url) {
    result.url = obj.url;
  }
  if (obj.urls) {
    result.urls = obj.urls;
  }
  if (obj['webpage_url']) {
    result['webpage_url'] = obj['webpage_url'];
  }
  if (obj.thumbnail) {
    result.thumbnail = obj.thumbnail;
  }
  if (obj['like_count']) {
    result['like_count'] = obj['like_count'];
  }
  if (obj['dislike_count']) {
    result['dislike_count'] = obj['dislike_count'];
  }
  return { ...result, ...obj };
}

// invoke the "main" function
if (require.main === module) {
  main();
}
