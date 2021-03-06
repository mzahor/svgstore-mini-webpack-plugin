'use strict';

const fs = require('fs');
const path = require('path');
const svgstore = require('svgstore');
const _ = require('lodash');

let ConcatSource;
let RawSource;

try {
    ConcatSource = require('webpack-core/lib/ConcatSource');
    RawSource = require('webpack-core/lib/RawSource');
} catch (e) {
    ConcatSource = require('webpack-sources').ConcatSource;
    RawSource = require('webpack-sources').RawSource;
}

class SvgstoreMiniWebpackPlugin {
    constructor(options) {
        this.options = options || {};
        this.options.prefix = this.options.prefix || '';
    }

    apply(compiler) {
        compiler.plugin('emit', (compilation, callback) => {
            try {
                const groupedSvgFilePaths = this.options.fileName
                    ? this._getSvgFilePathsForSpecifiedAsset(compilation.modules, this.options.fileName)
                    : this._getSvgFilePathsByRequiredEntry(compilation.modules);

                Object.entries(groupedSvgFilePaths).forEach(([fileName, svgFilePathsForBundle]) => {
                    // add payload with corresponding svg symbols generated by svgstore to each bundle
                    const svgPaths = svgFilePathsForBundle.map(x => x.svgFilePath);
                    const payload = this._generatePayload(svgPaths);
                    const asset = compilation.assets[fileName];

                    if (asset) {
                        // we are using existing asset
                        compilation.assets[fileName] = new ConcatSource(
                            payload,
                            asset
                        );
                    } else if (this.options.fileName) {
                        // we create asset which user specified in options
                        compilation.assets[this.options.fileName] = new RawSource(
                            payload
                        );
                    } else {
                        compilation.errors.push(
                            new Error(`SvgstoreMiniWebpackPlugin: Asset ${fileName} not found.`)
                        );
                    }
                });

                callback();
            } catch (err) {
                callback(err);
            }
        });
    }

    _generatePayload(svgFilePaths) {
        const sprites = this._generateSprites(svgFilePaths);
        const payload =
            `!function(e){var n=e.querySelector("body");` +
            `if(!n)throw new Error("SvgstoreMiniWebpackPlugin: Could not find element: body");` +
            `n.insertAdjacentHTML("afterbegin",${JSON.stringify(sprites)})}(document);`;

        return payload;
    }

    _generateSprites(svgFilePaths) {
        const sprites = svgstore({
            svgAttrs: {
                display: 'none',
            }
        });

        for (let svgFilePath of svgFilePaths) {
            const iconContent = fs.readFileSync(svgFilePath, 'utf8');
            const iconName = this.options.prefix + path.basename(svgFilePath).replace(/\.svg$/, '');
            sprites.add(iconName, iconContent);
        }

        return sprites.toString();
    }

    _getSvgFilePathsByRequiredEntry(modules) {
        const svgFilePaths = this._getSvgFilePaths(modules);
        const groupedSvgFilePaths = _.groupBy(svgFilePaths, 'fileName');

        return groupedSvgFilePaths;
    }

    _getSvgFilePathsForSpecifiedAsset(modules, fileName) {
        const svgFilePaths = this._getSvgFilePaths(modules);

        return {
            [fileName]: svgFilePaths
        };
    }

    /**
     * Builds a map between svg file path and the bundle it was required from
     * @param {*} module
     * @returns {Array<Object>}
     * Returning object with the following structure:
     * [
            {
                svgFilePath: '/path/to/file.svg',
                fileName: 'bundle.js'
            },
            {
                svgFilePath: '/path/to/another/file.svg',
                fileName: 'bundle.js'
            }
        ]
     */
    _getSvgFilePaths(modules) {
        const svgFilePaths = _.flatten(modules
            .filter(module => /svgstore-mini-loader.+!/ig.test(module.request))
            .map(module => {
                const fileNames = _.flatten(module.mapChunks(
                    chunk => chunk.files.filter(
                        file => /\.js$/.test(file)
                    )));

                return fileNames.map(fileName => ({
                    svgFilePath: module.resource,
                    fileName
                }));
            }));

        // do not include save file twice to the same bundle
        const uniqSvgFilePaths = _.uniqWith(svgFilePaths, _.isEqual);
        return uniqSvgFilePaths;
    }
}

module.exports = SvgstoreMiniWebpackPlugin;
