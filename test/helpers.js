'use strict';

var expect = require('expect.js');
var fse = require('fs-extra');
var Steppy = require('twostep').Steppy;
var path = require('path');

exports.fixturesDir = path.join(__dirname, 'fixtures');
exports.tempDir = path.join(__dirname, 'temp');

exports.exists = function(filePath, callback) {
	fse.exists(filePath, function(fileExists) {
		callback(null, fileExists);
	});
};

exports.checkError = function(err, message) {
	expect(err).to.be.ok();
	expect(err).to.be.an(Error);
	expect(err.message).to.be(message);
};

exports.checkSuccessHookResult = function(hook, callback) {
	Steppy(
		function() {
			fse.readFile(path.join(exports.tempDir, hook + '-hook'), {
				encoding: 'utf8'
			}, this.slot());
		},
		function(err, fileContent) {
			expect(fileContent).to.be(hook + '-success');

			this.pass(null);
		},
		callback
	);
};

exports.checkDisabledHookResult = function(hook, callback) {
	Steppy(
		function() {
			var stepCallback = this.slot();
			fse.exists(
				path.join(exports.tempDir, hook + '-hook'),
				function(fileExists) {
					stepCallback(null, fileExists);
				}
			);
		},
		function(err, fileExists) {
			expect(fileExists).to.be(false);

			this.pass(null);
		},
		callback
	);
};

exports.checkPkgExists = function(pkgInfo, expected, callback) {
	Steppy(
		function() {
			expect(pkgInfo).to.be.an('object');
			expect(pkgInfo.path).to.be.ok();

			exports.exists(pkgInfo.path, this.slot());
		},
		function(err, pkgExists) {
			expect(pkgExists).to.be(expected);

			this.pass(null);
		},
		callback
	);
};

exports.checkCurrentPkg = function(pkgInfo, callback) {
	var linkPath = path.join(exports.tempDir, 'package');

	Steppy(
		function() {
			expect(pkgInfo.current).to.be(true);

			exports.checkPkgExists(pkgInfo, true, this.slot());
		},
		function() {
			exports.exists(linkPath, this.slot());
		},
		function(err, linkExists) {
			expect(linkExists).to.be(true);

			fse.readlink(linkPath, this.slot());
		},
		function(err, pkgPath) {
			expect(pkgInfo.path).to.be(pkgPath);

			this.pass(null);
		},
		callback
	);
};
