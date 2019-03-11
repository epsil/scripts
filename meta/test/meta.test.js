/* global describe, it */
import fs from 'fs';
import rimraf from 'rimraf';
import {
  categoryDir,
  createGlobPattern,
  createTagDictionary,
  filterByTagList,
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
  parseQuery,
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

describe('createTagDictionary', () => {
  it('should handle an empty array', () => {
    createTagDictionary([]).should.eql({});
  });

  it('should handle a single metadata object with no tags', () => {
    createTagDictionary([
      {
        file: '../meta.file',
        meta: '.meta.file.yml'
      }
    ]).should.eql({});
  });

  it('should handle a single metadata object with a single tag', () => {
    createTagDictionary([
      {
        file: '../meta.file',
        meta: '.meta.file.yml',
        tags: ['foo']
      }
    ]).should.eql({
      foo: [
        {
          file: '../meta.file',
          meta: '.meta.file.yml',
          tags: ['foo']
        }
      ]
    });
  });

  it('should handle a single metadata object with multiple tags', () => {
    createTagDictionary([
      {
        file: '../meta.file',
        meta: '.meta.file.yml',
        tags: ['bar', 'foo']
      }
    ]).should.eql({
      bar: [
        {
          file: '../meta.file',
          meta: '.meta.file.yml',
          tags: ['bar', 'foo']
        }
      ],
      foo: [
        {
          file: '../meta.file',
          meta: '.meta.file.yml',
          tags: ['bar', 'foo']
        }
      ]
    });
  });

  it('should handle multiple metadata objects with multiple tags', () => {
    createTagDictionary([
      {
        file: '../foo',
        meta: '.foo.yml',
        tags: ['bar', 'foo']
      },
      {
        file: '../bar',
        meta: '.bar.yml',
        tags: ['bar', 'baz']
      }
    ]).should.eql({
      bar: [
        {
          file: '../foo',
          meta: '.foo.yml',
          tags: ['bar', 'foo']
        },
        {
          file: '../bar',
          meta: '.bar.yml',
          tags: ['bar', 'baz']
        }
      ],
      baz: [
        {
          file: '../bar',
          meta: '.bar.yml',
          tags: ['bar', 'baz']
        }
      ],
      foo: [
        {
          file: '../foo',
          meta: '.foo.yml',
          tags: ['bar', 'foo']
        }
      ]
    });
  });

  it('should return a sorted dictionary', () => {
    createTagDictionary([
      {
        file: '../meta.file',
        meta: '.meta.file.yml',
        tags: ['foo', 'bar']
      }
    ]).should.eql({
      bar: [
        {
          file: '../meta.file',
          meta: '.meta.file.yml',
          tags: ['foo', 'bar']
        }
      ],
      foo: [
        {
          file: '../meta.file',
          meta: '.meta.file.yml',
          tags: ['foo', 'bar']
        }
      ]
    });
  });

  it('should filter tags', () => {
    createTagDictionary(
      [
        {
          file: '../meta.file',
          meta: '.meta.file.yml',
          tags: ['foo', 'bar']
        }
      ],
      tag => tag === 'foo'
    ).should.eql({
      foo: [
        {
          file: '../meta.file',
          meta: '.meta.file.yml',
          tags: ['foo', 'bar']
        }
      ]
    });
  });
});

describe('parseQuery', () => {
  it('should handle empty strings', () => {
    parseQuery('').should.eql([]);
  });

  it('should handle singleton strings', () => {
    parseQuery('foo').should.eql(['foo']);
  });

  it('should create create a tag array from a tag list string', () => {
    parseQuery('bar foo').should.eql(['bar', 'foo']);
  });

  it('should sort the list', () => {
    parseQuery('foo bar').should.eql(['bar', 'foo']);
  });

  it('should remove duplicates', () => {
    parseQuery('foo foo bar').should.eql(['bar', 'foo']);
  });
});

describe('filterByTagList', () => {
  it('should handle empty lists', () => {
    filterByTagList([], []).should.eql([]);
  });

  it('should handle singleton lists', () => {
    filterByTagList([], ['foo']).should.eql([]);
    filterByTagList(['foo'], []).should.eql(['foo']);
  });

  it('should filter metadata objects', () => {
    filterByTagList(
      [
        {
          file: '../foo',
          meta: '.foo.yml',
          tags: ['bar', 'foo']
        },
        {
          file: '../bar',
          meta: '.bar.yml',
          tags: ['bar', 'baz']
        }
      ],
      ['foo']
    ).should.eql([
      {
        file: '../foo',
        meta: '.foo.yml',
        tags: ['bar', 'foo']
      }
    ]);
  });
});
