'use strict';

var createArtpacks = require('artpacks');
var ndarray = require('ndarray');
var inherits = require('inherits');
var EventEmitter = require('events').EventEmitter;
var toarray = require('toarray');
var savePixels = require('save-pixels');

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
  opts.artpacks = opts.artpacks || ['https://dl.dropboxusercontent.com/u/258156216/artpacks/ProgrammerArt-v2.2.1-dev-ResourcePack-20140322.zip'];
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

// expand a convenient shorthand name into a 6-element array for each side
// based on shama/voxel-texture _expandName TODO: split into separate module?
var expandName = function(name, array) {
  if (!name || name.length === 0) {
    // empty
    array[0] = array[1] = array[2] = array[3] = array[4] = array[5] = undefined;
  } else if (name.top) {
    // explicit names
    array[0] = name.back;
    array[1] = name.front;
    array[2] = name.top;
    array[3] = name.bottom;
    array[4] = name.left;
    array[5] = name.right;
  } else if (!Array.isArray(name)) {
     // scalar is all
    array[0] = array[1] = array[2] = array[3] = array[4] = array[5] = name;
  } else if (name.length === 1) {
    // 0 is all
    array[0] = array[1] = array[2] = array[3] = array[4] = array[5] = name[0];
  } else if (name.length === 2) {
    // 0 is top/bottom, 1 is sides
    array[0] = array[1] = array[4] = array[5] = name[1];
    array[2] = array[3] = name[0];
  } else if (name.length === 3) {
    // 0 is top, 1 is bottom, 2 is sides
    array[0] = array[1] = array[4] = array[5] = name[2];
    array[2] = name[0];
    array[3] = name[1];
  } else if (name.length === 4) {
    // 0 is top, 1 is bottom, 2 is front/back, 3 is left/right
    array[0] = array[1] = name[2];
    array[2] = name[0];
    array[3] = name[1];
    array[4] = array[5] = name[3];
  } else if (name.length === 5) {
    // 0 is top, 1 is bottom, 2 is front, 3 is back, 4 is left/right
    array[0] = name[3];
    array[1] = name[2];
    array[2] = name[0];
    array[3] = name[1];
    array[4] = array[5] = name[4];
  } else if (name.length === 6) {
    // 0 is back, 1 is front, 2 is top, 3 is bottom, 4 is left, 5 is right
    array[0] = name[0];
    array[1] = name[1];
    array[2] = name[2];
    array[3] = name[3];
    array[4] = name[4];
    array[5] = name[5];
  } else {
    throw new Error('expandName('+name+'): invalid side count array length '+name.length);
  }

  // convert voxel-texture[-shader] side order to ao-mesher side order
  //  0       1    2       3     4        5
  // back   front top   bottom  left    right   voxel-texture (input)
  // right  top   front left    bottom  back    ao-mesher (output)
  var tmp;
  tmp = array[0]; array[0] = array[5]; array[5] = tmp;
  tmp = array[1]; array[1] = array[2]; array[2] = tmp;
  tmp = array[3]; array[3] = array[4]; array[4] = tmp;
};

var nameSideArray = new Array(6);

StitchPlugin.prototype.stitch = function() {
  var textures = this.registry.getBlockPropsAll('texture');
  var textureNames = [];

  // assign per-side texture indices for each voxel type
  for (var blockIndex = 0; blockIndex < textures.length; blockIndex += 1) {
    expandName(textures[blockIndex], nameSideArray);

    for (var side = 0; side < 6; side += 1) {
      var name = nameSideArray[side];
      if (!name) continue;

      var textureIndex = textureNames.indexOf(name);
      if (textureIndex === -1) {
        // add new textures
        textureNames.push(name);
        textureIndex = textureNames.length - 1;
      }

      this.voxelSideTextureIDs.set(blockIndex, side, textureIndex);
    }
  }

  // now asynchronously load each texture
  this.countLoading = textureNames.length;
  this.countLoaded = 0;

  // first assign all textures to slots, in order
  var textureNamesSlots = [];
  for (var j = 0; j < textureNames.length; j += 1) {
    textureNamesSlots.push([textureNames[j], this.nextY, this.nextX]);
    this.incrementSlot();
  }

  // then add to atlas
  var self = this;
  textureNamesSlots.forEach(function(elem) {
    var textureName = elem[0], tileY = elem[1], tileX = elem[2];
    self.addTextureName(textureName, tileY, tileX);
  });
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
    console.log(err, textureName);
  });
};

StitchPlugin.prototype.addTexturePixels = function(pixels, tileY, tileX) {
  /* debug
  var src = savePixels(pixels, 'canvas').toDataURL();
  var img = new Image();
  img.src = src;
  document.body.appendChild(img);
  */

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
  if (this.countLoaded % this.countLoading === 0) {
    this.emit('addedAll');
  }
};

StitchPlugin.prototype.showAtlas = function() {
  var img = new Image();
  var pixels = ndarray(this.atlas.data,
      //[this.atlas.shape[0] * this.atlas.shape[2], this.atlas.shape[1] * this.atlas.shape[3], this.atlas.shape[4]]); // reshapeTileMap from gl-tile-map, same
      [this.tileSize * this.tileCount, this.tileSize * this.tileCount, 4]);

  img.src = savePixels(pixels, 'canvas').toDataURL();
  console.log(img.src);
  document.body.appendChild(img);
}

StitchPlugin.prototype.enable = function() {
};

StitchPlugin.prototype.disable = function() {
};


