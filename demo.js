'use strict';

var createPlugin = require('./');
var test = require('tape');
var savePixels = require('save-pixels');
var createTileMap = require('gl-tile-map');
var createMipMaps = require('tile-mip-map');

var fakeRegistry = {
  getBlockPropsAll: 
    function(name) {
      if (name !== 'texture') throw new Error('this test only supports texture');

      return [
        undefined,
        'dirt',
        'stone',
        ['grass_top', 'dirt', 'grass_side'],
      ];
    }
};

var plugin = createPlugin(null, {registry: fakeRegistry});
plugin.on('added', function() {
  console.log('ATLAS=',plugin.atlas);
  show(plugin.atlas);
});
plugin.on('addedAll', function() {
  console.log('added all');
});

plugin.stitch();

// show a tile map as a gl-texture - based on https://github.com/gl-modules/gl-texture2d
function show(atlas) {
  var shell = require("gl-now")()
  var createShader = require("gl-shader")
  var createTexture = require("gl-texture2d")

  //var lena = require("lena")

  shell.on("gl-init", function() {
    var gl = shell.gl

    // added
    var pad = 2
    var texture = createTileMap(gl, atlas, pad)
    //var texture = createTexture(gl, lena)
    texture.minFilter = gl.NEAREST
    texture.magFilter = gl.NEAREST
    // end
    
    var shader = createShader(gl, "\
      attribute vec2 position;\
      varying vec2 texCoord;\
      void main() {\
        gl_Position = vec4(position, 0, 1);\
        texCoord = vec2(0.0,1.0)+vec2(0.5,-0.5) * (position + 1.0);\
      }", "\
      precision highp float;\
      uniform sampler2D texture;\
      varying vec2 texCoord;\
      void main() {\
        gl_FragColor = texture2D(texture, texCoord);\
      }")
    
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
       4, -1,
      -1,  4
    ]), gl.STATIC_DRAW)
    
    texture.bind(0)
    shader.bind()
    shader.uniforms.texture = 0
    shader.attributes.position.pointer()
  })

  shell.on("gl-render", function() {
    var gl = shell.gl
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  })
}
