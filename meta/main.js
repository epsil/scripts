import glob from 'glob';
import fs from 'fs';
import matter from 'gray-matter';
import path from 'path';
import _ from 'lodash';

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
  return view;
}

function parseYaml(str) {
  let view = {};
  try {
    view = matter(str);
    const data = _.assign({}, view.data);
    delete view.data;
    view = _.assign({}, data, view);
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
  const files = glob
    .sync('**/.meta/*.yml', { dot: true, ignore: 'node_modules/**' })
    .sort();
  files.map(readMetaFile).map(meta => {
    console.log(meta);
    console.log(referencedFilePath(meta));
    console.log(referencedAbsoluteFilePath(meta));
    return meta;
  });
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

function main() {
  findAllMetaFiles();
}

main();
