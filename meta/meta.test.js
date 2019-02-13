/* global describe, it */
import { dirName, parseYaml } from './meta';

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

describe('dirName', () => {
  it('should return the directory part of a path', () => {
    dirName('foo/bar.txt').should.eql('foo/');
  });
});
