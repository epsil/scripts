#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const util = require('util');
const childProcess = require('child_process');

const execAsync = util.promisify(childProcess.exec);

const editor = 'emacs';
const template = `tags:
  - `;

function main() {
  const file = process.argv[2];
  if (!file) {
    return;
  }
  console.log('Editing metadata for ' + file + ' ...');
  editMetadataFileForFile(file);
}

function editMetadataFileForFile(file) {
  const metaFile = getMetadataFilenameFromFilename(file);
  return editMetadataFile(metaFile);
}

function getMetadataFilenameFromFilename(filePath) {
  const file = path.basename(filePath);
  const dir = path.dirname(filePath);
  const metaFile = '.' + file + '.yml';
  const metaDir = '.meta';
  return path.join(dir, metaDir, metaFile);
}

function editMetadataFile(metaFile) {
  if (fs.existsSync(metaFile)) {
    return launchEditor(metaFile, editor);
  }
  return createMetadataFile(metaFile).then(() =>
    launchEditor(metaFile, editor)
  );
}

function launchEditor(metaFile, textEditor) {
  return execAsync(`${textEditor} ${metaFile}`);
}

function createMetadataFile(metaFile) {
  const metaDir = path.dirname(metaFile);
  if (fs.existsSync(metaDir)) {
    return createMetadataFileFromTemplate(metaFile, template);
  }
  // create directory
  return execAsync(`mkdir ${metaDir}`).then(() =>
    createMetadataFileFromTemplate(metaFile, template)
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
