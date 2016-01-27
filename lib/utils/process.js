'use strict';

var childProcess = require('child_process');

exports.exec = childProcess.exec;

exports.spawn = function(cmd, args, options, callback) {
	return childProcess.spawn(cmd, args, options)
		.on('error', function(err) {
			err.file = cmd;
			callback(err);
		})
		.on('close', function (code) {
			var err;

			if (code === 127) {
				err = new Error('spawn ENOENT');
				err.code = 'ENOENT';
				err.errno = 'ENOENT';
				err.syscall = 'spawn';
				err.file = cmd;
			} else if (code) {
				err = new Error('"' + cmd + '" exits with non-zero code: ' + code);
			}

			callback(err);
		});
};
