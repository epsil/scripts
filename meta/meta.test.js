/* global describe, it */
import {
  addYamlFences,
  getFilenameFromMetaFilename,
  parseYaml,
  referencedFilePath
} from './meta';

describe('parseYaml', () => {
  it('should parse fenced YAML', () => {
    parseYaml('---\ntags:\n  - foo\n  - bar\n---\n').should.eql({
      tags: ['foo', 'bar']
    });
  });

  it('should parse the same YAML multiple times', () => {
    // there is a weird caching bug in gray-matter
    // which is avoided if one provides an options object
    parseYaml('---\ntags:\n  - foo\n  - bar\n---\n').should.eql({
      tags: ['foo', 'bar']
    });

    parseYaml('---\ntags:\n  - foo\n  - bar\n---\n').should.eql({
      tags: ['foo', 'bar']
    });
  });

  it('should parse unfenced YAML', () => {
    parseYaml('tags:\n  - foo\n  - bar').should.eql({
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

describe('getFilenameFromMetaFilename', () => {
  it('should translate a dotfile YAML file name to a regular file name', () => {
    getFilenameFromMetaFilename('.file.txt.yml').should.eql('../file.txt');
  });
});

describe('referencedFilePath', () => {
  it('should get the file path of the file referenced by a meta object', () => {
    referencedFilePath({
      meta: 'lib\\.meta\\.enfil.txt.yml',
      path: '../enfil.txt'
    })
      .replace(/\\/g, '/')
      .should.eql('lib/enfil.txt');
  });
});
