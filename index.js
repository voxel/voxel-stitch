'use strict';

module.exports = function(game, opts) {
  return new StitcherPlugin(game, opts);
};
module.exports.pluginInfo = {
  loadAfter: ['voxel-registry']
};

function StitcherPlugin(game, opts) {
  this.registry = game.plugins.get('voxel-registry');
  if (!this.registry) throw new Error('voxel-stitcher requires voxel-registry plugin');

  this.enable();
}

StitcherPlugin.prototype.stitch = function() {
  var textures = this.registry.getBlockPropsAll('texture');

  for (var i = 0; i < textures.length; i += 1) {
    var texture = textures[i];

    if (texture === undefined) continue;
    if (Array.isArray(texture)) {
      // TODO: array textures, maybe use toarray and remove special cases (including undefined)
    }
    // TODO: get texture from artpacks
    // TODO: add to atlas
  }
}

StitcherPlugin.prototype.enable = function() {
};

StitcherPlugin.prototype.disable = function() {
};


