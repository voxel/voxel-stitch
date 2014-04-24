'use strict';

var createArtpacks = require('artpacks');
var ndarray = require('ndarray');
var inherits = require('inherits');
var EventEmitter = require('events').EventEmitter;
var toarray = require('toarray');
var savePixels = require('save-pixels');
var createAtlas = require('atlaspack');
var expandName = require('cube-side-array');

var createTexture = require('gl-texture2d');
var getPixels = require('get-pixels');
var rectMipMap = require('rect-mip-map');
var touchup = require('touchup');

module.exports = function(game, opts) {
  return new StitchPlugin(game, opts);
};
module.exports.pluginInfo = {
  loadAfter: ['voxel-registry']
};

function StitchPlugin(game, opts) {
  this.registry = opts.registry || game.plugins.get('voxel-registry');
  if (!this.registry) throw new Error('voxel-stitch requires voxel-registry plugin');
  this.shell = game.shell;
  if (!this.shell) throw new Error('voxel-stitch requires game-shell'); // for gl-init

  opts = opts || {};
  opts.artpacks = opts.artpacks || ['https://dl.dropboxusercontent.com/u/258156216/artpacks/ProgrammerArt-v2.2.1-dev-ResourcePack-20140322.zip'];

  this.debug = opts.debug !== undefined ? opts.debug : false;

  // texture atlas width and height
  this.atlasSize = opts.atlasSize !== undefined ? opts.atlasSize : 2048;
  this.tileSize = opts.tileSize !== undefined ? opts.tileSize : 16;
  this.tilePad = 2;
  this.tileCount = this.atlasSize / this.tileSize / this.tilePad; // each dimension

  var canvas = document.createElement('canvas');
  canvas.width = canvas.height = this.atlasSize;
  this.atlas = createAtlas(canvas);

  this.artpacks = createArtpacks(opts.artpacks);
  this.artpacks.on('refresh', this.refresh.bind(this));

  this.countLoading = 0;
  this.countLoaded = 0;

  this.textureArraySize = opts.textureArraySize || 16;
  this.textureArrayType = opts.textureArrayType || {8:Uint8Array, 16:Uint16Array, 32:Uint32Array}[this.textureArraySize];
  this.countTextureID = opts.countTextureID || (1 << this.textureArraySize);
  this.countVoxelID = opts.countVoxelID || (2 << 14); // ao-mesher uses 16-bit, but top 1 bit is opaque/transparent flag TODO: flat 16-bit

  // 2-dimensional array of [voxelID, side] -> textureID, and lg(textureSize)
  this.voxelSideTextureIDs = ndarray(new this.textureArrayType(this.countVoxelID * 6), [this.countVoxelID, 6]);
  this.voxelSideTextureSizes = ndarray(new this.textureArrayType(this.countVoxelID * 6), [this.countVoxelID, 6]);

  this.enable();
}

inherits(StitchPlugin, EventEmitter);

StitchPlugin.prototype.enable = function() {
  this.shell.on('gl-init', this.onInit = this.stitch.bind(this));
};

StitchPlugin.prototype.disable = function() {
  this.shell.removeListener('gl-init', this.onInit);
};


// get all block textures, assign sides, and call refresh()
// (should only be called once)
StitchPlugin.prototype.stitch = function() {
  var textures = this.registry.getBlockPropsAll('texture');
  var textureNames = [];
  this.sidesFor = {};

  // iterate each block and each side for all textures, accumulate textureNames and sidesFor
  for (var blockIndex = 0; blockIndex < textures.length; blockIndex += 1) {
    var nameSideArray = expandName(textures[blockIndex], 'RTFLBK');

    for (var side = 0; side < 6; side += 1) {
      var name = nameSideArray[side];
      if (!name) continue;

      if (textureNames.indexOf(name) === -1) {
        // add new textures
        textureNames.push(name);
      }

      // this texture is for this block ID and side
      this.sidesFor[name] = this.sidesFor[name] || [];
      this.sidesFor[name].push([blockIndex, side]);
    }
  }

  // add each texture to the atlas
  this.textureNamesSlots = [];
  this.countLoading = textureNames.length;
  for (var j = 0; j < textureNames.length; j += 1) {
    this.addTextureName(textureNames[j]);
  }

  // when all textures are loaded, set texture indices from UV maps
  this.on('addedAll', this.updateTextureSideIDs.bind(this));

  // TODO this.refresh();
};

