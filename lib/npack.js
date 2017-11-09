'use strict';

var path = require('path'),
	fse = require('fs-extra'),
	Steppy = require('twostep').Steppy,
	_ = require('underscore'),
	utilsLogger = require('./utils/logger'),
	processUtils = require('./utils/process'),
	fsUtils = require('./utils/fs'),
	npmUtils = require('./utils/npm'),
	dateUtils = require('./utils/date'),
	packageJson = require('../package.json'),
	semver = require('semver');

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

var createLogger = function(options) {
	return options.log ? utilsLogger : {log: _.noop, warn: _.noop};
};

var packageIndexRegex = /\d+/;

exports.version = packageJson.version;

exports.loadConfig = function(options, callback) {
	var logger = createLogger(options);

	Steppy(
		function() {
			fsUtils.exists(options.path, this.slot());
		},
		function(err, configExists) {
			if (configExists) {
				fse.readFile(options.path, 'utf8', this.slot());
			} else {
				this.pass(null);
			}
		},
		function(err, configText) {
			var config;

			if (configText) {
				config = JSON.parse(configText);

				config = _(config).pick('env');

				logger.log(
					'Loaded config from `%s`:\n%s',
					path.relative(process.cwd(), options.path),
					JSON.stringify(config, null, 4)
				);
			} else {
				config = {};
			}

			this.pass(config);
		},
		function(err, config) {
			if (err) {
				err = new Error(
					'Error while loading config ' + options.path + ': ' +
					err.message
				);
			}

			callback(err, config);
		}
	);
};

