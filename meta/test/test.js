/* global describe, it */

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');

chai.use(chaiAsPromised);
chai.should();

const fs = require('fs');
const rimraf = require('rimraf');
const meta = require('../index');

process.chdir('test'); // working directory

describe('createGlobPattern', () => {
  it('should create a glob string for matching metadata files', () => {
    meta
      .createGlobPattern(meta.metaDir, meta.metaExt)
      .should.eql('**/.meta/*.yml');
  });
});

describe('makeCategoryContainer', () => {
  it('should make a category container', async () => {
    let dir;
    try {
      meta.makeCategoryContainer().then(directory => {
        dir = directory;
        dir.should.eql(meta.categoryDir);
      });
    } finally {
      rimraf.sync(dir);
    }
  });
});

describe('makeTagContainer', () => {
  it('should make a tag container', async () => {
    let dir;
    try {
      meta.makeTagContainer().then(() => {
        dir.should.eql(meta.tagDir);
      });
    } finally {
      rimraf.sync(dir);
    }
  });
});

describe('makeDirectory', () => {
  it('should make a directory', async () => {
    const dir = 'foo';
    try {
      meta.makeDirectory(dir).then(result => {
        const directoryExists = fs.existsSync(dir);
        const isDirectory = fs.lstatSync(dir).isDirectory();
        result.should.eql(dir);
        directoryExists.should.eql(true);
        isDirectory.should.eql(true);
      });
    } finally {
      rimraf.sync(dir);
    }
  });
});

describe('invokeRsync', () => {
  it('should invoke rsync', () => {
    meta
      .invokeRsync('foo', 'bar', {
        debug: true
      })
      .should.eql('rsync -avz "foo" "bar"');
  });
});

describe('hasCmd', () => {
  it('should invoke a command with --version', () => {
    meta
      .hasCmd('foo', {
        debug: true
      })
      .should.eql('foo --version');
  });
});

describe('parseMetadata', () => {
  it('should create a metadata object from a YAML string', () => {
    meta
      .parseMetadata(
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
      )
      .should.eql({
        file: '../meta.file',
        meta: '.meta.file.yml',
        tags: ['foo', 'bar']
      });
  });
});

describe('parseYaml', () => {
  it('should parse fenced YAML', () => {
    meta
      .parseYaml(
        `---
tags:
  - foo
  - bar
---
`
      )
      .should.eql({
        tags: ['foo', 'bar']
      });
  });

  it('should parse the same YAML multiple times', () => {
    // there is a weird caching bug in gray-matter
    // which is prevented if one provides an options object
    meta
      .parseYaml(
        `---
tags:
  - foo
  - bar
---
`
      )
      .should.eql({
        tags: ['foo', 'bar']
      });

    meta
      .parseYaml(
        `---
tags:
  - foo
  - bar
---`
      )
      .should.eql({
        tags: ['foo', 'bar']
      });
  });

  it('should parse unfenced YAML', () => {
    meta
      .parseYaml(
        `tags:
  - foo
  - bar`
      )
      .should.eql({
        tags: ['foo', 'bar']
      });
  });
});

describe('getFilenameFromMetadataFilename', () => {
  it('should translate a dotfile YAML file name to a regular file name', () => {
    meta
      .getFilenameFromMetadataFilename('.file.txt.yml', { unix: true })
      .should.eql('../file.txt');
  });

  it('should not translate non-metadata file names', () => {
    meta
      .getFilenameFromMetadataFilename('file.txt', { unix: true })
      .should.eql('file.txt');

    meta
      .getFilenameFromMetadataFilename('file.txt.yml', { unix: true })
      .should.eql('file.txt.yml');

    meta
      .getFilenameFromMetadataFilename('.file', { unix: true })
      .should.eql('.file');
  });

  it('should handle directories correctly', () => {
    meta
      .getFilenameFromMetadataFilename('lib/.meta/.file.txt.yml', {
        unix: true
      })
      .should.eql('lib/file.txt');
  });
});

describe('getMetadataFilenameFromFilename', () => {
  it('should translate a regular file name to a metadata file name', () => {
    meta
      .getMetadataFilenameFromFilename('file.txt', { unix: true })
      .should.eql('.meta/.file.txt.yml');
  });

  it('should handle directories correctly', () => {
    meta
      .getMetadataFilenameFromFilename('lib/file.txt', { unix: true })
      .should.eql('lib/.meta/.file.txt.yml');
  });
});

describe('createTagDictionary', () => {
  it('should handle an empty array', () => {
    meta.createTagDictionary([]).should.eql({});
  });

  it('should handle a single metadata object with no tags', () => {
    meta
      .createTagDictionary([
        {
          file: '../meta.file',
          meta: '.meta.file.yml'
        }
      ])
      .should.eql({});
  });

  it('should handle a single metadata object with a single tag', () => {
    meta
      .createTagDictionary([
        {
          file: '../meta.file',
          meta: '.meta.file.yml',
          tags: ['foo']
        }
      ])
      .should.eql({
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
    meta
      .createTagDictionary([
        {
          file: '../meta.file',
          meta: '.meta.file.yml',
          tags: ['bar', 'foo']
        }
      ])
      .should.eql({
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
    meta
      .createTagDictionary([
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
      ])
      .should.eql({
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
    meta
      .createTagDictionary([
        {
          file: '../meta.file',
          meta: '.meta.file.yml',
          tags: ['foo', 'bar']
        }
      ])
      .should.eql({
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
    meta
      .createTagDictionary(
        [
          {
            file: '../meta.file',
            meta: '.meta.file.yml',
            tags: ['foo', 'bar']
          }
        ],
        tag => tag === 'foo'
      )
      .should.eql({
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
    meta.parseQuery('').should.eql([]);
  });

  it('should handle singleton strings', () => {
    meta.parseQuery('foo').should.eql(['foo']);
  });

  it('should create create a tag array from a tag list string', () => {
    meta.parseQuery('bar foo').should.eql(['bar', 'foo']);
  });

  it('should sort the list', () => {
    meta.parseQuery('foo bar').should.eql(['bar', 'foo']);
  });

  it('should remove duplicates', () => {
    meta.parseQuery('foo foo bar').should.eql(['bar', 'foo']);
  });
});

describe('filterByTagList', () => {
  it('should handle empty lists', () => {
    meta.filterByTagList([], []).should.eql([]);
  });

  it('should handle singleton lists', () => {
    meta.filterByTagList([], ['foo']).should.eql([]);
    meta.filterByTagList(['foo'], []).should.eql(['foo']);
  });

  it('should filter metadata objects', () => {
    meta
      .filterByTagList(
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
      )
      .should.eql([
        {
          file: '../foo',
          meta: '.foo.yml',
          tags: ['bar', 'foo']
        }
      ]);
  });
});
