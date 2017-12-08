'use strict';

var processUtils = require('./process'),
	Steppy = require('twostep').Steppy,
	path = require('path'),
	url = require('url'),
	fse = require('fs-extra'),
	pacote = require('pacote');

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

			var stepCallback = this.slot();
			pacote.tarball
				.toFile(
					targetPackage,
					dest
				)
				.then(
					function() {
						stepCallback(null);
					},
					stepCallback
				);
		},
		// function(err, dir, packOutData) {
		// 	var tarballName = packOutData.trim();

		// 	fse.move(
		// 		path.join(process.cwd(), tarballName),
		// 		dest,
		// 		this.slot()
		// 	);
		// },
		function() {
			this.pass(null);
		},
		callback
	);
};
