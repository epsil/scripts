#!/usr/bin/env node

// Transpile all code following this line with babel
// and use 'env' (aka ES6) preset
require('@babel/register')({
  presets: ['@babel/preset-env']
});
require('@babel/polyfill');

// Import the rest of the application,
// which is written in ES6
require('./main.js');
