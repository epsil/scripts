#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const util = require('util');

const execAsync = util.promisify(childProcess.exec);

function getMetadataFilenameFromFilename(filePath) {
  const file = path.basename(filePath);
  const dir = path.dirname(filePath);
  const metaFile = '.' + file + '.yml';
  const metaDir = '.meta';
  return path.join(dir, metaDir, metaFile);
}

function editMetadataFileForFile(file) {
  const metaFile = getMetadataFilenameFromFilename(file);
  return editMetadataFile(metaFile);
}

function editMetadataFile(metaFile) {
  const editor = 'emacs';
  if (!fs.existsSync(metaFile)) {
    return createMetadataFile(metaFile).then(() => launchEditor(metaFile));
  }
  return launchEditor(metaFile);
}

function createMetadataFile(metaFile) {
  const metaDir = path.dirname(metaFile);
  if (!fs.existsSync(metaDir)) {
    // create file
    return execAsync('mkdir ' + metaDir).then(() =>
      insertMetadataTemplate(metaFile)
    );
  }
  return insertMetadataTemplate(metaFile);
}

function insertMetadataTemplate(metaFile, template) {
  const templateStr =
    template ||
    `tags:
  - `;
  return new Promise((resolve, reject) => {
    fs.writeFile(metaFile, templateStr, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(metaFile);
      }
    });
  });
}

function launchEditor(metaFile) {
  const editor = 'emacs';
  return execAsync(editor + ' ' + metaFile);
}

function main() {
  const file = process.argv[2];
  if (!file) {
    return;
  }
  console.log('Editing metadata for ' + file + ' ...');
  editMetadataFileForFile(file);
}

if (require.main === module) {
  main();
}
