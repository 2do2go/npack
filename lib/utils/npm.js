'use strict';

var processUtils = require('./process'),
	Steppy = require('twostep').Steppy;

var install = exports.install = function(options, callback) {
	processUtils.exec('npm install --production', options, callback);
};

var prune = exports.prune = function(options, callback) {
	processUtils.exec('npm prune', options, callback);
};

exports.sync = function(options, callback) {
	Steppy(
		function() {
			install(options, this.slot());
		},
		function() {
			prune(options, this.slot());
		},
		callback
	);
};
