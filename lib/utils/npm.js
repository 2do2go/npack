'use strict';

var exec = require('child_process').exec,
	Steppy = require('twostep').Steppy;

var install = exports.install = function(options, callback) {
	exec('npm install --production', {
		cwd: options.dir,
		stdio: options.log ? 'inherit' : 'pipe'
	}, callback);
};

var prune = exports.prune = function(options, callback) {
	exec('npm prune', {
		cwd: options.dir,
		stdio: options.log ? 'inherit' : 'pipe'
	}, callback);
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
