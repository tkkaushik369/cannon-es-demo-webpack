const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
	entry: './src/client/client.ts',
	plugins: [
		new CopyPlugin({
			patterns: [
				{ from: path.resolve(__dirname, './client/index.html'), to: path.resolve(__dirname, '../dist/client') },
				{ from: path.resolve(__dirname, './client/favicon.ico'), to: path.resolve(__dirname, '../dist/client') },
			]
		}),
	],
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				use: 'ts-loader',
				exclude: /node_modules/,
			},
		],
	},
	resolve: {
		alias: {
			three: path.resolve('./node_modules/three'),
		},
		extensions: ['.tsx', '.ts', '.js'],
	},
	output: {
		filename: 'bundle.js',
		path: path.resolve(__dirname, '../dist/client'),
	}
};