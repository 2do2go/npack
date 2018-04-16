'use strict';

var spawn = require('child_process').spawn,
	_ = require('underscore'),
	path = require('path');

var isWin = process.platform === 'win32';

exports.exec = function(cmd, options, callback) {
	callback = _(callback).once();

	var spawnOptions = _(options).clone();

	if (options.log) spawnOptions.stdio = 'inherit';

	var shell, args;

	if (isWin) {
		shell = process.env.comspec || 'cmd';
		args = ['/s', '/c', '"' + cmd + '"'];
		spawnOptions.windowsVerbatimArguments = true;
	} else {
		shell = process.env.SHELL || '/bin/sh';
		args = ['-c', cmd];
	}

	return spawn(shell, args, spawnOptions)
		.on('close', function(code) {
			var err;

			if (code) {
				err = new Error(
					'Command "' + cmd + '" failed with exit code: ' + code
				);
			}

			callback(err);
		})
		.on('error', function(err) {
			callback(err);
		});
};

var findEnvVarName = function(env, names) {
	return _(names).find(function(name) {
		return _(env).has(name);
	});
};

exports.execScript = function(script, options, callback) {
	var nodeModulesBinPath = path.join(options.cwd, 'node_modules', '.bin');

	var env = _(options.env || {}).defaults(process.env);

	_(env).extend({
		NPACK_DIR: options.dir,
		NPACK_PKG_PATH: options.cwd
	});

	var pathVarName = findEnvVarName(process.env, ['PATH', 'Path', 'path']);
	env[pathVarName] += path.delimiter + nodeModulesBinPath;

	exports.exec(script, {
		cwd: options.cwd,
		env: env,
		log: options.log
	}, callback);
};
