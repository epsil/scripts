#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const util = require('util');
const childProcess = require('child_process');
const _ = require('lodash');

const execAsync = util.promisify(childProcess.exec);

const editor = 'emacs'; // or vim?

const template = `tags:
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

const audioTemplate =
  `tags:
  - ` + // whitespace
  `
categories:
  - audio`;

const imgExtensions = [
  '.jpg',
  '.jpeg',
  '.png',
  '.bmp',
  '.gif',
  '.heif',
  '.heic'
];

const imgTemplate =
  `tags:
  - ` + // whitespace
  `
categories:
  - img`;

function main() {
  const file = process.argv[2];

  if (!file) {
    return;
  }

  let tmp = template;
  if (isAudioFile(file)) {
    tmp = audioTemplate;
  } else if (isImageFile(file)) {
    tmp = imgTemplate;
  }

  console.log(`Editing metadata for ${file} ...`);
  editMetadataFileForFile(file, tmp);
}

function isAudioFile(file) {
  const ext = path.extname(file).toLowerCase();
  return _.includes(audioExtensions, ext);
}

function isImageFile(file) {
  const ext = path.extname(file).toLowerCase();
  return _.includes(imgExtensions, ext);
}

function editMetadataFileForFile(file, tmp) {
  const metaFile = getMetadataFilenameFromFilename(file);
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
  return execAsync(`${textEditor} ${metaFile}`);
}

function createMetadataFile(metaFile, tmp) {
  const metaDir = path.dirname(metaFile);
  const dirAlreadyExists = fs.existsSync(metaDir);
  if (dirAlreadyExists) {
    return createMetadataFileFromTemplate(metaFile, tmp);
  }
  // create directory
  return execAsync(`mkdir ${metaDir}`).then(() =>
    createMetadataFileFromTemplate(metaFile, tmp)
  );
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
