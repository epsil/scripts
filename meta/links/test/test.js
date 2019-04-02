/* global describe, it, afterEach */
/* eslint no-unused-expressions: 0 */

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');

chai.use(chaiAsPromised);
const should = chai.should();
const expect = chai.expect;

const fs = require('fs');
const shell = require('shelljs');
const _ = require('lodash');
const metalinks = require('..');

process.chdir('test'); // working directory

describe('createGlobPattern', function() {
  it('should create a glob string for matching metadata files', function() {
    metalinks
      .createGlobPattern(metalinks.metaDir, metalinks.metaExt)
      .should.eql('**/.meta/*.yml');
  });
});

describe('makeCategoryContainer', function() {
  afterEach(function() {
    shell.rm('-rf', metalinks.settings.categoryDir);
  });
  it('should make a category container', function() {
    return metalinks.makeCategoryContainer().then(dir => {
      const dirname = _.last(dir.split(/[\\/]/));
      dirname.should.eql(metalinks.settings.categoryDir);
    });
  });
});

describe('makeTagContainer', function() {
  afterEach(function() {
    shell.rm('-rf', metalinks.settings.tagDir);
  });
  it('should make a tag container', function() {
    return metalinks.makeTagContainer().then(dir => {
      const dirname = _.last(dir.split(/[\\/]/));
      dirname.should.eql(metalinks.settings.tagDir);
    });
  });
});

describe('makeDirectory', function() {
  const dir = 'foodir';
  afterEach(function() {
    shell.rm('-rf', dir);
  });
  it('should make a directory', function() {
    return metalinks.makeDirectory('foodir').then(directory => {
      const directoryExists = fs.existsSync(directory);
      const isDirectory = fs.lstatSync(directory).isDirectory();
      expect(directoryExists).to.be.true;
      expect(isDirectory).to.be.true;
    });
  });
});

describe('invokeRsync', function() {
  it('should invoke rsync', function() {
    metalinks
      .invokeRsync('foo', 'bar', {
        debug: true
      })
      .should.eql('rsync -avz "foo" "bar"');
  });
});

describe('hasCmd', function() {
  it('should invoke a command with --version', function() {
    metalinks
      .hasCmd('foo', {
        debug: true
      })
      .should.eql('foo --version');
  });
});