exports.install = function(options, callback) {
	options = _({}).defaults(options, {
		nameFormat: 'timestamp'
	});

	var currentNodeModulesPath;

	var tmpPkgTarGzPath,
		tmpPkgPath,
		tmpPkgSubPath,
		tmpPkgNodeModulesPath,
		tmpPkgInfo;

	var pkgsPath;

	var newPkgName,
		newPkgPath;

	var logger = createLogger(options);

	Steppy(
		function() {
			checkOptions(options, ['src', 'dir']);

			logger.log('Install new package from "%s"', options.src);

			currentNodeModulesPath = path.join(options.dir, 'package', 'node_modules');

			tmpPkgTarGzPath = path.join(options.dir, 'tmp_package.tar.gz');
			tmpPkgPath = path.join(options.dir, 'tmp_package');
			tmpPkgSubPath = path.join(tmpPkgPath, 'package');
			tmpPkgNodeModulesPath = path.join(tmpPkgSubPath, 'node_modules');

			pkgsPath = path.join(options.dir, 'packages');

			newPkgName = getPkgName(options.nameFormat);
			newPkgPath = path.join(pkgsPath, newPkgName);

			// remove old tmp dir and tar.gz if exist
			logger.log('Clean temporary files and directories');

			fse.remove(tmpPkgTarGzPath, this.slot());
			fse.remove(tmpPkgPath, this.slot());
		},
		function() {
			logger.log('Download tarball "%s"', options.src);

			var downloadOptions = {};

			if (options.auth) {
				downloadOptions.auth = options.auth;
			}

			npmUtils.download(
				options.src,
				tmpPkgTarGzPath,
				downloadOptions,
				this.slot()
			);
		},
		function() {
			logger.log('Extract tarball');

			fsUtils.extract(tmpPkgTarGzPath, tmpPkgPath, this.slot());
		},
		function() {
			// get all package infos
			if (!options.force) {
				exports.getList(_(options).pick('dir'), this.slot());
			} else {
				this.pass([]);
			}

			logger.log('Read package info from "%s"', tmpPkgSubPath);

			// get package info from temp package
			fsUtils.readPkgInfo(tmpPkgSubPath, this.slot());
		},
		function(err, pkgInfos, _tmpPkgInfo) {
			tmpPkgInfo = _tmpPkgInfo;

			if (tmpPkgInfo.compatibility) {
				if (!semver.satisfies(exports.version, tmpPkgInfo.compatibility)) {
					throw new Error(
						'Current npack version "' + exports.version + '" ' +
						'doesn\'t satisfy version required by package: "' +
						tmpPkgInfo.compatibility + '"'
					);
				}
			}

			if (!options.force && tmpPkgInfo.npm) {
				var foundPkgInfo = _(pkgInfos).find(function(pkgInfo) {
					return pkgInfo.npm && _(tmpPkgInfo.npm).isEqual(pkgInfo.npm);
				});

				if (foundPkgInfo) {
					throw new Error(
						'Package with npm name "' +
						tmpPkgInfo.npm.name + '" and version "' +
						tmpPkgInfo.npm.version + '" already installed'
					);
				}
			}

			// check node_modules existence in root path
			fsUtils.exists(currentNodeModulesPath, this.slot());

			// check node_modules existence in new package path
			fsUtils.exists(tmpPkgNodeModulesPath, this.slot());

			// remove tar.gz if exists
			fse.remove(tmpPkgTarGzPath, this.slot());
		},
		function(err, currentNodeModulesExists, tmpPkgNodeModulesExists) {
			// copy node_modules to new package path
			if (currentNodeModulesExists && !tmpPkgNodeModulesExists) {
				logger.log('Copy current package node_modules to temp package');

				fse.copy(currentNodeModulesPath, tmpPkgNodeModulesPath, this.slot());
			} else {
				this.pass(null);
			}
		},
		function() {
			logger.log('Sync temp package npm dependencies');

			// sync node_modules
			npmUtils.sync({
				cwd: tmpPkgSubPath,
				log: options.log
			}, this.slot());
		},
		function() {
			// exec preinstall hook
			if (tmpPkgInfo.hooks.preinstall) {
				if (_(options.disabledHooks).contains('preinstall')) {
					logger.warn(
						'Skipping disabled "preinstall" hook "%s"',
						tmpPkgInfo.hooks.preinstall
					);

					this.pass(null);
				} else {
					logger.log(
						'Exec "preinstall" hook "%s"',
						tmpPkgInfo.hooks.preinstall
					);

					processUtils.execScript(tmpPkgInfo.hooks.preinstall, {
						cwd: tmpPkgSubPath,
						dir: options.dir,
						log: options.log,
						env: options.env
					}, this.slot());
				}
			} else {
				this.pass(null);
			}
		},
		function() {
			logger.log('Move package to "%s"', newPkgPath);

			// move new package to installed packeges folder
			fse.copy(tmpPkgSubPath, newPkgPath, this.slot());
		},
		function() {
			// remove temp package dir (it should be empty)
			fse.remove(tmpPkgPath, this.slot());
		},
		function() {
			if (options.use) {
				logger.log('Switch to new package "%s"', newPkgName);

				var useOptions = _(options)
					.chain()
					.pick('dir', 'log', 'disabledHooks', 'env', 'version')
					.extend({name: newPkgName})
					.value();

				// switch to new package
				exports.use(useOptions, this.slot());
			} else {
				this.pass(null);
			}
		},
		function() {
			// exec postinstall hook
			if (tmpPkgInfo.hooks.postinstall) {
				if (_(options.disabledHooks).contains('postinstall')) {
					logger.warn(
						'Skipping disabled "postinstall" hook "%s"',
						tmpPkgInfo.hooks.postinstall
					);

					this.pass(null);
				} else {
					logger.log(
						'Exec "postinstall" hook "%s"',
						tmpPkgInfo.hooks.postinstall
					);

					processUtils.execScript(tmpPkgInfo.hooks.postinstall, {
						cwd: newPkgPath,
						dir: options.dir,
						log: options.log,
						env: options.env
					}, this.slot());
				}
			} else {
				this.pass(null);
			}
		},
		function() {
			logger.log('Package successfully installed');

			exports.getInfo({
				name: newPkgName,
				dir: options.dir
			}, this.slot());
		},
		callback
	);
};

