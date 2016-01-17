# voxel-stitch

Stitches a set of block textures together into a texture atlas

The texture names are looked up from [voxel-registry](https://github.com/voxel/voxel-registry)
and the texture data from [artpacks](https://github.com/deathcap/artpacks).

For an example, run `npm start` or try the [live demo](http://voxel.github.io/voxel-stitch).

## Arbitrary rects vs fixed arrays
voxel-stitch uses
[atlaspack](https://github.com/shama/atlaspack), which supports packing textures of arbitrary rectangular
shapes onto a two-dimensional canvas. The mip maps are generated using
[rect-mip-map](https://github.com/voxel/rect-mip-map).

(Before version 0.3, voxel-stitch would generate a
5-dimensional [ndarray](https://github.com/mikolalysenko/ndarray) is in a format suitable for
[gl-tile-map](https://github.com/mikolalysenko/gl-tile-map) /
[tile-mip-map](https://github.com/mikolalysenko/tile-mip-map), which required fixed texture sizes.)

## Usage
Load using [voxel-plugins](https://github.com/voxel/voxel-plugins), options:

* `artpacks`: Array of resource pack URL(s) to load for textures, defaults to [ProgrammerArt](https://github.com/deathcap/ProgrammerArt).
* `atlasSize`: Texture atlas width and height, in pixels. Note not all graphics cards support
all texture dimensions, but [WebGL stats](http://webglstats.com/) shows `MAX_TEXTURE_SIZE` of 2048
or smaller is supported by 100% of WebGL users.
* `debug`: If true, writes out each mip level to the document for debugging.

Methods:

* `stitch()`: Build `this.atlas` from all block `texture` properties in voxel-registry.
* `createGLTexture(gl, cb)`: Creates a [gl-texture2d](https://github.com/gl-modules/gl-texture2d) with the GL context, calls `cb(err, tex)` when complete,
comparable to [gl-tile-map](https://github.com/mikolalysenko/gl-tile-map).
* `preloadTexture(name)`: Adds `name` to the list of textures to load in `stitch()`.
Textures listed in the voxel-registry `texture` property are automatically loaded;
you can add additional textures for custom non-voxel use here.
* `getTextureUV(name)`: Get UV coordinates for a texture (without padding), for custom usage with `this.texture`

Events (voxel-stitch is an [EventEmitter](http://nodejs.org/api/events.html) and emits the following):

* `added`: Added one texture to the atlas.
* `addedAll`: All of the textures in `stitch()` were added.
* `updateTexture`: All textures were added and `voxelSideTextureIDs` has been populated.

Variables:

* `atlas`: The [atlaspack](https://github.com/shama/atlaspack) instance.
* `texture`: The [gl-texture2d](https://github.com/gl-modules/gl-texture2d) instance.
* `voxelSideTextureIDs`: ndarray of (blockIndex,side) to texture ID, for [ao-mesher](https://github.com/mikolalysenko/ao-mesher) or [voxel-mesher](https://github.com/voxel/voxel-mesher).
* `voxelSideTextureSizes`: ndarray of (blockIndex,side) to lg(texture size), for [voxel-mesher](https://github.com/voxel/voxel-mesher).

## License

MIT

