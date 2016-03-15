'use strict';

var Steppy = require('twostep').Steppy;
var fse = require('fs-extra');
var path = require('path');
var helpers = require('./helpers');
var npack = require('../lib/npack');

describe('.use()', function() {
	describe('should return an error', function() {
		it('if required option `name` is not set', function(done) {
			npack.use({}, function(err) {
				helpers.checkError(err, 'Option "name" is required');
				done();
			});
		});

		it('if required option `dir` is not set', function(done) {
			npack.use({name: 'a'}, function(err) {
				helpers.checkError(err, 'Option "dir" is required');
				done();
			});
		});

		it('if package is not installed', function(done) {
			npack.use({name: 'unknown', dir: helpers.tempDir}, function(err) {
				helpers.checkError(err, 'Package "unknown" is not found');
				done();
			});
		});
	});

	describe('switching between installed packages', function() {
		beforeEach(function(done) {
			fse.emptyDir(helpers.tempDir, done);
		});

		afterEach(function(done) {
			fse.remove(helpers.tempDir, done);
		});

		it('should be ok if package exists', function(done) {
			Steppy(
				function() {
					npack.install({
						src: path.join(helpers.fixturesDir, 'simple.tar.gz'),
						dir: helpers.tempDir
					}, this.slot());
				},
				function(err, pkgInfo) {
					npack.use({name: pkgInfo.name, dir: helpers.tempDir}, this.slot());
				},
				function(err, pkgInfo) {
					helpers.checkCurrentPkg(pkgInfo, this.slot());
				},
				done
			);
		});
	});

	describe('hooks', function() {
		beforeEach(function(done) {
			fse.emptyDir(helpers.tempDir, done);
		});

		afterEach(function(done) {
			fse.remove(helpers.tempDir, done);
		});

		it('should return an error if `preuse` hook fails', function(done) {
			Steppy(
				function() {
					npack.install({
						src: path.join(helpers.fixturesDir, 'preuse-fail.tar.gz'),
						dir: helpers.tempDir
					}, this.slot());
				},
				function(err, pkgInfo) {
					npack.use({name: pkgInfo.name, dir: helpers.tempDir}, this.slot());
				},
				function(err) {
					helpers.checkError(err, 'Command "exit 1" failed with exit code: 1');
					done();
				}
			);
		});

		it('should call `preuse` hook', function(done) {
			Steppy(
				function() {
					npack.install({
						src: path.join(helpers.fixturesDir, 'preuse-success.tar.gz'),
						dir: helpers.tempDir
					}, this.slot());
				},
				function(err, pkgInfo) {
					npack.use({name: pkgInfo.name, dir: helpers.tempDir}, this.slot());
				},
				function() {
					helpers.checkSuccessHookResult('preuse', this.slot());
				},
				done
			);
		});

		it('should return an error if `postuse` hook fails', function(done) {
			Steppy(
				function() {
					npack.install({
						src: path.join(helpers.fixturesDir, 'postuse-fail.tar.gz'),
						dir: helpers.tempDir
					}, this.slot());
				},
				function(err, pkgInfo) {
					npack.use({name: pkgInfo.name, dir: helpers.tempDir}, this.slot());
				},
				function(err) {
					helpers.checkError(err, 'Command "exit 1" failed with exit code: 1');
					done();
				}
			);
		});

		it('should call `postuse` hook', function(done) {
			Steppy(
				function() {
					npack.install({
						src: path.join(helpers.fixturesDir, 'postuse-success.tar.gz'),
						dir: helpers.tempDir
					}, this.slot());
				},
				function(err, pkgInfo) {
					npack.use({name: pkgInfo.name, dir: helpers.tempDir}, this.slot());
				},
				function() {
					helpers.checkSuccessHookResult('postuse', this.slot());
				},
				done
			);
		});
	});
});
