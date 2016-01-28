'use strict';

var path = require('path'),
	fse = require('fs-extra'),
	Steppy = require('twostep').Steppy,
	_ = require('underscore'),
	exec = require('child_process').exec,
	remoteUtils = require('./utils/remote'),
	fsUtils = require('./utils/fs'),
	npmUtils = require('./utils/npm'),
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

	var log = function() {
		if (options.log) {
			console.log.apply(console, arguments);
		}
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
			log('Clean temporary files and directories');

			fse.remove(newPkgTarGzPath, this.slot());
			fse.remove(newPkgPath, this.slot());
		},
		function() {
			if (/^https?:/.test(src)) {
				// get package from remote server
				var downloadOptions = {};
				if (options.auth) downloadOptions.auth = options.auth;

				log('Download remote package from "%s"', src);

				remoteUtils.download(
					src,
					newPkgTarGzPath,
					downloadOptions,
					this.slot()
				);
			} else {
				log('Copy local package from "%s"', src);

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
				log('Package is a tarball archive, extract it');

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

			log('Read package info from "%s"', newPkgSubPath);

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
				log('Copy existing node_modules to package');

				fse.copy(nodeModulesPath, newPkgNodeModulesPath, this.slot());
			} else {
				this.pass(null);
			}
		},
		function() {
			log('Sync npm dependencies');

			// sync node_modules
			npmUtils.sync(newPkgSubPath, this.slot());
		},
		function() {
			// exec preinstall hook
			if (newPkgInfo.hooks.preinstall) {
				log('Exec preinstall hook');

				exec(
					newPkgInfo.hooks.preinstall,
					{cwd: newPkgSubPath},
					this.slot()
				);
			} else {
				this.pass(null);
			}
		},
		function() {
			log('Replace old node_modules with new');

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
			log('Move package to "%s"', targetPkgPath);

			// move new package to installed packeges folder
			fse.move(newPkgSubPath, targetPkgPath, this.slot());
		},
		function() {
			log('Switch to new package');

			// switch to new package
			use(targetPkg, {root: options.root}, this.slot());

			// remove new package temp dir
			fse.remove(newPkgPath, this.slot());
		},
		function() {
			// exec postinstall hook
			if (newPkgInfo.hooks.postinstall) {
				log('Exec postinstall hook');

				exec(
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

	var log = function() {
		if (options.log) {
			console.log.apply(console, arguments);
		}
	};

	Steppy(
		function() {
			checkCommonOptions(options);

			log('Get package info');

			// get package info object
			getInfo(pkg, {root: options.root}, this.slot());
		},
		function(err, pkgInfo) {
			if (!pkgInfo) {
				throw new Error('Package "' + pkg + '" is not found');
			}

			// return if package is already current
			if (pkgInfo.current) {
				log('Package is already current, exit');

				return callback(null);
			}

			this.pass(pkgInfo);

			// exec preuse hook
			if (pkgInfo.hooks.preuse) {
				log('Exec preuse hook');

				exec(
					pkgInfo.hooks.preuse,
					{cwd: pkgInfo.path},
					this.slot()
				);
			} else {
				this.pass(null);
			}
		},
		function(err, pkgInfo) {
			this.pass(pkgInfo);

			packageSymlink = path.join(options.root, 'package');

			log('Remove and create new symlink');

			// remove old symlink
			fse.remove(packageSymlink, this.slot());
		},
		function(err, pkgInfo) {
			this.pass(pkgInfo);

			// create symlink to new package path
			fse.symlink(pkgInfo.path, packageSymlink, 'dir', this.slot());
		},
		function(err, pkgInfo) {
			// exec postuse hook
			if (pkgInfo.hooks.postuse) {
				log('Exec postuse hook');

				exec(
					pkgInfo.hooks.postuse,
					{cwd: pkgInfo.path},
					this.slot()
				);
			} else {
				this.pass(null);
			}
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

	var log = function() {
		if (options.log) {
			console.log.apply(console, arguments);
		}
	};

	Steppy(
		function() {
			checkCommonOptions(options);

			log('Get package info');

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

			this.pass(pkgInfo);

			// exec preuninstall hook
			if (pkgInfo.hooks.preuninstall) {
				log('Exec preuninstall hook');

				exec(
					pkgInfo.hooks.preuninstall,
					{cwd: pkgInfo.path},
					this.slot()
				);
			} else {
				this.pass(null);
			}
		},
		function(err, pkgInfo) {
			this.pass(pkgInfo);

			log('Remove package folder');

			// remove package folder
			fse.remove(pkgInfo.path, this.slot());
		},
		function(err, pkgInfo) {
			// exec postuninstall hook
			if (pkgInfo.hooks.postuninstall) {
				log('Exec postuninstall hook');

				exec(
					pkgInfo.hooks.postuninstall,
					{cwd: pkgInfo.path},
					this.slot()
				);
			} else {
				this.pass(null);
			}
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