describe('parseMetadata', function() {
  it('should create a metadata object from a YAML string', function() {
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

describe('parseYaml', function() {
  it('should parse fenced YAML', function() {
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

  it('should parse the same YAML multiple times', function() {
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

  it('should parse unfenced YAML', function() {
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

describe('getFilenameFromMetadataFilename', function() {
  it('should translate a dotfile YAML file name to a regular file name', function() {
    metalinks
      .getFilenameFromMetadataFilename('.file.txt.yml', { unix: true })
      .should.eql('../file.txt');
  });

  it('should not translate non-metadata file names', function() {
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

  it('should handle directories correctly', function() {
    metalinks
      .getFilenameFromMetadataFilename('lib/.meta/.file.txt.yml', {
        unix: true
      })
      .should.eql('lib/file.txt');
  });
});

describe('getMetadataFilenameFromFilename', function() {
  it('should translate a regular file name to a metadata file name', function() {
    metalinks
      .getMetadataFilenameFromFilename('file.txt', { unix: true })
      .should.eql('.meta/.file.txt.yml');
  });

  it('should handle directories correctly', function() {
    metalinks
      .getMetadataFilenameFromFilename('lib/file.txt', { unix: true })
      .should.eql('lib/.meta/.file.txt.yml');
  });
});

describe('createTagDictionary', function() {
  it('should handle an empty array', function() {
    metalinks.createTagDictionary([]).should.eql({});
  });

  it('should handle a single metadata object with no tags', function() {
    metalinks
      .createTagDictionary([
        {
          file: '../meta.file',
          meta: '.meta.file.yml'
        }
      ])
      .should.eql({});
  });

  it('should handle a single metadata object with a single tag', function() {
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

  it('should handle a single metadata object with multiple tags', function() {
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

  it('should handle multiple metadata objects with multiple tags', function() {
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

  it('should return a sorted dictionary', function() {
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

  it('should filter tags', function() {
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

describe('parseQuery', function() {
  it('should handle empty strings', function() {
    metalinks.parseQuery('').should.eql([]);
  });

  it('should handle singleton strings', function() {
    metalinks.parseQuery('foo').should.eql(['foo']);
  });

  it('should create create a tag array from a tag list string', function() {
    metalinks.parseQuery('bar foo').should.eql(['bar', 'foo']);
  });

  it('should sort the list', function() {
    metalinks.parseQuery('foo bar').should.eql(['bar', 'foo']);
  });

  it('should remove duplicates', function() {
    metalinks.parseQuery('foo foo bar').should.eql(['bar', 'foo']);
  });
});

describe('filterByTagList', function() {
  it('should handle empty lists', function() {
    metalinks.filterByTagList([], []).should.eql([]);
  });

  it('should handle singleton lists', function() {
    metalinks.filterByTagList([], ['foo']).should.eql([]);
    metalinks.filterByTagList(['foo'], []).should.eql(['foo']);
  });

  it('should filter metadata objects', function() {
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

describe('mergeTmpDirAndOutputDirWithRsync', function() {
  it('should throw an error if the working directory is the current directory', function() {
    let error = '';
    try {
      metalinks.mergeTmpDirAndOutputDirWithRsync('.', '.');
    } catch (err) {
      error = err.message;
    }
    error.should.equal('The working directory cannot be the current directory');
  });

  it('should throw an error if the working directory is equivalent to the output directory', function() {
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

  it('should throw an error if the output directory is a parent of the working directory', function() {
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

describe('validateDirectories', function() {
  it('should throw an error if the output directory is equivalent to the current directory', function() {
    let error = '';
    try {
      metalinks.validateDirectories('.', '.');
    } catch (err) {
      error = err.message;
    }
    error.should.equal('Output directory cannot be the current directory');
  });
});

describe('toFilename', function() {
  it('should leave valid file paths unchanged', function() {
    metalinks.toFilename('file.txt').should.eql('file.txt');
  });

  it('should replace invalid characters', function() {
    metalinks.toFilename('*').should.eql('_');
    metalinks.toFilename('+').should.eql('+');
    metalinks.toFilename('A & B').should.eql('A and B');
  });

  it('should remove URL prefixes', function() {
    metalinks.toFilename('http://foo.com/').should.eql('foo.com');
    metalinks.toFilename('http://www.foo.com/').should.eql('foo.com');
  });

  it('should truncate long strings', function() {
    metalinks
      .toFilename(
        'very long string very long string very long string very long string very long string very long string very long string very long string very long string '
      )
      .should.eql(
        'very long string very long string very long string very long string very long string very long strin'
      );
  });
});

describe('hasTag', function() {
  it('should confirm whether a metadata object has a tag', function() {
    metalinks
      .hasTag(
        {
          tags: ['foo', 'bar']
        },
        'foo'
      )
      .should.eql(true);
  });

  it('should disconfirm whether a metadata object has a tag', function() {
    metalinks
      .hasTag(
        {
          tags: ['foo', 'bar']
        },
        'baz'
      )
      .should.eql(false);
  });
});

describe('hasCategory', function() {
  it('should confirm whether a metadata object has a category', function() {
    metalinks
      .hasCategory(
        {
          categories: ['foo', 'bar']
        },
        'foo'
      )
      .should.eql(true);
  });

  it('should disconfirm whether a metadata object has a category', function() {
    metalinks
      .hasCategory(
        {
          categories: ['foo', 'bar']
        },
        'baz'
      )
      .should.eql(false);
  });
});

describe('hasProp', function() {
  it('should confirm whether a metadata object has a tag', function() {
    metalinks
      .hasProp(
        {
          tags: ['foo', 'bar']
        },
        'tag',
        'foo'
      )
      .should.eql(true);
  });

  it('should disconfirm whether a metadata object has a tag', function() {
    metalinks
      .hasProp(
        {
          tags: ['foo', 'bar']
        },
        'tag',
        'baz'
      )
      .should.eql(false);
  });
});

describe('getProp', function() {
  it('should get all tags of a metadata object', function() {
    metalinks
      .getProp(
        {
          tags: ['foo', 'bar']
        },
        'tag'
      )
      .should.eql(['foo', 'bar']);
  });

  it('should get all user tags of a metadata object', function() {
    metalinks
      .getProp(
        {
          _tags: ['foo', 'bar']
        },
        '_tag'
      )
      .should.eql(['foo', 'bar']);
  });

  it('should get all categories of a metadata object', function() {
    metalinks
      .getProp(
        {
          categories: ['foo', 'bar']
        },
        'category'
      )
      .should.eql(['foo', 'bar']);
  });
});

describe('plural', function() {
  it('should pluralize "tag" as "tags"', function() {
    metalinks.plural('tag').should.eql('tags');
  });

  it('should pluralize "category" as "categories"', function() {
    metalinks.plural('category').should.eql('categories');
  });
});
