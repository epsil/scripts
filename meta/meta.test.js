/* global describe, it */
import {
  addYamlFences,
  categoryDir,
  getFilenameFromMetaFilename,
  hasCmd,
  invokeCp,
  invokeLn,
  invokeMkdir,
  invokeRsync,
  makeCategoryContainer,
  makeTagContainer,
  parseMetadata,
  parseYaml,
  referencedFilePath,
  tagDir
} from './meta';

describe('makeCategoryContainer', () => {
  it('should make a category container', () => {
    makeCategoryContainer({
      debug: true
    }).should.eql(`mkdir "${categoryDir}"`);
  });
});

describe('makeTagContainer', () => {
  it('should make a tag container', () => {
    makeTagContainer({
      debug: true
    }).should.eql(`mkdir "${tagDir}"`);
  });
});

describe('invokeLn', () => {
  it('should invoke ln', () => {
    invokeLn('foo', 'bar', {
      debug: true
    }).should.eql('ln -s "foo" "bar"');
  });
});

describe('invokeRsync', () => {
  it('should invoke rsync', () => {
    invokeRsync('foo', 'bar', {
      debug: true
    }).should.eql('rsync -avz "foo" "bar"');
  });
});

describe('invokeCp', () => {
  it('should invoke cp', () => {
    invokeCp('foo', 'bar', {
      debug: true
    }).should.eql('cp "foo" "bar"');
  });
});

describe('invokeMkdir', () => {
  it('should invoke mkdir', () => {
    invokeMkdir('foo', {
      debug: true
    }).should.eql('mkdir "foo"');
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
        debug: true
      }
    ).should.eql({
      file: '../meta.file',
      meta: '.meta.file.yml',
      path: '../meta.file',
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
    // which is avoided if one provides an options object
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

describe('getFilenameFromMetaFilename', () => {
  it('should translate a dotfile YAML file name to a regular file name', () => {
    getFilenameFromMetaFilename('.file.txt.yml').should.eql('../file.txt');
  });

  it('should translate non-dotfile file names too', () => {
    getFilenameFromMetaFilename('file.txt.yml').should.eql('../file.txt');
  });
});

describe('referencedFilePath', () => {
  it('should get the file path of the file referenced by a meta object', () => {
    referencedFilePath({
      meta: 'lib/.meta/.enfil.txt.yml',
      path: '../enfil.txt'
    })
      .replace(/\\/g, '/')
      .should.eql('lib/enfil.txt');
  });
});
