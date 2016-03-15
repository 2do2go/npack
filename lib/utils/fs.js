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

exports.readPackageJson = function(pkgPath, callback) {
	Steppy(
		function() {
			fse.readFile(path.join(pkgPath, 'package.json'), {
				encoding: 'utf8'
			}, this.slot());
		},
		function(err, packageJsonData) {
			this.pass(JSON.parse(packageJsonData));
		},
		function(err, packageJson) {
			if (err && err.code === 'ENOENT') {
				packageJson = null;
				err = null;
			}

			callback(err, packageJson);
		}
	);
};

exports.readPkgInfo = function(pkgPath, callback) {
	Steppy(
		function() {
			exports.exists(pkgPath, this.slot());
		},
		function(err, pkgPathExists) {
			if (!pkgPathExists) return callback(null, null);

			exports.readPackageJson(pkgPath, this.slot());
		},
		function(err, packageJson) {
			var pkgInfo = {
				name: path.basename(pkgPath),
				path: pkgPath,
				hooks: {},
				scripts: {}
			};

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
