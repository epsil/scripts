#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const util = require('util');
const childProcess = require('child_process');
const _ = require('lodash');

const execAsync = util.promisify(childProcess.exec);

const editor = 'gvim'; // or emacs?

const audioTemplate =
  `tags:
  - ` + // whitespace
  `
categories:
  - audio`;

const imgTemplate =
  `tags:
  - ` + // whitespace
  `
categories:
  - img`;

const defTemplate = `tags:
  - `;

const audioExtensions = [
  '.wav',
  '.mp3',
  '.ogg',
  '.aiff',
  '.m4a',
  '.flac',
  '.ape'
];

const imgExtensions = [
  '.jpg',
  '.jpeg',
  '.png',
  '.bmp',
  '.gif',
  '.heif',
  '.heic'
];

function main() {
  const [node, cmd, ...args] = process.argv;
  const files = args;
  editMetadataFileForFiles(files);
}

function isAudioFile(file) {
  const ext = path.extname(file).toLowerCase();
  return _.includes(audioExtensions, ext);
}

function isImageFile(file) {
  const ext = path.extname(file).toLowerCase();
  return _.includes(imgExtensions, ext);
}

function editMetadataFileForFiles(files, tmp) {
  return files.map(file => {
    if (!file) {
      return null;
    }

    const fileExists = fs.existsSync(file);
    if (!fileExists) {
      console.log(`${file} does not exist!`);
      return null;
    }

    console.log(`Editing metadata for ${file} ...`);
    const template = tmp || getTemplateForFile(file);
    return editMetadataFileForFile(file, template);
  });
}

function getTemplateForFile(file) {
  if (isAudioFile(file)) {
    return audioTemplate;
  }
  if (isImageFile(file)) {
    return imgTemplate;
  }
  return defTemplate;
}

function editMetadataFileForFile(file, tmp) {
  const realFile = fs.realpathSync(file);
  const metaFile = getMetadataFilenameFromFilename(realFile);
  return editMetadataFile(metaFile, tmp);
}

function getMetadataFilenameFromFilename(filePath) {
  const file = path.basename(filePath);
  const dir = path.dirname(filePath);
  const metaFile = '.' + file + '.yml';
  const metaDir = '.meta';
  return path.join(dir, metaDir, metaFile);
}

function editMetadataFile(metaFile, tmp) {
  const fileAlreadyExist = fs.existsSync(metaFile);
  if (fileAlreadyExist) {
    return launchEditor(metaFile, editor);
  }
  return createMetadataFile(metaFile, tmp).then(() =>
    launchEditor(metaFile, editor)
  );
}

function launchEditor(metaFile, textEditor) {
  return execAsync(`${textEditor} "${metaFile}"`);
}

function createMetadataFile(metaFile, tmp) {
  const metaDir = path.dirname(metaFile);
  const dirAlreadyExists = fs.existsSync(metaDir);
  if (dirAlreadyExists) {
    return createMetadataFileFromTemplate(metaFile, tmp);
  }
  // create directory
  return execAsync(`mkdir ${metaDir}`)
    .catch(err => null)
    .then(() => createMetadataFileFromTemplate(metaFile, tmp));
}

function createMetadataFileFromTemplate(metaFile, str) {
  return new Promise((resolve, reject) => {
    fs.writeFile(metaFile, str || '', function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(metaFile);
      }
    });
  });
}

if (require.main === module) {
  main();
}
