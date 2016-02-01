'use strict';

var fse = require('fs-extra'),
	multipipe = require('multipipe'),
	zlib = require('zlib'),
	tar = require('tar'),
	path = require('path'),
	_ = require('underscore'),
	Steppy = require('twostep').Steppy;

exports.extract = function(src, dest, callback) {
	var srcStream = fse.createReadStream(src);
	var gunzipStream = zlib.createGunzip();
	var tarStream = tar.Extract({path: dest});

	tarStream.on('end', callback);

	multipipe(srcStream, gunzipStream, tarStream, function(err) {
		if (err) callback(err);
	});
};

exports.exists = function(filePath, callback) {
	fse.exists(filePath, function(filePathExists) {
		callback(null, filePathExists);
	});
};

exports.linkExists = function(linkPath, callback) {
	fse.lstat(linkPath, function(err) {
		if (err) {
			if (err.code === 'ENOENT') callback(null, false);
			else callback(err);
		} else {
			callback(null, true);
		}
	});
};

exports.readPackageJson = function(pkgPath) {
	try {
		return require(path.join(pkgPath, 'package.json'));
	} catch(err) {
		if (err.code === 'MODULE_NOT_FOUND') {
			return null;
		} else {
			throw err;
		}
	}
};

exports.readPkgInfo = function(pkgPath, callback) {
	Steppy(
		function() {
			exports.exists(pkgPath, this.slot());
		},
		function(err, pkgPathExists) {
			if (!pkgPathExists) return callback(null, null);

			var pkgInfo = {
				name: path.basename(pkgPath),
				path: pkgPath,
				hooks: {},
				scripts: {}
			};

			var packageJson = exports.readPackageJson(pkgPath);

			if (packageJson) {
				pkgInfo.npm = _(packageJson).pick('name', 'version');

				var npackConfig = packageJson.npack || {};

				_(pkgInfo).extend(_(npackConfig).pick('hooks'));

				var packageJsonScripts = packageJson.scripts || {};

				if (npackConfig.scripts && npackConfig.scripts.length) {
					_(npackConfig.scripts).each(function(script) {
						pkgInfo.scripts[script] = packageJsonScripts[script] || '';
					});
				}
			}

			this.pass(pkgInfo);
		},
		callback
	);
};
