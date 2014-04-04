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
        //['grass_top'], // TODO: arrays
      ];
    }
};

var plugin = createPlugin(null, {registry: fakeRegistry});
plugin.once('added', function() {
  console.log('ATLAS=',plugin.atlas);
  show(plugin.atlas);
});

plugin.stitch();

// show a tile map as a gl-texture - based on https://github.com/gl-modules/gl-texture2d
// TODO: fix, stretched out
function show(atlas) {
  var shell = require("gl-now")()
  var createShader = require("gl-shader")
  var createTexture = require("gl-texture2d")
  var shader, buffer, texture

  shell.on("gl-init", function() {
    var gl = shell.gl

    // added
    var pad = 1;
    texture = createTileMap(gl, atlas, pad);
    //texture = createTexture(gl, require('lena')); // red stripes??
    texture.magFilter = gl.NEAREST;
    texture.minFilter = gl.NEAREST;
    // end

    shader = createShader(gl, "\
      attribute vec2 position;\
      varying vec2 texCoord;\
      void main() {\
        gl_Position = vec4(position, 0, 1);\
        texCoord = vec2(0.5,-0.5) * (position + 1.0);\
      }", "\
      precision highp float;\
      uniform sampler2D texture;\
      varying vec2 texCoord;\
      void main() {\
        gl_FragColor = texture2D(texture, texCoord);\
      }")

    //Create vertex buffer
    buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
       4, -1,
      -1,  4
    ]), gl.STATIC_DRAW)

    /*
    texture.bind(0)
    shader.bind()
    shader.uniforms.texture = 0
    shader.attributes.position.pointer()
    */
    //shader.attributes.position.enable()
  })

  shell.on("gl-render", function() {
    var gl = shell.gl

    texture.bind(0)
    //Bind shader
    shader.bind()
    shader.uniforms.texture = 0

    //Set attributes
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    shader.attributes.position.pointer()

    //Set uniforms
    shader.uniforms.t += 0.01

    //Draw
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  })
}


