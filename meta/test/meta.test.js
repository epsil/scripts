/* global describe, it */
import fs from 'fs';
import rimraf from 'rimraf';
import {
  addYamlFences,
  categoryDir,
  createGlobPattern,
  getFilenameFromMetadataFilename,
  getMetadataFilenameFromFilename,
  hasCmd,
  invokeRsync,
  makeCategoryContainer,
  makeDirectory,
  makeTagContainer,
  metaDir,
  metaExt,
  parseMetadata,
  parseYaml,
  tagDir
} from '../meta';

process.chdir('test'); // working directory

describe('createGlobPattern', () => {
  it('should create a glob string for matching metadata files', () => {
    createGlobPattern(metaDir, metaExt).should.eql('**/.meta/*.yml');
  });
});

describe('makeCategoryContainer', () => {
  it('should make a category container', async () => {
    let dir;
    try {
      dir = await makeCategoryContainer();
      dir.should.eql(categoryDir);
    } finally {
      rimraf.sync(dir);
    }
  });
});

describe('makeTagContainer', () => {
  it('should make a tag container', async () => {
    let dir;
    try {
      dir = await makeTagContainer();
      dir.should.eql(tagDir);
    } finally {
      rimraf.sync(dir);
    }
  });
});

describe('makeDirectory', () => {
  it('should make a directory', async () => {
    const dir = 'foo';
    try {
      const result = await makeDirectory(dir);
      const directoryExists = fs.existsSync(dir);
      const isDirectory = fs.lstatSync(dir).isDirectory();
      result.should.eql(dir);
      directoryExists.should.eql(true);
      isDirectory.should.eql(true);
    } finally {
      rimraf.sync(dir);
    }
  });
});

describe('invokeRsync', () => {
  it('should invoke rsync', () => {
    invokeRsync('foo', 'bar', {
      debug: true
    }).should.eql('rsync -avz "foo" "bar"');
  });
});

describe('hasCmd', () => {
  it('should invoke a command with --version', () => {
    hasCmd('foo', {
      debug: true
    }).should.eql('foo --version');
  });
});

describe('parseMetadata', () => {
  it('should create a metadata object from a YAML string', () => {
    parseMetadata(
      `---
tags:
  - foo
  - bar
---
`,
      '.meta.file.yml',
      {
        debug: true,
        unix: true
      }
    ).should.eql({
      file: '../meta.file',
      meta: '.meta.file.yml',
      tags: ['foo', 'bar']
    });
  });
});

describe('parseYaml', () => {
  it('should parse fenced YAML', () => {
    parseYaml(`---
tags:
  - foo
  - bar
---
`).should.eql({
      tags: ['foo', 'bar']
    });
  });

  it('should parse the same YAML multiple times', () => {
    // there is a weird caching bug in gray-matter
    // which is prevented if one provides an options object
    parseYaml(`---
tags:
  - foo
  - bar
---
`).should.eql({
      tags: ['foo', 'bar']
    });

    parseYaml(`---
tags:
  - foo
  - bar
---`).should.eql({
      tags: ['foo', 'bar']
    });
  });

  it('should parse unfenced YAML', () => {
    parseYaml(`tags:
  - foo
  - bar`).should.eql({
      tags: ['foo', 'bar']
    });
  });
});

describe('addYamlFences', () => {
  it('should add fences to a YAML string missing them', () => {
    addYamlFences(`tags:
  - foo
  - bar`).should.eql(`---
tags:
  - foo
  - bar
---
`);
  });

  it('should not add fences to a YAML string that already has them', () => {
    addYamlFences(`---
tags:
  - foo
  - bar
---
`).should.eql(`---
tags:
  - foo
  - bar
---
`);
  });
});

describe('getFilenameFromMetadataFilename', () => {
  it('should translate a dotfile YAML file name to a regular file name', () => {
    getFilenameFromMetadataFilename('.file.txt.yml', { unix: true }).should.eql(
      '../file.txt'
    );
  });

  it('should not translate non-metadata file names', () => {
    getFilenameFromMetadataFilename('file.txt', { unix: true }).should.eql(
      'file.txt'
    );

    getFilenameFromMetadataFilename('file.txt.yml', { unix: true }).should.eql(
      'file.txt.yml'
    );

    getFilenameFromMetadataFilename('.file', { unix: true }).should.eql(
      '.file'
    );
  });

  it('should handle directories correctly', () => {
    getFilenameFromMetadataFilename('lib/.meta/.file.txt.yml', {
      unix: true
    }).should.eql('lib/file.txt');
  });
});

describe('getMetadataFilenameFromFilename', () => {
  it('should translate a regular file name to a metadata file name', () => {
    getMetadataFilenameFromFilename('file.txt', { unix: true }).should.eql(
      '.meta/.file.txt.yml'
    );
  });

  it('should handle directories correctly', () => {
    getMetadataFilenameFromFilename('lib/file.txt', { unix: true }).should.eql(
      'lib/.meta/.file.txt.yml'
    );
  });
});
