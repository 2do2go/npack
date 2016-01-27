'use strict';

var processUtils = require('./process'),
	Steppy = require('twostep').Steppy;

var install = exports.install = function(dir, callback) {
	processUtils.exec('npm install --production', {cwd: dir}, callback);
};

var prune = exports.prune = function(dir, callback) {
	processUtils.exec('npm prune', {cwd: dir}, callback);
};

exports.sync = function(dir, callback) {
	Steppy(
		function() {
			install(dir, this.slot());
		},
		function() {
			prune(dir, this.slot());
		},
		callback
	);
};
