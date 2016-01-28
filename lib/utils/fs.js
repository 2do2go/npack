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

var exists = exports.exists = function(filePath, callback) {
	fse.exists(filePath, function(exists) {
		callback(null, exists);
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

var readPackageJson = exports.readPackageJson = function(pkgPath) {
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
			exists(pkgPath, this.slot());
		},
		function(err, exists) {
			if (!exists) {
				return callback(null, null);
			}

			var pkgInfo = {
				name: path.basename(pkgPath),
				path: pkgPath,
				hooks: {}
			};

			var packageJson = readPackageJson(pkgPath);

			if (packageJson) {
				pkgInfo.npm = _(packageJson).pick('name', 'version');

				var npackConfig = packageJson.npack || {};

				_(pkgInfo).extend(_(npackConfig).pick('hooks'));
			}

			this.pass(pkgInfo);
		},
		callback
	);
};
