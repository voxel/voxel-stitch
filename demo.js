'use strict';

var test = require('tape');
var createPlugin = require('./');

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

var plugin = createPlugin(null, {registry: fakeRegistry});
plugin.stitch();