// calculate self.voxelSideTextureIDs.set [blockIndex,side] -> textureIndex for ao-mesher
StitchPlugin.prototype.updateTextureSideIDs = function() {
  var uvs = this.atlas.uv();
  for (var name in uvs) {
    // TODO: refactor with rect-mip-map, similar conversion code
    // UV coordinates 0.0 - 1.0
    var uvTopLeft = uvs[name][0];      // *\  01
    var uvBottomRight = uvs[name][2];  // \*  23

    // scale UVs by image size to get pixel coordinates
    var mx = this.atlasSize, my = this.atlasSize;
    var sx = uvTopLeft[0] * mx, sy = uvTopLeft[1] * my;
    var ex = uvBottomRight[0] * mx, ey = uvBottomRight[1] * my;
    var w = ex - sx;
    var h = ey - sy;

    // atlaspack gives UV coords, but ao-mesher wants texture index
    var tileY = sy / (this.tileSize * this.tilePad);
    var tileX = sx / (this.tileSize * this.tilePad);
    var textureIndex = tileY + this.tileCount * tileX;

    if (textureIndex >= this.countTextureID) {
      throw new Error('voxel-stitch maximum texture ID exceeded in '+name+' at ('+tileX+','+tileY+'), try increasing textureArraySize?');
    }

    // apply texture to all blocks and sides it is for
    for (var i = 0; i < this.sidesFor[name].length; ++i) {
      var elem = this.sidesFor[name][i];
      var blockIndex = elem[0], side = elem[1];

      this.voxelSideTextureIDs.set(blockIndex, side, textureIndex);

      if (w !== h) throw new Error('voxel-stitch texture '+name+' non-square dimensions '+w+' != '+h);
      var lgW = Math.log(w / this.tilePad) / Math.log(2);
      if (lgW !== lgW|0) throw new Error('voxel-stitch texture '+name+' non-power-of-two size '+w+', '+lgW);
      this.voxelSideTextureSizes.set(blockIndex, side, lgW);

      console.log('texture',name,': block',blockIndex,this.registry.getBlockName(blockIndex+1),'side',side,'=',textureIndex,' UV=('+sx+','+sy+')-('+ex+','+ey+') ('+w+'x'+h+') lgW='+lgW);
    }
    // TODO: texture sizes, w and h
  }

  var self = this;
  console.log('updateTextureSideIDs complete, about to call createGLTexture');
  this.emit('updatedSides'); // now ready: this.voxelSideTextureIDs, this.voxelSideTextureSizes

  this.createGLTexture(this.shell.gl, function(err, texture) {
    if (err) throw new Error('stitcher createGLTexture error: ' + err);
    self.emit('updateTexture', texture);
  });
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
  var showLevels = this.debug;

  getPixels(this.atlas.canvas.toDataURL(), function(err, array) {
    if (err) return cb(err);

    var pyramid = rectMipMap(array, atlas);
    console.log('pyramid=',pyramid);

    if (showLevels) {
      // add each mip level to the page for debugging TODO: refactor with rect-mip-map demo
      pyramid.forEach(function(level, i) {
        var img = new Image();
        img.src = savePixels(level, 'canvas').toDataURL();
        img.style.border = '1px dotted black';
        document.body.appendChild(document.createElement('br'));
        document.body.appendChild(img);
        document.body.appendChild(document.createTextNode(' level #'+i+' ('+img.width+'x'+img.height+')'));
      });
    }

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

    // if is animated strip, use only first frame for now TODO: animate
    if (Array.isArray(img))
      img = img[0];

    var img2 = new Image();
    img2.onload = function() {
      img2.name = name;
      var node = self.atlas.pack(img2);
      if (!node) {
        throw new Error('voxel-stitch fatal error: texture sheet full! unable to fit '+name); // TODO: flip sheets for "infinite textures", see https://github.com/deathcap/voxel-texture-shader/issues/2
      }
      self.emit('added');

      self.countLoaded += 1;
      if (self.countLoaded % self.countLoading === 0) {
        self.emit('addedAll');
      }
    };
    img2.src = touchup.repeat(img, self.tilePad, self.tilePad);

  }, function(err) {
    console.log('addTextureName error in getTextureImage for '+name+': '+err);
  });
};

StitchPlugin.prototype.showAtlas = function() {
  document.body.appendChild(this.atlas.canvas);
}


