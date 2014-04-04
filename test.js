'use strict';

var test = require('tape');
var createPlugin = require('./');
var fs = require('fs');

var fakeRegistry = {
  getBlockPropsAll: 
    function(name) {
      if (name !== 'texture') throw new Error('this test only supports texture');

      return [
        undefined,
        'dirt',
        'stone',
        //['grass_top'], // TODO: arrays
      ];
    }
};

var plugin = createPlugin(null, {registry: fakeRegistry, artpacks: fs.readFileSync('../voxpopuli/ProgrammerArt-ResourcePack.zip')});
plugin.stitch(); // fails on node.js because artpacks requires Image, browser-only....

