'use strict';

var http = require('http'),
	https = require('https'),
	url = require('url'),
	fse = require('fs-extra'),
	multipipe = require('multipipe'),
	_ = require('underscore');

exports.download = function(urlStr, dest, options, callback) {
	if (_.isFunction(options)) {
		callback = options;
		options = {};
	}

	var urlParams = url.parse(urlStr);

	var request = urlParams.protocol === 'https:' ? https : http;

	var requestOptions = {
		hostname: urlParams.hostname,
		path: urlParams.path
	};
	if (urlParams.port) requestOptions.port = urlParams.port;
	if (options.auth) requestOptions.auth = options.auth;

	var fileStream = fse.createWriteStream(dest);

	var onError = function(err) {
		fse.remove(dest);
		callback(err);
	};

	request.get(requestOptions)
		.on('response', function(res) {
			if (res.statusCode !== 200) {
				throw new Error(
					'Non-200 response status: ' + res.statusCode + ' ' +
					'while downloading "' + urlStr + '"'
				);
			}

			multipipe(res, fileStream, function(err) {
				if (err) onError(err);
				else fileStream.close(callback);
			});
		})
		.on('error', onError);
};
