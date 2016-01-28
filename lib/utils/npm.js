'use strict';

var exec = require('child_process').exec,
	Steppy = require('twostep').Steppy;

var install = exports.install = function(dir, callback) {
	exec('npm install --production', {cwd: dir}, callback);
};

var prune = exports.prune = function(dir, callback) {
	exec('npm prune', {cwd: dir}, callback);
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
