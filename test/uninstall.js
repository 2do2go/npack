'use strict';

var Steppy = require('twostep').Steppy;
var fse = require('fs-extra');
var path = require('path');
var helpers = require('./helpers');
var npack = require('../lib/npack');
var expect = require('expect.js');

describe('.uninstall()', function() {
	describe('should return an error', function() {
		it('if required option `name` is not set', function(done) {
			npack.uninstall({}, function(err) {
				helpers.checkError(err, 'Option "name" is required');
				done();
			});
		});

		it('if required option `dir` is not set', function(done) {
			npack.uninstall({name: 'a'}, function(err) {
				helpers.checkError(err, 'Option "dir" is required');
				done();
			});
		});

		it('if package is not installed', function(done) {
			npack.uninstall({name: 'unknown', dir: helpers.tempDir}, function(err) {
				helpers.checkError(err, 'Package "unknown" is not found');
				done();
			});
		});
	});

	describe('package uninstalling', function() {
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
					this.pass(pkgInfo);

					// remove current package link
					fse.remove(path.join(helpers.tempDir, 'package'), this.slot());
				},
				function(err, pkgInfo) {
					this.pass(pkgInfo);

					npack.uninstall({name: pkgInfo.name, dir: helpers.tempDir}, this.slot());
				},
				function(err, pkgInfo) {
					helpers.checkPkgExists(pkgInfo, false, this.slot());
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

		it('should return an error if `preuninstall` hook fails', function(done) {
			Steppy(
				function() {
					npack.install({
						src: path.join(helpers.fixturesDir, 'preuninstall-fail.tar.gz'),
						dir: helpers.tempDir
					}, this.slot());
				},
				function(err, pkgInfo) {
					npack.uninstall({name: pkgInfo.name, dir: helpers.tempDir}, this.slot());
				},
				function(err) {
					helpers.checkError(err, 'Command "exit 1" failed with exit code: 1');
					done();
				}
			);
		});

		it('should call `preuninstall` hook', function(done) {
			Steppy(
				function() {
					npack.install({
						src: path.join(helpers.fixturesDir, 'preuninstall-success.tar.gz'),
						dir: helpers.tempDir
					}, this.slot());
				},
				function(err, pkgInfo) {
					npack.uninstall({name: pkgInfo.name, dir: helpers.tempDir}, this.slot());
				},
				function() {
					helpers.checkSuccessHookResult('preuninstall', this.slot());
				},
				done
			);
		});

		it('should skip `preuninstall` hook if it`s disabled', function(done) {
			Steppy(
				function() {
					npack.install({
						src: path.join(helpers.fixturesDir, 'preuninstall-success.tar.gz'),
						dir: helpers.tempDir
					}, this.slot());
				},
				function(err, pkgInfo) {
					npack.uninstall({
						name: pkgInfo.name,
						dir: helpers.tempDir,
						disabledHooks: ['preuninstall']
					}, this.slot());
				},
				function() {
					helpers.checkDisabledHookResult('preuninstall', this.slot());
				},
				done
			);
		});

		it('should return an error if `postuninstall` hook fails', function(done) {
			Steppy(
				function() {
					npack.install({
						src: path.join(helpers.fixturesDir, 'postuninstall-fail.tar.gz'),
						dir: helpers.tempDir
					}, this.slot());
				},
				function(err, pkgInfo) {
					npack.uninstall({name: pkgInfo.name, dir: helpers.tempDir}, this.slot());
				},
				function(err) {
					helpers.checkError(err, 'Command "exit 1" failed with exit code: 1');
					done();
				}
			);
		});

		it('should call `postuninstall` hook', function(done) {
			Steppy(
				function() {
					npack.install({
						src: path.join(helpers.fixturesDir, 'postuninstall-success.tar.gz'),
						dir: helpers.tempDir
					}, this.slot());
				},
				function(err, pkgInfo) {
					npack.uninstall({name: pkgInfo.name, dir: helpers.tempDir}, this.slot());
				},
				function() {
					helpers.checkSuccessHookResult('postuninstall', this.slot());
				},
				done
			);
		});

		it('should skip `postuninstall` hook if it`s disabled', function(done) {
			Steppy(
				function() {
					npack.install({
						src: path.join(helpers.fixturesDir, 'postuninstall-success.tar.gz'),
						dir: helpers.tempDir
					}, this.slot());
				},
				function(err, pkgInfo) {
					npack.uninstall({
						name: pkgInfo.name,
						dir: helpers.tempDir,
						disabledHooks: ['postuninstall']
					}, this.slot());
				},
				function() {
					helpers.checkDisabledHookResult('postuninstall', this.slot());
				},
				done
			);
		});
	});

	describe('with package compatibility', function() {
		beforeEach(function(done) {
			fse.emptyDir(helpers.tempDir, done);
		});

		afterEach(function(done) {
			fse.remove(helpers.tempDir, done);
		});

		it('should fail when package version is not satisfied', function(done) {
			var originalVersion = npack.version,
				installed;
			Steppy(
				function() {
					// set compatible version
					npack.version = '1.0.0';

					npack.install({
						src: path.join(helpers.fixturesDir, 'compatibility.tar.gz'),
						dir: helpers.tempDir
					}, this.slot());
				},
				function(err, pkgInfo) {
					this.pass(pkgInfo);

					helpers.checkPkgExists(pkgInfo, true, this.slot());
				},
				function(err, pkgInfo) {
					installed = true;

					// set incompatible version
					npack.version = '2.0.0';

					npack.uninstall({
						name: pkgInfo.name,
						dir: helpers.tempDir
					}, this.slot());
				},
				function(err) {
					// restore original version
					npack.version = originalVersion;

					expect(installed).equal(true);

					helpers.checkError(
						err,
						'Current npack version "2.0.0" doesn\'t satisfy ' +
						'version required by package: "1.x.x"'
					);
					done();
				}
			);
		});

		it('should be ok when package version is satisfied', function(done) {
			var originalVersion = npack.version;
			Steppy(
				function() {
					// set compatible version
					npack.version = '1.0.0';

					npack.install({
						src: path.join(helpers.fixturesDir, 'compatibility.tar.gz'),
						dir: helpers.tempDir
					}, this.slot());
				},
				function(err, pkgInfo) {
					this.pass(pkgInfo);

					npack.uninstall({
						name: pkgInfo.name,
						dir: helpers.tempDir
					}, this.slot());
				},
				function(err, pkgInfo) {
					helpers.checkPkgExists(pkgInfo, false, this.slot());
				},
				function(err) {
					// restore original version
					npack.version = originalVersion;

					done(err);
				}
			);
		});
	});
});
