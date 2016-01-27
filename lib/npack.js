'use strict';

var path = require('path'),
	fse = require('fs-extra'),
	Steppy = require('twostep').Steppy,
	_ = require('underscore'),
	moment = require('moment'),
	remote = require('./utils/remote'),
	tarball = require('./utils/tarball'),
	npm = require('./utils/npm');

var getTimestamp = function() {
	return moment().format('YYYY.MM.DD-HH.mm:ss');
};

var getNpackConfig = function(pkgPath) {
	var packageJson = require(path.join(pkgPath, 'package.json'));

	return _(packageJson.npack || {}).defaults({
		hooks: {}
	});
};

var init = exports.init = function(options, callback) {
	if (_.isFunction(options)) {
		callback = options;
		options = {};
	}

	options = _({}).defaults(options, {
		root: process.cwd()
	});

	var packageJsonSymlink = path.join(options.root, 'package.json');

	Steppy(
		function() {
			var slot = this.slot();
			fse.exists(packageJsonSymlink, function(exists) {
				slot(null, exists);
			});
		},
		function(err, packageJsonSymlinkExists) {
			if (!packageJsonSymlinkExists) {
				fse.symlink(
					path.join(options.root, 'package/package.json'),
					packageJsonSymlink,
					this.slot()
				);
			}

			fse.ensureDir(path.join(options.root, 'packages'), this.slot());
		},
		callback
	);
};

exports.install = function(src, options, callback) {
	if (_.isFunction(options)) {
		callback = options;
		options = {};
	}

	options = _({}).defaults(options, {
		root: process.cwd()
	});

	var nodeModulesPath = path.join(options.root, 'node_modules');

	var newPkgTarGzPath = path.join(options.root, 'package.new.tar.gz');
	var newPkgPath = path.join(options.root, 'package.new');
	var newPkgSubPath = path.join(newPkgPath, 'package');
	var newPkgNodeModulesPath = path.join(newPkgSubPath, 'node_modules');

	var targetPkg = getTimestamp();
	var targetPkgPath = path.join(options.root, 'packages', targetPkg);

	var npackConfig;

	var copyLocalPkg = function(callback) {
		Steppy(
			function() {
				fse.stat(src, this.slot());
			},
			function(err, stat) {
				if (stat.isDirectory()) {
					fse.copy(src, newPkgSubPath, this.slot());
				} else if (stat.isFile()) {
					fse.copy(src, newPkgTarGzPath, this.slot());
				} else {
					throw new Error('Unknown package source "' + src + '"');
				}
			},
			callback
		);
	};

	Steppy(
		function() {
			fse.remove(newPkgTarGzPath, this.slot());
			fse.remove(newPkgPath, this.slot());
		},
		function() {
			if (/^https?:/.test(src)) {
				var downloadOptions = {};
				if (options.auth) downloadOptions.auth = options.auth;

				remote.download(
					src,
					newPkgTarGzPath,
					downloadOptions,
					this.slot()
				);
			} else {
				copyLocalPkg(this.slot());
			}
		},
		function() {
			var slot = this.slot();
			fse.exists(newPkgTarGzPath, function(exists) {
				slot(null, exists);
			});
		},
		function(err, tarGzExists) {
			if (tarGzExists) {
				tarball.extract(newPkgTarGzPath, newPkgPath, this.slot());
			} else {
				this.pass(null);
			}
		},
		function() {
			npackConfig = getNpackConfig(newPkgSubPath);

			var slot = this.slot();
			fse.exists(nodeModulesPath, function(exists) {
				slot(null, exists);
			});

			fse.remove(newPkgTarGzPath, this.slot());
		},
		function(err, nodeModulesExists) {
			if (nodeModulesExists) {
				fse.copy(nodeModulesPath, newPkgNodeModulesPath, this.slot());
			} else {
				this.pass(null);
			}
		},
		function() {
			npm.sync(newPkgSubPath, this.slot());
		},
		function() {
			if (npackConfig.hooks.preinstall) {
				process.exec(
					npackConfig.hooks.preinstall,
					{cwd: newPkgSubPath},
					this.slot()
				);
			} else {
				this.pass(null);
			}
		},
		function() {
			fse.remove(nodeModulesPath, this.slot());
		},
		function() {
			fse.move(newPkgNodeModulesPath, nodeModulesPath, this.slot());
		},
		function() {
			init({root: options.root}, this.slot());
		},
		function() {
			fse.move(newPkgSubPath, targetPkgPath, this.slot());
		},
		function() {
			use(targetPkg, {root: options.root}, this.slot());
			fse.remove(newPkgPath, this.slot());
		},
		function() {
			if (npackConfig.hooks.postinstall) {
				process.exec(
					npackConfig.hooks.postinstall,
					{cwd: targetPkgPath},
					this.slot()
				);
			} else {
				this.pass(null);
			}
		},
		callback
	);
};

var use = exports.use = function(pkg, options, callback) {
	if (_.isFunction(options)) {
		callback = options;
		options = {};
	}

	options = _({}).defaults(options, {
		root: process.cwd()
	});

	var packageSymlink = path.join(options.root, 'package');

	Steppy(
		function() {
			fse.remove(packageSymlink, this.slot());
		},
		function() {
			fse.symlink(
				path.join(options.root, 'packages', pkg),
				packageSymlink,
				'dir',
				this.slot()
			);
		},
		callback
	);
};

exports.list = function(callback) {

};

exports.uninstall = function(pkg, callback) {

};

exports.clean = function(callback) {

};
