'use strict';

var createArtpacks = require('artpacks');
var ndarray = require('ndarray');
var inherits = require('inherits');
var EventEmitter = require('events').EventEmitter;
var toarray = require('toarray');

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

  // texture atlas width and height
  this.atlasSize = opts.atlasSize !== undefined ? opts.atlasSize : 256;//2048; // requires downsampling each tile even if empty :( so make it smaller
  this.tileSize = opts.tileSize !== undefined ? opts.tileSize : 16;
  this.tileCount = this.atlasSize / this.tileSize; // each dimension

  // 5-dimensional array of tiles compatible with:
  //  https://github.com/mikolalysenko/tile-mip-map
  //  https://github.com/mikolalysenko/gl-tile-map
  // [rows, columns, tile height, tile width, channels]
  this.atlas = ndarray(new Uint8Array(this.atlasSize * this.atlasSize * 4),
      [this.tileCount, this.tileCount, this.tileSize, this.tileSize, 4]
      // TODO: strides?
      );

  this.nextY = this.nextX = 0;
  this.countLoading = 0;
  this.countLoaded = 0;

  this.textureArrayType = opts.textureArrayType || Uint8Array; // TODO: switch to 16-bit
  this.countTextureID = opts.countTextureID || (2 << 7); // TODO: switch to 16-bit
  this.countVoxelID = opts.countVoxelID || (2 << 14); // ao-mesher uses 16-bit, but top 1 bit is opaque/transparent flag TODO: flat 16-bit

  // 2-dimensional array of [voxelID, side] -> textureID
  this.voxelSideTextureIDs = ndarray(new this.textureArrayType(this.countVoxelID * 6), [this.countVoxelID, 6]);

  this.enable();
}

inherits(StitchPlugin, EventEmitter);

// expand a name into a 6-element array for each side
// based on shama/voxel-texture _expandName
var expandName = function(name, array) {
  if (name.top) {
    array[0] = name.back;
    array[1] = name.front;
    array[2] = name.top;
    array[3] = name.bottom;
    array[4] = name.left;
    array[5] = name.right;
    return;
  }

  // undefined -> [], scalar -> [scalar]
  name = toarray(name);
  if (name.length === 0) {
    // empty
    array[0] = array[1] = array[2] = array[3] = array[4] = array[5] = undefined;
  } else if (name.length === 1) {
    // 0 is all
    array[0] = array[1] = array[2] = array[3] = array[4] = array[5] = name[0];
  } else if (name.length === 2) {
    // 0 is top/bottom, 1 is sides
    array[0] = array[1] = array[4] = array[5] = name[0];
    array[2] = array[3] = name[1];
  } else if (name.length === 3) {
    // 0 is top, 1 is bottom, 2 is sides
    array[0] = array[1] = array[4] = array[5] = name[0];
    array[2] = name[1];
    array[3] = name[2];
  } else if (name.length === 4) {
    // 0 is top, 1 is bottom, 2 is front/back, 3 is left/right
    array[0] = array[1] = name[2];
    array[2] = name[0];
    array[3] = name[1];
    array[4] = array[5] = name[3];
  } else {
    // 0 is back, 1 is front, 2 is top, 3 is bottom, 4 is left, 5 is right
    array[0] = name[0];
    array[1] = name[1];
    array[2] = name[2];
    array[3] = name[3];
    array[4] = name[4];
    array[5] = name[5];
  }
};

StitchPlugin.prototype.stitch = function() {
  var textures = this.registry.getBlockPropsAll('texture');

  var textureNames = [];

  for (var i = 0; i < textures.length; i += 1) {
    textureNames = textureNames.concat(toarray(textures[i]));

    // TODO: set to each face based on expandName()
    for (var k = 0; k < 6; k += 1) {
      this.voxelSideTextureIDs.set(i, k, i);
    }
  }
  console.log(this.voxelSideTextureIDs);

  this.countLoading = textureNames.length;

  for (var j = 0; j < textureNames.length; j += 1) {
    var textureName = textureNames[j];

    this.addTextureName(textureName, this.nextY, this.nextX);
    this.incrementSlot();
  }
}

StitchPlugin.prototype.incrementSlot = function() {
  // point to next slot
  this.nextY += 1;
  if (this.nextY >= this.tileCount) {
    this.nextY = 0;
    this.nextX += 1; // TODO: instead, add to 4-dimensional strip then recast as 5-d?
    if (this.nextX >= this.tileCount) {
      throw new Error('texture sheet full! '+this.tileCount+'x'+this.tileCount+' exceeded');
      // TODO: 'flip' the texture sheet, see https://github.com/deathcap/voxel-texture-shader/issues/2
    }
  }
};


StitchPlugin.prototype.addTextureName = function(textureName, tileY, tileX) {
  var self = this;

  this.artpacks.getTextureNdarray(textureName, function(pixels) {
    self.addTexturePixels(pixels, tileY, tileX);
  }, function(err) {
    console.log(err);
  });
};

StitchPlugin.prototype.addTexturePixels = function(pixels, tileY, tileX) {
  /* debug
  var src = require('save-pixels')(pixels, 'canvas').toDataURL();
  var img = new Image();
  img.src = src;
  document.body.appendChild(img);
  */
  console.log(pixels);

  // copy to atlas
  // TODO: bitblt? ndarray-group?
  for (var i = 0; i < pixels.shape[0]; i += 1) {
    for (var j = 0; j < pixels.shape[1]; j += 1) {
      for (var k = 0; k < pixels.shape[2]; k += 1) {
        this.atlas.set(tileY, tileX, i, j, k, pixels.get(i, j, k));
      }
    }
  }

  this.emit('added');
  this.countLoaded += 1;
  if (this.countLoaded >= this.countLoading) {
    this.emit('addedAll');
  }
};

StitchPlugin.prototype.enable = function() {
};

StitchPlugin.prototype.disable = function() {
};


