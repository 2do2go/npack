'use strict';

var spawn = require('child_process').spawn,
	_ = require('underscore'),
	path = require('path');

var isWin = process.platform === 'win32';

exports.exec = function(cmd, options, callback) {
	var spawnOptions = _(options).clone();

	if (options.log) spawnOptions.stdio = 'inherit';

	var shell, args;

	if (isWin) {
		shell = process.env.comspec || 'cmd.exe';
		args = ['/s', '/c', '"' + cmd + '"'];
		spawnOptions.windowsVerbatimArguments = true;
	} else {
		shell = process.env.SHELL || '/bin/sh';
		args = ['-c', cmd];
	}

	spawn(shell, args, spawnOptions).on('exit', function(code) {
		var err;

		if (code) {
			err = new Error('Command "' + cmd + '" failed with exit code: ' + code);
		}

		callback(err);
	});
};

exports.execScript = function(script, options, callback) {
	var nodeModulesBinPath = path.join(options.cwd, 'node_modules', '.bin');

	var env = _({}).extend(process.env, {
		PATH: process.env.PATH + path.delimiter + nodeModulesBinPath,
		NPACK_DIR: options.dir,
		NPACK_PKG_PATH: options.cwd
	});

	exports.exec(script, {
		cwd: options.cwd,
		env: env,
		log: options.log
	}, callback);
};
