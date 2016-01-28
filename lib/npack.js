'use strict';

var path = require('path'),
	fse = require('fs-extra'),
	Steppy = require('twostep').Steppy,
	_ = require('underscore'),
	remoteUtils = require('./utils/remote'),
	fsUtils = require('./utils/fs'),
	npmUtils = require('./utils/npm'),
	processUtils = require('./utils/process'),
	dateUtils = require('./utils/date');

var checkCommonOptions = function(options) {
	_(['root']).each(function(key) {
		if (!_(options).has(key)) {
			throw new Error('Option "' + key + '" is required');
		}
	});
};

var init = exports.init = function(options, callback) {
	if (_.isFunction(options)) {
		callback = options;
		options = {};
	}

	var packageJsonSymlink;

	Steppy(
		function() {
			checkCommonOptions(options);

			packageJsonSymlink = path.join(options.root, 'package.json');

			fsUtils.linkExists(packageJsonSymlink, this.slot());
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

	var nodeModulesPath,
		newPkgTarGzPath,
		newPkgPath,
		newPkgSubPath,
		newPkgNodeModulesPath,
		targetPkg,
		targetPkgPath;

	var newPkgInfo;

	var getLocalPkg = function(callback) {
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
					throw new Error('Unknown type of package source "' + src + '"');
				}
			},
			callback
		);
	};

	Steppy(
		function() {
			checkCommonOptions(options);

			nodeModulesPath = path.join(options.root, 'node_modules');

			newPkgTarGzPath = path.join(options.root, 'package.new.tar.gz');
			newPkgPath = path.join(options.root, 'package.new');
			newPkgSubPath = path.join(newPkgPath, 'package');
			newPkgNodeModulesPath = path.join(newPkgSubPath, 'node_modules');

			targetPkg = dateUtils.getTimestamp();
			targetPkgPath = path.join(options.root, 'packages', targetPkg);

			// remove old tmp dir and tar.gz if exist
			fse.remove(newPkgTarGzPath, this.slot());
			fse.remove(newPkgPath, this.slot());
		},
		function() {
			if (/^https?:/.test(src)) {
				// get package from remote server
				var downloadOptions = {};
				if (options.auth) downloadOptions.auth = options.auth;

				remoteUtils.download(
					src,
					newPkgTarGzPath,
					downloadOptions,
					this.slot()
				);
			} else {
				// get local package/folder
				getLocalPkg(this.slot());
			}
		},
		function() {
			// check tar.gz existence
			fsUtils.exists(newPkgTarGzPath, this.slot());
		},
		function(err, tarGzExists) {
			// unpack tar.gz
			if (tarGzExists) {
				fsUtils.extract(newPkgTarGzPath, newPkgPath, this.slot());
			} else {
				this.pass(null);
			}
		},
		function() {
			// get all package infos
			if (!options.force) {
				getList({root: options.root}, this.slot());
			} else {
				this.pass([]);
			}

			// get package info from new package path
			fsUtils.readPkgInfo(newPkgSubPath, this.slot());
		},
		function(err, pkgInfos, _newPkgInfo) {
			newPkgInfo = _newPkgInfo;

			if (!options.force && newPkgInfo.npm) {
				var foundPkgInfo = _(pkgInfos).find(function(pkgInfo) {
					return pkgInfo.npm && _(newPkgInfo.npm).isEqual(pkgInfo.npm);
				});

				if (foundPkgInfo) {
					throw new Error(
						'Package with npm name "' +
						newPkgInfo.npm.name + '" and version "' +
						newPkgInfo.npm.version + '" already installed'
					);
				}
			}

			// check node_modules existence in root path
			fsUtils.exists(nodeModulesPath, this.slot());

			// remove tar.gz if exists
			fse.remove(newPkgTarGzPath, this.slot());
		},
		function(err, nodeModulesExists) {
			// copy node_modules to new package path
			if (nodeModulesExists) {
				fse.copy(nodeModulesPath, newPkgNodeModulesPath, this.slot());
			} else {
				this.pass(null);
			}
		},
		function() {
			// sync node_modules
			npmUtils.sync(newPkgSubPath, this.slot());
		},
		function() {
			// exec preinstall hook
			if (newPkgInfo.hooks.preinstall) {
				processUtils.exec(
					newPkgInfo.hooks.preinstall,
					{cwd: newPkgSubPath},
					this.slot()
				);
			} else {
				this.pass(null);
			}
		},
		function() {
			// remove old node_modules from root path
			fse.remove(nodeModulesPath, this.slot());
		},
		function() {
			// move new node_modules to root path
			fse.move(newPkgNodeModulesPath, nodeModulesPath, this.slot());
		},
		function() {
			// initialize fs structure
			init({root: options.root}, this.slot());
		},
		function() {
			// move new package to installed packeges folder
			fse.move(newPkgSubPath, targetPkgPath, this.slot());
		},
		function() {
			// switch to new package
			use(targetPkg, {root: options.root}, this.slot());

			// remove new package temp dir
			fse.remove(newPkgPath, this.slot());
		},
		function() {
			if (newPkgInfo.hooks.postinstall) {
				processUtils.exec(
					newPkgInfo.hooks.postinstall,
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

	var packageSymlink;

	Steppy(
		function() {
			checkCommonOptions(options);

			// get package info object
			getInfo(pkg, {root: options.root}, this.slot());
		},
		function(err, pkgInfo) {
			if (!pkgInfo) {
				throw new Error('Package "' + pkg + '" is not found');
			}

			// return if package is already current
			if (pkgInfo.current) return callback(null);

			this.pass(pkgInfo);

			packageSymlink = path.join(options.root, 'package');

			// remove old symlink
			fse.remove(packageSymlink, this.slot());
		},
		function(err, pkgInfo) {
			// create symlink to new package path
			fse.symlink(pkgInfo.path, packageSymlink, 'dir', this.slot());
		},
		callback
	);
};

var getList = exports.getList = function(options, callback) {
	if (_.isFunction(options)) {
		callback = options;
		options = {};
	}

	var pkgsPath;

	Steppy(
		function() {
			checkCommonOptions(options);

			pkgsPath = path.join(options.root, 'packages');

			fsUtils.exists(pkgsPath, this.slot());
		},
		function(err, exists) {
			if (!exists) return callback(null, []);

			fse.readdir(pkgsPath, this.slot());
		},
		function(err, pkgs) {
			if (!pkgs.length) return callback(null, []);

			var group = this.makeGroup();

			_(pkgs).chain().reverse().each(function(pkg) {
				getInfo(pkg, {root: options.root}, group.slot());
			});
		},
		callback
	);
};

var getInfo = exports.getInfo = function(pkg, options, callback) {
	if (_.isFunction(options)) {
		callback = options;
		options = {};
	}

	Steppy(
		function() {
			checkCommonOptions(options);

			// read package info object
			fsUtils.readPkgInfo(path.join(options.root, 'packages', pkg), this.slot());
		},
		function(err, pkgInfo) {
			if (!pkgInfo) {
				throw new Error('Package "' + pkg + '" is not found');
			}

			this.pass(pkgInfo);

			// get current package info
			getCurrentInfo({root: options.root}, this.slot());
		},
		function(err, pkgInfo, currentPkgInfo) {
			if (currentPkgInfo && currentPkgInfo.name === pkgInfo.name) {
				pkgInfo.current = true;
			}

			this.pass(pkgInfo);
		},
		callback
	);
};

var getCurrentInfo = exports.getCurrentInfo = function(options, callback) {
	if (_.isFunction(options)) {
		callback = options;
		options = {};
	}

	var packageSymlink;

	Steppy(
		function() {
			checkCommonOptions(options);

			packageSymlink = path.join(options.root, 'package');

			// check current package symlink existence
			fsUtils.linkExists(packageSymlink, this.slot());
		},
		function(err, packageSymlinkExists) {
			if (!packageSymlinkExists) return callback(null, null);

			// follow symlink
			fse.readlink(packageSymlink, this.slot());
		},
		function(err, pkgPath) {
			// read package info object
			fsUtils.readPkgInfo(pkgPath, this.slot());
		},
		function(err, pkgInfo) {
			pkgInfo.current = true;
			this.pass(pkgInfo);
		},
		callback
	);
};

var uninstall = exports.uninstall = function(pkg, options, callback) {
	if (_.isFunction(options)) {
		callback = options;
		options = {};
	}

	Steppy(
		function() {
			checkCommonOptions(options);

			// get package info
			getInfo(pkg, {root: options.root}, this.slot());
		},
		function(err, pkgInfo) {
			if (!pkgInfo) {
				throw new Error('Package "' + pkg + '" is not found');
			}

			if (pkgInfo.current) {
				throw new Error('Cannot uninstall current package "' + pkg + '"');
			}

			// remove package folder
			fse.remove(pkgInfo.path, this.slot());
		},
		callback
	);
};

exports.clean = function(options, callback) {
	if (_.isFunction(options)) {
		callback = options;
		options = {};
	}

	Steppy(
		function() {
			checkCommonOptions(options);

			// get list of all packages
			getList({root: options.root}, this.slot());
		},
		function(err, pkgInfos) {
			var group = this.makeGroup();

			// uninstall each package except current
			_(pkgInfos).each(function(pkgInfo) {
				if (!pkgInfo.current) {
					uninstall(pkgInfo.name, {root: options.root}, group.slot());
				}
			});
		},
		callback
	);
};
