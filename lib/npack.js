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

var checkOptions = function(options, keys) {
	_(keys).each(function(key) {
		if (!_(options).has(key)) {
			throw new Error('Option "' + key + '" is required');
		}
	});
};

var getPkgName = function(format) {
	if (format === 'timestamp') {
		return dateUtils.getTimestamp();
	} else {
		throw new Error('Unknown name format "' + format + '"');
	}
};

var init = exports.init = function(options, callback) {
	var packageJsonSymlink;

	Steppy(
		function() {
			checkOptions(options, ['dir']);

			packageJsonSymlink = path.join(options.dir, 'package.json');

			fsUtils.linkExists(packageJsonSymlink, this.slot());
		},
		function(err, packageJsonSymlinkExists) {
			if (!packageJsonSymlinkExists) {
				fse.symlink(
					path.join(options.dir, 'package/package.json'),
					packageJsonSymlink,
					this.slot()
				);
			}

			fse.ensureDir(path.join(options.dir, 'packages'), this.slot());
		},
		callback
	);
};

exports.install = function(options, callback) {
	options = _({}).defaults(options, {
		nameFormat: 'timestamp'
	});

	var nodeModulesPath,
		newPkgTarGzPath,
		newPkgPath,
		newPkgSubPath,
		newPkgNodeModulesPath,
		targetPkgName,
		targetPkgPath;

	var newPkgInfo;

	var getPkgFromLocalSource = function(src, callback) {
		Steppy(
			function() {
				fsUtils.exists(src, this.slot());
			},
			function(err, srcExists) {
				if (!srcExists) {
					throw new Error('Local source "' + src + '" does not exist');
				}

				fse.stat(src, this.slot());
			},
			function(err, stat) {
				if (stat.isDirectory()) {
					fse.copy(src, newPkgSubPath, this.slot());
				} else if (stat.isFile()) {
					fse.copy(src, newPkgTarGzPath, this.slot());
				} else {
					throw new Error('Unknown type of local source "' + src + '"');
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
			checkOptions(options, ['src', 'dir']);

			nodeModulesPath = path.join(options.dir, 'node_modules');

			newPkgTarGzPath = path.join(options.dir, 'package.new.tar.gz');
			newPkgPath = path.join(options.dir, 'package.new');
			newPkgSubPath = path.join(newPkgPath, 'package');
			newPkgNodeModulesPath = path.join(newPkgSubPath, 'node_modules');

			targetPkgName = getPkgName(options.nameFormat);
			targetPkgPath = path.join(options.dir, 'packages', targetPkgName);

			// remove old tmp dir and tar.gz if exist
			log('Clean temporary files and directories');

			fse.remove(newPkgTarGzPath, this.slot());
			fse.remove(newPkgPath, this.slot());
		},
		function() {
			if (/^https?:/.test(options.src)) {
				// get package from remote server
				var downloadOptions = {};
				if (options.auth) downloadOptions.auth = options.auth;

				log('Download from remove source "%s"', options.src);

				remoteUtils.download(
					options.src,
					newPkgTarGzPath,
					downloadOptions,
					this.slot()
				);
			} else {
				log('Copy from local source "%s"', options.src);

				// get local package/folder
				getPkgFromLocalSource(
					path.resolve(options.dir, options.src),
					this.slot()
				);
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
				getList(_(options).pick('dir'), this.slot());
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
			npmUtils.sync({
				dir: newPkgSubPath,
				log: options.log
			}, this.slot());
		},
		function() {
			// exec preinstall hook
			if (newPkgInfo.hooks.preinstall) {
				log('Exec preinstall hook "%s"', newPkgInfo.hooks.preinstall);

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
			log('Initialize fs structure in "%s"', options.dir);

			// initialize fs structure
			init(_(options).pick('dir'), this.slot());
		},
		function() {
			log('Move package to "%s"', targetPkgPath);

			// move new package to installed packeges folder
			fse.move(newPkgSubPath, targetPkgPath, this.slot());
		},
		function() {
			log('Switch to new package "%s"', targetPkgName);

			// switch to new package
			use({
				name: targetPkgName,
				dir: options.dir
			}, this.slot());

			// remove new package temp dir
			fse.remove(newPkgPath, this.slot());
		},
		function() {
			// exec postinstall hook
			if (newPkgInfo.hooks.postinstall) {
				log('Exec postinstall hook "%s"', newPkgInfo.hooks.postinstall);

				exec(
					newPkgInfo.hooks.postinstall,
					{cwd: targetPkgPath},
					this.slot()
				);
			} else {
				this.pass(null);
			}
		},
		function() {
			getCurrentInfo(_(options).pick('dir'), this.slot());
		},
		callback
	);
};

var use = exports.use = function(options, callback) {
	var packageSymlink;

	var log = function() {
		if (options.log) {
			console.log.apply(console, arguments);
		}
	};

	Steppy(
		function() {
			checkOptions(options, ['name', 'dir']);

			log('Get package "%s" info', options.name);

			// get package info object
			getInfo(_(options).pick('name', 'dir'), this.slot());
		},
		function(err, pkgInfo) {
			if (!pkgInfo) {
				throw new Error('Package "' + options.name + '" is not found');
			}

			// return if package is already current
			if (pkgInfo.current) {
				log('Package is already current, exit');

				return callback(null);
			}

			this.pass(pkgInfo);

			// exec preuse hook
			if (pkgInfo.hooks.preuse) {
				log('Exec preuse hook "%s"', pkgInfo.hooks.preuse);

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

			packageSymlink = path.join(options.dir, 'package');

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
				log('Exec postuse hook "%s"', pkgInfo.hooks.postuse);

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
	var pkgsPath;

	Steppy(
		function() {
			checkOptions(options, ['dir']);

			pkgsPath = path.join(options.dir, 'packages');

			fsUtils.exists(pkgsPath, this.slot());
		},
		function(err, exists) {
			if (!exists) return callback(null, []);

			fse.readdir(pkgsPath, this.slot());
		},
		function(err, pkgNames) {
			if (!pkgNames.length) return callback(null, []);

			var group = this.makeGroup();

			_(pkgNames).chain().reverse().each(function(pkgName) {
				getInfo({
					name: pkgName,
					dir: options.dir
				}, group.slot());
			});
		},
		callback
	);
};

var getInfo = exports.getInfo = function(options, callback) {
	Steppy(
		function() {
			checkOptions(options, ['name', 'dir']);

			// read package info object
			fsUtils.readPkgInfo(
				path.join(options.dir, 'packages', options.name),
				this.slot()
			);
		},
		function(err, pkgInfo) {
			if (!pkgInfo) {
				throw new Error('Package "' + options.name + '" is not found');
			}

			this.pass(pkgInfo);

			// get current package info
			getCurrentInfo(_(options).pick('dir'), this.slot());
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
	var packageSymlink;

	Steppy(
		function() {
			checkOptions(options, ['dir']);

			packageSymlink = path.join(options.dir, 'package');

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

var uninstall = exports.uninstall = function(options, callback) {
	var log = function() {
		if (options.log) {
			console.log.apply(console, arguments);
		}
	};

	Steppy(
		function() {
			checkOptions(options, ['name', 'dir']);

			log('Get package "%s" info', options.name);

			// get package info
			getInfo(_(options).pick('name', 'dir'), this.slot());
		},
		function(err, pkgInfo) {
			if (!pkgInfo) {
				throw new Error('Package "' + options.name + '" is not found');
			}

			if (pkgInfo.current) {
				throw new Error('Cannot uninstall current package "' + options.name + '"');
			}

			this.pass(pkgInfo);

			// exec preuninstall hook
			if (pkgInfo.hooks.preuninstall) {
				log('Exec preuninstall hook "%s"', pkgInfo.hooks.preuninstall);

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

			log('Remove package folder "%s"', pkgInfo.path);

			// remove package folder
			fse.remove(pkgInfo.path, this.slot());
		},
		function(err, pkgInfo) {
			// exec postuninstall hook
			if (pkgInfo.hooks.postuninstall) {
				log('Exec postuninstall hook "%s"', pkgInfo.hooks.postuninstall);

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
	var log = function() {
		if (options.log) {
			console.log.apply(console, arguments);
		}
	};

	Steppy(
		function() {
			checkOptions(options, ['dir']);

			log('Get installed packages list');

			// get list of all packages
			getList(_(options).pick('dir'), this.slot());
		},
		function(err, pkgInfos) {
			var group = this.makeGroup();

			// filter not current packages
			pkgInfos = _(pkgInfos).filter(function(pkgInfo) {
				return !pkgInfo.current;
			});

			if (pkgInfos.length) {
				// uninstall each package except current
				_(pkgInfos).each(function(pkgInfo) {
					uninstall({
						name: pkgInfo.name,
						dir: options.dir,
						log: options.log
					}, group.slot());
				});
			} else {
				log('Nothing to clean, exit');
			}
		},
		callback
	);
};
