'use strict';

var fse = require('fs-extra'),
	multipipe = require('multipipe'),
	zlib = require('zlib'),
	tar = require('tar');

exports.extract = function(src, dest, callback) {
	var srcStream = fse.createReadStream(src);
	var gunzipStream = zlib.createGunzip();
	var tarStream = tar.Extract({path: dest});

	tarStream.on('end', callback);

	multipipe(srcStream, gunzipStream, tarStream, function(err) {
		if (err) callback(err);
	});
};
