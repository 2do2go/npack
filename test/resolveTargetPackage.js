'use strict';

var Steppy = require('twostep').Steppy;
var fse = require('fs-extra');
var path = require('path');
var helpers = require('./helpers');
var npack = require('../lib/npack');
var expect = require('expect.js');

describe('.resolveTargetPackage()', function() {
	describe('should return an error', function() {
		it('if required option `target` is not set', function(done) {
			npack.resolveTargetPackage({dir: '.'}, function(err) {
				helpers.checkError(err, 'Option "target" is required');
				done();
			});
		});

		it('if required option `dir` is not set', function(done) {
			npack.resolveTargetPackage({target: 'a'}, function(err) {
				helpers.checkError(err, 'Option "dir" is required');
				done();
			});
		});
	});

	describe('resolving given target to package name', function() {
		beforeEach(function(done) {
			fse.emptyDir(helpers.tempDir, done);
		});

		after(function(done) {
			fse.remove(helpers.tempDir, done);
		});

		it('should be ok with package name', function(done) {
			Steppy(
				function() {
					npack.install({
						src: path.join(helpers.fixturesDir, 'simple.tar.gz'),
						dir: helpers.tempDir
					}, this.slot());
				},
				function(err, pkgInfo) {
					this.pass(pkgInfo);

					npack.resolveTargetPackage({
						target: pkgInfo.name,
						dir: helpers.tempDir
					}, this.slot());
				},
				function(err, pkgInfo, name) {
					expect(name).equal(pkgInfo.name);
					done();
				}
			);
		});

		it('should be ok with package index', function(done) {
			Steppy(
				function() {
					npack.install({
						src: path.join(helpers.fixturesDir, 'simple.tar.gz'),
						dir: helpers.tempDir
					}, this.slot());
				},
				function(err, pkgInfo) {
					this.pass(pkgInfo);

					npack.resolveTargetPackage({
						target: '0',
						dir: helpers.tempDir
					}, this.slot());
				},
				function(err, pkgInfo, name) {
					expect(name).equal(pkgInfo.name);
					done();
				}
			);
		});

		it('should fail with index out of list bound', function(done) {
			Steppy(
				function() {
					npack.install({
						src: path.join(helpers.fixturesDir, 'simple.tar.gz'),
						dir: helpers.tempDir
					}, this.slot());
				},
				function() {
					npack.resolveTargetPackage({
						target: '1',
						dir: helpers.tempDir
					}, this.slot());
				},
				function(err) {
					helpers.checkError(
						err, 'Package with index 1 is not found'
					);
					done();
				}
			);
		});

		it('should fail if package not installed', function(done) {
			Steppy(
				function() {
					npack.resolveTargetPackage({
						target: 'unknown',
						dir: helpers.tempDir
					}, this.slot());
				},
				function(err) {
					helpers.checkError(
						err, 'Package "unknown" is not found'
					);
					done();
				}
			);
		});
	});
});
