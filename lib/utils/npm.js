'use strict';

var processUtils = require('./process'),
	Steppy = require('twostep').Steppy,
	path = require('path'),
	url = require('url'),
	fs = require('fs'),
	npmPackageArg = require('npm-package-arg');

exports.install = function(options, callback) {
	processUtils.exec('npm install --production', options, callback);
};

exports.prune = function(options, callback) {
	processUtils.exec('npm prune --production', options, callback);
};

exports.sync = function(options, callback) {
	Steppy(
		function() {
			exports.prune(options, this.slot());
		},
		function() {
			exports.install(options, this.slot());
		},
		callback
	);
};

exports.ci = function(options, callback) {
	processUtils.exec('npm ci --only=prod', options, callback);
};

exports.download = function(targetPackage, dest, options, callback) {
	Steppy(
		function() {
			var targetPackageInfo = npmPackageArg(targetPackage);

			if (targetPackageInfo.type === 'remote' && options.auth) {
				var parsedUrl = url.parse(targetPackage);
				parsedUrl.auth = options.auth;

				targetPackage = url.format(parsedUrl);
			} else if (
				targetPackageInfo.type === 'file' || targetPackageInfo.type === 'directory'
			) {
				targetPackage = path.resolve(process.cwd(), targetPackage);
			}

			var dir = path.dirname(dest);

			this.pass(dir);

			var packSlot = this.slot();
			var packOutData = '';
			var packErrData = '';

			var packSpawn = processUtils.exec(
				'npm pack ' + targetPackage,
				{cwd: dir},
				function(err) {
					if (err && packErrData) {
						err.message += '\nstderr: ' + packErrData;
					}

					packSlot(err, packOutData);
				}
			);

			packSpawn.stdout.on('data', function(data) {
				packOutData += data;
			});

			packSpawn.stderr.on('data', function(data) {
				packErrData += data;
			});
		},
		function(err, dir, packOutData) {
			var tarballName = packOutData.trim();

			fs.rename(
				path.join(dir, tarballName),
				dest,
				this.slot()
			);
		},
		function() {
			this.pass(null);
		},
		callback
	);
};
