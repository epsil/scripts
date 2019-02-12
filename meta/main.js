import glob from 'glob';
import fs from 'fs';
import matter from 'gray-matter';
import path from 'path';
import _ from 'lodash';
import util from 'util';
import { exec } from 'child_process';

const execAsync = util.promisify(exec);

function readMetaFile(filePath) {
  const str =
    fs
      .readFileSync(filePath)
      .toString()
      .trim() + '\n';
  const view = parseYaml(str);
  if (view.file === undefined) {
    view.file = getFilenameFromMetaFilename(filePath);
  }
  view.yaml = filePath;
  view.filePath = referencedAbsoluteFilePath(view);
  return view;
}

function parseYaml(str) {
  let view = {};
  try {
    view = matter(str);
    const data = _.assign({}, view.data);
    delete view.data;
    view = _.assign({}, data, view);
    if (view.content === '') {
      delete view.content;
    }
    if (view.excerpt === '') {
      delete view.excerpt;
    }
    if (!view.isEmpty) {
      delete view.isEmpty;
    }
  } catch (err) {
    return {};
  }
  return view;
}

function getFilenameFromMetaFilename(filePath) {
  const fileFolder = '..';
  const basename = path.basename(filePath);
  let origname = fileName(basename);
  origname = origname.replace(/^\./, '');
  origname = fileFolder + '/' + origname;
  return origname;
}

function findAllMetaFiles() {
  return glob
    .sync('**/.meta/*.yml', { dot: true, ignore: 'node_modules/**' })
    .sort();
}

function iterateOverMetaFiles(fn) {
  findAllMetaFiles()
    .map(readMetaFile)
    .forEach(fn);
}

function fileName(filePath) {
  return filePath.substr(0, filePath.length - path.extname(filePath).length);
}

function folderName(filePath) {
  return filePath.substr(0, filePath.length - path.basename(filePath).length);
}

function referencedFilePath(view) {
  return path.relative('.', path.resolve(folderName(view.yaml), view.file));
}

function referencedAbsoluteFilePath(view) {
  return path.resolve(referencedFilePath(view));
}

function processMetaData(meta) {
  printMetaData(meta);
  processTags(meta);
}

function printMetaData(meta) {
  console.log(referencedFilePath(meta));
  console.log(meta);
}

function processTags(meta) {
  const tags = meta.tags || [];
  tags.forEach(tag => {
    makeTagLink(meta.filePath, tag);
  });
}

function processMetaFiles() {
  makeTagFolder();
  iterateOverMetaFiles(processMetaData);
}

function makeFolder(folder) {
  const folderPath = path.normalize(folder);
  return execAsync(`mkdir ${folderPath}`).catch(x => x);
}

function makeTagFolder() {
  return makeFolder('tag');
}

async function makeTagLink(filePath, tag) {
  await makeTagFolder();
  await makeFolder(`tag/${tag}`);
  execAsync(`cp ${filePath} tag/${tag}`);
}

function makeCopy(meta) {
  exec('cp ' + meta.filePath + ' tag');
}

function main() {
  processMetaFiles();
}

main();
