/* global describe, it */
import { dirName } from './main';

describe('dirName', () => {
  it('should return the directory part of a path', () => {
    dirName('foo/bar.txt').should.eql('foo/');
  });
});
