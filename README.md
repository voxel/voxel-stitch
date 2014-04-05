# voxel-stitch

Stitches a set of block textures together into a tile map texture atlas

The texture names are looked up from [voxel-registry](https://github.com/deathcap/voxel-registry)
and the texture data from [artpacks](https://github.com/deathcap/artpacks). The resulting
5-dimensional [ndarray](https://github.com/mikolalysenko/ndarray) is in a format suitable for
[gl-tile-map](https://github.com/mikolalysenko/gl-tile-map) to generate a [gl-texture2d](https://github.com/gl-modules/gl-texture2d).

For an example, run `npm start` or try the [live demo](http://deathcap.github.io/voxel-stitch).

## Limitations

The atlas is a fixed grid of tiles, all the same size. This means you cannot mix
textures of different resolutions, unfortunately. See also
[atlaspack](https://github.com/shama/atlaspack) (as used by
[voxel-texture](https://github.com/shama/voxel-texture) and
[voxel-texture-shader](https://github.com/deathcap/voxel-texture-shader)) for
a more flexible arbitrary-rectangle packing approach.


## Usage
Load using [voxel-plugins](https://github.com/deathcap/voxel-plugins), options:

* `artpacks`: Array of resource pack URL(s) to load for textures, defaults to [ProgrammerArt](https://github.com/deathcap/ProgrammerArt).
* `atlasSize`: Texture atlas width and height, in pixels. Note not all graphics cards support
all texture dimensions, but [WebGL stats](http://webglstats.com/) shows `MAX_TEXTURE_SIZE` of 2048
or smaller is supported by 100% of WebGL users.

Methods:

* `stitch()`: Build `this.atlas` from all block `texture` properties in voxel-registry.

Events (voxel-stitch is an [EventEmitter](http://nodejs.org/api/events.html) and emits the following):

* `added`: Added one texture to the atlas.
* `addedAll`: All of the textures in `stitch()` were added.

Variables:

* `atlas`: an ndarray to pass to [gl-tile-map](https://github.com/mikolalysenko/gl-tile-map)

## License

MIT

