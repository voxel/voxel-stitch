'use strict';

var createArtpacks = require('artpacks');

module.exports = function(game, opts) {
  return new StitchPlugin(game, opts);
};
module.exports.pluginInfo = {
  loadAfter: ['voxel-registry']
};

function StitchPlugin(game, opts) {
  this.registry = opts.registry || game.plugins.get('voxel-registry');
  if (!this.registry) throw new Error('voxel-stitcher requires voxel-registry plugin');

  opts = opts || {};
  opts.artpacks = opts.artpacks || ['https://dl.dropboxusercontent.com/u/258156216/artpacks/ProgrammerArt-2.2-dev-ResourcePack-20140308.zip'];

  this.artpacks = createArtpacks(opts.artpacks);

  this.enable();
}

StitchPlugin.prototype.stitch = function() {
  var textures = this.registry.getBlockPropsAll('texture');

  for (var i = 0; i < textures.length; i += 1) {
    var textureName = textures[i];

    if (textureName === undefined) continue;
    if (Array.isArray(textureName)) {
      throw new Error('TODO: array textures, maybe use toarray and remove special cases (including undefined)');
    }

    this.artpacks.getTextureNdarray(textureName, function(pixels) {
      console.log(pixels);
    }, function(err) {
      console.log(err);
    });

    // TODO: add to atlas
  }
}

StitchPlugin.prototype.enable = function() {
};

StitchPlugin.prototype.disable = function() {
};


