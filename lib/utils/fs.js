'use strict';

var fse = require('fs-extra'),
	tar = require('tar'),
	path = require('path'),
	_ = require('underscore'),
	Steppy = require('twostep').Steppy;

exports.extract = function(src, dest, callback) {
	Steppy(
		function() {
			fse.ensureDir(dest, this.slot());
		},
		function() {
			tar.extract({file: src, cwd: dest}, this.slot());
		},
		callback
	);
};

exports.checkDirExists = function(options, callback) {
	Steppy(
		function() {
			fse.pathExists(options.dir, this.slot());
		},
		function(err, dirExists) {
			if (!dirExists) {
				throw new Error('Directory doesn\'t exist: "' + options.dir + '"');
			}

			this.pass(null);
		},
		callback
	);
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

exports.followSymlinks = function(filePath, callback) {
	Steppy(
		function() {
			fse.lstat(filePath, this.slot());
		},
		function(err, stat) {
			if (!stat.isSymbolicLink()) return callback(null, filePath);

			fse.readlink(filePath, this.slot());
		},
		function(err, linkString) {
			var linkTarget = path.resolve(path.dirname(filePath), linkString);
			exports.followSymlinks(linkTarget, this.slot());
		},
		callback
	);
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
			fse.pathExists(pkgPath, this.slot());
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

				_(pkgInfo).extend(_(npackConfig).pick('hooks', 'compatibility'));

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
