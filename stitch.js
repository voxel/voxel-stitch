'use strict';

var createArtpacks = require('artpacks');
var ndarray = require('ndarray');
var inherits = require('inherits');
var EventEmitter = require('events').EventEmitter;
var toarray = require('toarray');
var savePixels = require('save-pixels');
var createAtlas = require('atlaspack');

var createTexture = require('gl-texture2d');
var getPixels = require('get-pixels');
var rectMipMap = require('rect-mip-map');

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

  // texture atlas width and height
  this.atlasSize = opts.atlasSize !== undefined ? opts.atlasSize : 256;//2048; // requires downsampling each tile even if empty :( so make it smaller TODO: not after rect-tile-map!
  this.tileSize = opts.tileSize !== undefined ? opts.tileSize : 16;
  this.tileCount = this.atlasSize / this.tileSize; // each dimension

  var canvas = document.createElement('canvas');
  canvas.width = canvas.height = this.atlasSize;
  this.atlas = createAtlas(canvas);

  this.artpacks = createArtpacks(opts.artpacks);
  this.artpacks.on('refresh', this.refresh.bind(this));

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

// get all block textures, assign sides, and call refresh()
// (should only be called once)
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

  // now add each texture to the atlas
  this.textureNamesSlots = [];
  this.countLoading = textureNames.length;
  for (var j = 0; j < textureNames.length; j += 1) {
    this.addTextureName(textureNames[j]);
  }
  // TODO this.refresh();
};

// add textures
// (may be called repeatedly to update textures if pack changes)
StitchPlugin.prototype.refresh = function() {
/* TODO: problem - atlaspack pack() adds a new entry to the but we want to overwrite!
  var self = this;
  this.textureNamesSlots.forEach(function(elem) {
    var textureName = elem[0], tileY = elem[1], tileX = elem[2];
    self.addTextureName(textureName, tileY, tileX);
  });
*/
}

// create gl-texture2d for atlas with each mip level
// like https://github.com/mikolalysenko/gl-tile-map/blob/master/tilemap.js but uses rect-tile-map
StitchPlugin.prototype.createGLTexture = function(gl, cb) {
  var atlas = this.atlas;

  getPixels(this.atlas.canvas.toDataURL(), function(err, array) {
    if (err) return cb(err);

    var pyramid = rectMipMap(array, atlas);
    console.log('pyramid=',pyramid);

    var tex = createTexture(gl, pyramid[0]);
    tex.generateMipmap(); // TODO: ?

    for (var i = 1; i < pyramid.length; ++i) {
      tex.setPixels(pyramid[i], 0, 0, i);
    }

    tex.magFilter = gl.NEAREST
    tex.minFilter = gl.LINEAR_MIPMAP_LINEAR
    tex.mipSamples = 4

    cb(null, tex);
  });
};

StitchPlugin.prototype.addTextureName = function(name) {
  var self = this;

  this.artpacks.getTextureImage(name, function(img) {
    img.name = name;
    self.atlas.pack(img)

    self.emit('added');

    self.countLoaded += 1;
    if (self.countLoaded % self.countLoading === 0) {
      self.emit('addedAll');
    }
  }, function(err) {
    console.log('addTextureName error in getTextureImage for '+name+': '+err);
  });
};

StitchPlugin.prototype.showAtlas = function() {
  document.body.appendChild(this.atlas.canvas);
}

StitchPlugin.prototype.enable = function() {
};

StitchPlugin.prototype.disable = function() {
};