exports.use = function(options, callback) {
	var packageSymlink;

	var logger = createLogger(options);

	Steppy(
		function() {
			checkOptions(options, ['name', 'dir']);

			logger.log('Set package "%s" as current', options.name);

			// get package info object
			exports.getInfo(_(options).pick('name', 'dir'), this.slot());
		},
		function(err, pkgInfo) {
			if (pkgInfo.compatibility) {
				if (!semver.satisfies(exports.version, pkgInfo.compatibility)) {
					throw new Error(
						'Current npack version "' + exports.version + '" ' +
						'doesn\'t satisfy version required by package: "' +
						pkgInfo.compatibility + '"'
					);
				}
			}

			// return if package is already current
			if (pkgInfo.current) {
				logger.log('Package is already current, exit');

				return callback(null, pkgInfo);
			}

			this.pass(pkgInfo);

			// exec preuse hook
			if (pkgInfo.hooks.preuse) {
				if (_(options.disabledHooks).contains('preuse')) {
					logger.warn(
						'Skipping disabled "preuse" hook "%s"',
						pkgInfo.hooks.preuse
					);

					this.pass(null);
				} else {
					logger.log('Exec "preuse" hook "%s"', pkgInfo.hooks.preuse);

					processUtils.execScript(pkgInfo.hooks.preuse, {
						cwd: pkgInfo.path,
						dir: options.dir,
						log: options.log,
						env: options.env
					}, this.slot());
				}
			} else {
				this.pass(null);
			}
		},
		function(err, pkgInfo) {
			this.pass(pkgInfo);

			packageSymlink = path.join(options.dir, 'package');

			logger.log('Remove and create new symlink');

			// remove old symlink
			fse.remove(packageSymlink, this.slot());
		},
		function(err, pkgInfo) {
			this.pass(pkgInfo);

			// create symlink to new package path
			fse.symlink(
				path.relative(options.dir, pkgInfo.path),
				packageSymlink,
				'dir',
				this.slot()
			);
		},
		function(err, pkgInfo) {
			this.pass(pkgInfo);

			// exec postuse hook
			if (pkgInfo.hooks.postuse) {
				if (_(options.disabledHooks).contains('postuse')) {
					logger.warn(
						'Skipping disabled "postuse" hook "%s"',
						pkgInfo.hooks.postuse
					);

					this.pass(null);
				} else {
					logger.log('Exec "postuse" hook "%s"', pkgInfo.hooks.postuse);

					processUtils.execScript(pkgInfo.hooks.postuse, {
						cwd: pkgInfo.path,
						dir: options.dir,
						log: options.log,
						env: options.env
					}, this.slot());
				}
			} else {
				this.pass(null);
			}
		},
		function(err, pkgInfo) {
			logger.log('Package successfully set as current');

			pkgInfo.current = true;

			this.pass(pkgInfo);
		},
		callback
	);
};

exports.getList = function(options, callback) {
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
				exports.getInfo({
					name: pkgName,
					dir: options.dir
				}, group.slot());
			});
		},
		callback
	);
};

exports.getInfo = function(options, callback) {
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
			exports.getCurrentInfo(_(options).pick('dir'), this.slot());
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

exports.getCurrentInfo = function(options, callback) {
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
			if (pkgInfo) {
				pkgInfo.current = true;
			}

			this.pass(pkgInfo);
		},
		callback
	);
};

