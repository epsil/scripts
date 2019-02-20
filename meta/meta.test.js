/* global describe, it */
import {
  addYamlFences,
  categoryDir,
  getFilenameFromMetadataFilename,
  getMetadataFilenameFromFilename,
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
    getFilenameFromMetadataFilename('.file.txt.yml').should.eql('../file.txt');
  });

  it('should translate non-dotfile file names too', () => {
    getFilenameFromMetadataFilename('file.txt.yml').should.eql('../file.txt');
  });
});

describe('getMetadataFilenameFromFilename', () => {
  it('should translate a regular file name to a dotfile YAML file name', () => {
    getMetadataFilenameFromFilename('file.txt')
      .replace(/\\/g, '/') // Windows: `\` to `/`
      .should.eql('.meta/.file.txt.yml');
    getMetadataFilenameFromFilename('lib/file.txt')
      .replace(/\\/g, '/') // Windows: `\` to `/`
      .should.eql('lib/.meta/.file.txt.yml');
  });
});

describe('referencedFilePath', () => {
  it('should get the file path of the file referenced by a meta object', () => {
    referencedFilePath({
      meta: 'lib/.meta/.enfil.txt.yml',
      path: '../enfil.txt'
    })
      .replace(/\\/g, '/') // Windows: `\` to `/`
      .should.eql('lib/enfil.txt');
  });
});
