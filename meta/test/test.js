/* global describe, it */

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');

chai.use(chaiAsPromised);
chai.should();

const fs = require('fs');
const rimraf = require('rimraf');
const metalinks = require('../links');

process.chdir('test'); // working directory

describe('createGlobPattern', () => {
  it('should create a glob string for matching metadata files', () => {
    metalinks
      .createGlobPattern(metalinks.metaDir, metalinks.metaExt)
      .should.eql('**/.meta/*.yml');
  });
});

describe('makeCategoryContainer', () => {
  it('should make a category container', async () => {
    let dir;
    try {
      metalinks.makeCategoryContainer().then(directory => {
        dir = directory;
        dir.should.eql(metalinks.categoryDir);
      });
    } finally {
      if (dir) {
        rimraf.sync(dir);
      }
    }
  });
});

describe('makeTagContainer', () => {
  it('should make a tag container', async () => {
    let dir;
    try {
      metalinks.makeTagContainer().then(() => {
        dir.should.eql(metalinks.tagDir);
      });
    } finally {
      if (dir) {
        rimraf.sync(dir);
      }
    }
  });
});

describe('makeDirectory', () => {
  it('should make a directory', async () => {
    const dir = 'foo';
    try {
      metalinks.makeDirectory(dir).then(result => {
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
    metalinks
      .invokeRsync('foo', 'bar', {
        debug: true
      })
      .should.eql('rsync -avz "foo" "bar"');
  });
});

describe('parseMetadata', () => {
  it('should create a metadata object from a YAML string', () => {
    metalinks
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
    metalinks
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
    metalinks
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

    metalinks
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
    metalinks
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
    metalinks
      .getFilenameFromMetadataFilename('.file.txt.yml', { unix: true })
      .should.eql('../file.txt');
  });

  it('should not translate non-metadata file names', () => {
    metalinks
      .getFilenameFromMetadataFilename('file.txt', { unix: true })
      .should.eql('file.txt');

    metalinks
      .getFilenameFromMetadataFilename('file.txt.yml', { unix: true })
      .should.eql('file.txt.yml');

    metalinks
      .getFilenameFromMetadataFilename('.file', { unix: true })
      .should.eql('.file');
  });

  it('should handle directories correctly', () => {
    metalinks
      .getFilenameFromMetadataFilename('lib/.meta/.file.txt.yml', {
        unix: true
      })
      .should.eql('lib/file.txt');
  });
});

describe('getMetadataFilenameFromFilename', () => {
  it('should translate a regular file name to a metadata file name', () => {
    metalinks
      .getMetadataFilenameFromFilename('file.txt', { unix: true })
      .should.eql('.meta/.file.txt.yml');
  });

  it('should handle directories correctly', () => {
    metalinks
      .getMetadataFilenameFromFilename('lib/file.txt', { unix: true })
      .should.eql('lib/.meta/.file.txt.yml');
  });
});

describe('createTagDictionary', () => {
  it('should handle an empty array', () => {
    metalinks.createTagDictionary([]).should.eql({});
  });

  it('should handle a single metadata object with no tags', () => {
    metalinks
      .createTagDictionary([
        {
          file: '../meta.file',
          meta: '.meta.file.yml'
        }
      ])
      .should.eql({});
  });

  it('should handle a single metadata object with a single tag', () => {
    metalinks
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
    metalinks
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
    metalinks
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
    metalinks
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
    metalinks
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
    metalinks.parseQuery('').should.eql([]);
  });

  it('should handle singleton strings', () => {
    metalinks.parseQuery('foo').should.eql(['foo']);
  });

  it('should create create a tag array from a tag list string', () => {
    metalinks.parseQuery('bar foo').should.eql(['bar', 'foo']);
  });

  it('should sort the list', () => {
    metalinks.parseQuery('foo bar').should.eql(['bar', 'foo']);
  });

  it('should remove duplicates', () => {
    metalinks.parseQuery('foo foo bar').should.eql(['bar', 'foo']);
  });
});

describe('filterByTagList', () => {
  it('should handle empty lists', () => {
    metalinks.filterByTagList([], []).should.eql([]);
  });

  it('should handle singleton lists', () => {
    metalinks.filterByTagList([], ['foo']).should.eql([]);
    metalinks.filterByTagList(['foo'], []).should.eql(['foo']);
  });

  it('should filter metadata objects', () => {
    metalinks
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

describe('mergeTmpDirAndOutputDirWithRsync', () => {
  it('should throw an error if the working directory is the current directory', () => {
    let error = '';
    try {
      metalinks.mergeTmpDirAndOutputDirWithRsync('.', '.');
    } catch (err) {
      error = err.message;
    }
    error.should.equal('The working directory cannot be the current directory');
  });

  it('should throw an error if the working directory is equivalent to the output directory', () => {
    let error = '';
    try {
      metalinks.mergeTmpDirAndOutputDirWithRsync('foo', 'foo');
    } catch (err) {
      error = err.message;
    }
    error.should.equal(
      'The working directory cannot be equivalent to the output directory'
    );
  });

  it('should throw an error if the output directory is a parent of the working directory', () => {
    let error = '';
    try {
      metalinks.mergeTmpDirAndOutputDirWithRsync('foo/bar', 'foo');
    } catch (err) {
      error = err.message;
    }
    error.should.equal(
      'The output directory cannot be a parent of the working directory'
    );
  });
});

describe('validateDirectories', () => {
  it('should throw an error if the output directory is equivalent to the current directory', () => {
    let error = '';
    try {
      metalinks.validateDirectories('.', '.');
    } catch (err) {
      error = err.message;
    }
    error.should.equal('Output directory cannot be the current directory');
  });
});
