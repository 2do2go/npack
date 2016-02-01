'use strict';

var processUtils = require('./process'),
	Steppy = require('twostep').Steppy;

exports.install = function(options, callback) {
	processUtils.exec('npm install --production', options, callback);
};

exports.prune = function(options, callback) {
	processUtils.exec('npm prune', options, callback);
};

exports.sync = function(options, callback) {
	Steppy(
		function() {
			exports.install(options, this.slot());
		},
		function() {
			exports.prune(options, this.slot());
		},
		callback
	);
};
