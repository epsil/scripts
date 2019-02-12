import glob from 'glob';

function findAllMetaFiles() {
  const files = glob
    .sync('**/.meta/*.yml', { dot: true, ignore: 'node_modules/**' })
    .sort();
  console.log(files);
}

function main() {
  console.log('Hello world!');
  findAllMetaFiles();
}

main();
