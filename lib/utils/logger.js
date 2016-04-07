'use strict';

var _ = require('underscore'),
	colors = require('colors/safe');

var prefix = colors.cyan('<npack>');

var addPreffix = function(args) {
	args = _(args).clone();

	if (args.length && _.isString(args[0])) {
		args[0] = prefix + ' ' + args[0];
	} else {
		args.unshift(prefix);
	}

	return args;
};

exports.log = function() {
	console.log.apply(console, addPreffix(_.toArray(arguments)));
};

exports.done = function(msg) {
	exports.log.apply(null, [colors.green(msg)].concat(_(arguments).rest()));
};

exports.error = function() {
	console.error.apply(console, addPreffix(_.toArray(arguments)));
};

exports.warn = function(msg) {
	exports.log.apply(null, [colors.yellow(msg)].concat(_(arguments).rest()));
};

exports.createErrorLogger = function(options) {
	return function(err) {
		if (err) {
			exports.error(
				colors.red(options.trace ? err.stack : ('Error: ' + err.message))
			);
		}
	};
};

exports.writePkgInfo = function(pkgInfo, options) {
	options = _({}).defaults(options, {
		markCurrent: false,
		spaces: 2
	});

	var spacesStr = (new Array(options.spaces + 1)).join(' ');

	if (options.markCurrent && pkgInfo.current) {
		console.log(
			colors.green('%sname:        %s [*current]'),
			spacesStr,
			pkgInfo.name
		);
	} else {
		console.log('%sname:        %s', spacesStr, pkgInfo.name);
	}

	console.log('%spath:        %s', spacesStr, pkgInfo.path);

	if (pkgInfo.npm) {
		console.log('%snpm name:    %s', spacesStr, pkgInfo.npm.name);
		console.log('%snpm version: %s', spacesStr, pkgInfo.npm.version);
	}

	if (!_(pkgInfo.hooks).isEmpty()) {
		console.log('%shooks:', spacesStr);

		_(pkgInfo.hooks).each(function(action, hook) {
			console.log('%s  %s: %s', spacesStr, hook, action);
		});
	}

	if (!_(pkgInfo.scripts).isEmpty()) {
		console.log('%sscripts: %s', spacesStr, _(pkgInfo.scripts).keys().join(', '));
	}
};

exports.writePkgsList = function(pkgInfos, options) {
	options = _({}).defaults(options, {
		info: false,
		spaces: 2
	});

	var spacesStr = (new Array(options.spaces + 1)).join(' ');

	_(pkgInfos).each(function(pkgInfo, index) {
		if (options.info && index ) console.log('');

		var str = spacesStr + pkgInfo.name;

		if (pkgInfo.npm) {
			str += ' (' + pkgInfo.npm.name + ' ' + pkgInfo.npm.version + ')';
		}

		if (pkgInfo.current) {
			str += ' [*current]';

			str = colors.green(str);
		}

		console.log(str);

		if (options.info) {
			exports.writePkgInfo(pkgInfo, {spaces: options.spaces + 2});
		}
	});
};

exports.writeScriptsList = function(scripts) {
	_(scripts).each(function(script, name) {
		console.log('  %s', name);
		console.log('    %s', script || '-');
	});
};
