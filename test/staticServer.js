'use strict';

var http = require('http');
var Steppy = require('twostep').Steppy;
var nodeStatic = require('node-static');

exports.server = null;
exports.baseUrl = null;

exports.start = function(dir, callback) {
	Steppy(
		function() {
			var fileServer = new nodeStatic.Server(dir);

			exports.server = http.createServer(function(req, res) {
				req.addListener('end', function() {
					fileServer.serve(req, res);
				}).resume();
			}).listen(0, '127.0.0.1', this.slot());
		},
		function() {
			var port = exports.server.address().port;

			exports.baseUrl = 'http://127.0.0.1:' + port + '/';

			this.pass(exports.server);
		},
		callback
	);

};

exports.stop = function(callback) {
	Steppy(
		function() {
			if (exports.server) {
				exports.server.close(this.slot());
			} else {
				this.pass(null);
			}
		},
		function() {
			exports.server = null;
			exports.baseUrl = null;
			this.pass(null);
		},
		callback
	);
};
