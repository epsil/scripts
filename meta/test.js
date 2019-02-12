// CommonJS-to-ES6 loader

// Transpile all code following this line with babel
// and use 'env' (aka ES6) preset
require('@babel/register')({
  presets: ['@babel/preset-env']
});
require('@babel/polyfill');

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');

chai.use(chaiAsPromised);
chai.should();

// Import the rest of the application,
// which is written in ES6
require('./main.test.js');
