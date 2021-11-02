const path = require('path');
const zopfli = require("@gfx/zopfli");
const CompressionPlugin = require("compression-webpack-plugin");
const HtmlWebpackPlugin = require('html-webpack-plugin');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

const isProductionMode = (mode) => {
    return /^production$/.test(mode);
};

const mode = /^development|production|test$/.test(process.env.NODE_ENV) ?
    process.env.NODE_ENV : 'development';

// console.log("In mode '" + mode + "'='" + process.env.NODE_ENV + "'");

const productionMode = isProductionMode(mode);
const deleteOriginalAssets = true;

const optimization = {
    minimize: productionMode
};

if(productionMode) {
    optimization.splitChunks = {
        cacheGroups: {
            commons: {
                test: /[\\/]node_modules[\\/]/,
                // cacheGroupKey here is `commons` as the key of the cacheGroup
                /* name(module, chunks, cacheGroupKey) {
                    const moduleFileName = module
                    .identifier()
                    .split('/')
                    .reduceRight((item) => item);
                    const allChunksNames = chunks.map((item) => item.name).join('~');
                    return `${cacheGroupKey}-${allChunksNames}-${moduleFileName}`;
                }, */
                chunks: 'all',
                maxSize: 1024 * 256,
            },
        },
    };
}

const plugins = [
    new HtmlWebpackPlugin({
        template: path.join(process.cwd(), 'public', 'index.html'),
    }),
];

if (productionMode) {
    plugins.push(new CompressionPlugin({
        algorithm(input, compressionOptions, callback) {
            return zopfli.gzip(input, compressionOptions, callback);
        },
        compressionOptions: {
            numiterations: 15,
        },
        deleteOriginalAssets,
        filename: "[path][base].gz",
        minRatio: 0.8,
        test: /\.(js|css|svg)$/,
        threshold: 10240,
    }));
}

if (/^build$/.test(process.argv[process.argv.length - 1]) && (!productionMode || !deleteOriginalAssets)) {
    plugins.push(new BundleAnalyzerPlugin({ analyzerMode: 'static', openAnalyzer: true }));
}

module.exports = {
    devtool: !productionMode ? 'source-map' : undefined,
    entry: {
        index: './src/index.tsx',
    },
    mode: mode,
    output: {
        clean: true,
        path: path.join(process.cwd(), 'dist'),
        filename: '[name].[contenthash].bundle.js',
        clean: true, // Clean the output directory before emit.
    },
    resolve: {
        alias: {
            '~': path.resolve(process.cwd(), 'src/'),
        },
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
    },
    devServer: {
        proxy: [
            {
              context: ['/json-api/book-store/v1'],
              target: 'http://localhost:3000',
            },
        ],
        static: {
            directory: path.join(process.cwd(), 'public'),
        },
        watchFiles: ['src/**/*', 'public/**/*'],
    },
    optimization,
    module: {
        rules: [
            {
                test: /\.(js|jsx)$/i,
                exclude: /node_modules/,
                use: ['babel-loader'],
            },
            {
                test: /\.(ts|tsx)$/i,
                exclude: /node_modules/,
                use: ['ts-loader'],
            },
            {
                test: /\.(css|scss)$/i,
                exclude: /node_modules/,
                use: ['style-loader', 'css-loader', 'postcss-loader'],
            },
            {
                test: /\.(jpg|jpeg|png|gif|mp3|svg)$/,
                exclude: /node_modules/,
                use: ['file-loader'],
            },
        ],
    },
    plugins,
};