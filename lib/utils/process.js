'use strict';

var exec = require('child_process').exec;

exports.exec = function(cmd, options, callback) {
	if (options.log) options.stdio = 'inherit';
	exec(cmd, options, callback);
};