exports.uninstall = function(options, callback) {
	var logger = createLogger(options);

	Steppy(
		function() {
			checkOptions(options, ['name', 'dir']);

			logger.log('Uninstall package "%s"', options.name);

			// get package info
			exports.getInfo(_(options).pick('name', 'dir'), this.slot());
		},
		function(err, pkgInfo) {
			if (pkgInfo.compatibility) {
				if (!semver.satisfies(exports.version, pkgInfo.compatibility)) {
					throw new Error(
						'Current npack version "' + exports.version + '" ' +
						'doesn\'t satisfy version required by package: "' +
						pkgInfo.compatibility + '"'
					);
				}
			}

			if (pkgInfo.current) {
				throw new Error('Cannot uninstall current package "' + options.name + '"');
			}

			this.pass(pkgInfo);

			// exec preuninstall hook
			if (pkgInfo.hooks.preuninstall) {
				if (_(options.disabledHooks).contains('preuninstall')) {
					logger.warn(
						'Skipping disabled "preuninstall" hook "%s"',
						pkgInfo.hooks.preuninstall
					);

					this.pass(null);
				} else {
					logger.log(
						'Exec "preuninstall" hook "%s"',
						pkgInfo.hooks.preuninstall
					);

					processUtils.execScript(pkgInfo.hooks.preuninstall, {
						cwd: pkgInfo.path,
						dir: options.dir,
						log: options.log,
						env: options.env
					}, this.slot());
				}
			} else {
				this.pass(null);
			}
		},
		function(err, pkgInfo) {
			this.pass(pkgInfo);

			logger.log('Remove package folder "%s"', pkgInfo.path);

			// remove package folder
			fse.remove(pkgInfo.path, this.slot());
		},
		function(err, pkgInfo) {
			// exec postuninstall hook
			if (pkgInfo.hooks.postuninstall) {
				if (_(options.disabledHooks).contains('postuninstall')) {
					logger.warn(
						'Skipping disabled "postuninstall" hook "%s"',
						pkgInfo.hooks.postuninstall
					);

					this.pass(null);
				} else {
					logger.log('Exec "postuninstall" hook "%s"', pkgInfo.hooks.postuninstall);

					// use options.dir as cwd, because package path is removed before
					processUtils.execScript(pkgInfo.hooks.postuninstall, {
						cwd: options.dir,
						dir: options.dir,
						log: options.log,
						env: options.env
					}, this.slot());
				}
			} else {
				this.pass(null);
			}
		},
		function() {
			logger.log('Package successfully uninstalled');
			this.pass(null);
		},
		callback
	);
};

exports.resolveName = function(options, callback) {
	Steppy(
		function() {
			checkOptions(options, ['target', 'dir']);

			exports.getList(_(options).pick('dir'), this.slot());
		},
		function(err, packageInfos) {
			var name;
			var packageInfo = _(packageInfos).findWhere({name: options.target});

			if (packageInfo) {
				name = packageInfo.name;
			} else if (packageIndexRegex.test(options.target)) {
				var packageIndex = Number(options.target);

				if (packageIndex >= packageInfos.length) {
					throw new Error('Package with index ' + packageIndex + ' is not found');
				}

				name = packageInfos[packageIndex].name;
			}

			if (!name) {
				throw new Error('Package "' + options.target + '" is not found');
			}

			this.pass(name);
		},
		callback
	);
};

exports.clean = function(options, callback) {
	var logger = createLogger(options);

	Steppy(
		function() {
			logger.log('Clean inactive packages');

			checkOptions(options, ['dir']);

			// get list of all packages
			exports.getList(_(options).pick('dir'), this.slot());
		},
		function(err, pkgInfos) {
			// filter not current packages
			pkgInfos = _(pkgInfos).filter(function(pkgInfo) {
				return !pkgInfo.current;
			});

			if (pkgInfos.length) {
				// uninstall packages one by one
				var funcs = pkgInfos.map(function(pkgInfo) {
					return function() {

						var uninstallOptions = _(options)
							.chain()
							.pick('dir', 'log')
							.extend({name: pkgInfo.name})
							.value();

						exports.uninstall(uninstallOptions, this.slot());
					};
				});
				funcs.push(this.slot());
				Steppy.apply(null, funcs);
			} else {
				logger.log('Nothing to clean, exit');
				return callback(null);
			}
		},
		function() {
			logger.log('Packages successfully cleaned');
			this.pass(null);
		},
		callback
	);
};
