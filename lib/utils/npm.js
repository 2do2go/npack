'use strict';

var processUtils = require('./process'),
	Steppy = require('twostep').Steppy,
	path = require('path'),
	url = require('url'),
	fs = require('fs');

exports.install = function(options, callback) {
	processUtils.exec('npm install --production', options, callback);
};

exports.prune = function(options, callback) {
	processUtils.exec('npm prune', options, callback);
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

exports.download = function(targetPackage, dest, options, callback) {
	Steppy(
		function() {
			if (/^https?:/.test(targetPackage) && options.auth) {
				var parsedUrl = url.parse(targetPackage);
				parsedUrl.auth = options.auth;

				targetPackage = url.format(parsedUrl);
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
			var tarballName = packOutData.replace(/\n$/, '');

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
