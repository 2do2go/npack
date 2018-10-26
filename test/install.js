'use strict';

var Steppy = require('twostep').Steppy;
var fse = require('fs-extra');
var path = require('path');
var helpers = require('./helpers');
var staticServer = require('./staticServer');
var npack = require('../lib/npack');
var expect = require('expect.js');
var semver = require('semver');

describe('.install()', function() {
	describe('should return an error', function() {
		it('if required option `src` is not set', function(done) {
			npack.install({}, function(err) {
				helpers.checkError(err, 'Option "src" is required');
				done();
			});
		});

		it('if required option `dir` is not set', function(done) {
			npack.install({src: 'a'}, function(err) {
				helpers.checkError(err, 'Option "dir" is required');
				done();
			});
		});

		it('if source does not exist', function(done) {
			var src = path.join(helpers.fixturesDir, 'unknown.tar.gz');
			npack.install({src: src, dir: helpers.tempDir}, function(err) {
				expect(err).ok();
				expect(err.message).contain('ENOENT');
				done();
			});
		});
	});

	describe('package installation', function() {
		before(function(done) {
			staticServer.start(helpers.fixturesDir, done);
		});

		after(function(done) {
			staticServer.stop(done);
		});

		beforeEach(function(done) {
			fse.emptyDir(helpers.tempDir, done);
		});

		afterEach(function(done) {
			fse.remove(helpers.tempDir, done);
		});

		it('should be ok with local tar.gz source', function(done) {
			Steppy(
				function() {
					npack.install({
						src: path.join(helpers.fixturesDir, 'simple.tar.gz'),
						dir: helpers.tempDir
					}, this.slot());
				},
				function(err, pkgInfo) {
					helpers.checkPkgExists(pkgInfo, true, this.slot());
				},
				done
			);
		});

		it('should be ok with local folder source', function(done) {
			Steppy(
				function() {
					npack.install({
						src: path.join(helpers.fixturesDir, 'simple'),
						dir: helpers.tempDir
					}, this.slot());
				},
				function(err, pkgInfo) {
					helpers.checkPkgExists(pkgInfo, true, this.slot());
				},
				done
			);
		});

		it('should be ok with local tar.gz symlink source', function(done) {
			Steppy(
				function() {
					npack.install({
						src: path.join(helpers.fixturesDir, 'simple-symlink.tar.gz'),
						dir: helpers.tempDir
					}, this.slot());
				},
				function(err, pkgInfo) {
					helpers.checkPkgExists(pkgInfo, true, this.slot());
				},
				done
			);
		});

		it('should be ok with local folder symlink source', function(done) {
			Steppy(
				function() {
					npack.install({
						src: path.join(helpers.fixturesDir, 'simple-symlink'),
						dir: helpers.tempDir
					}, this.slot());
				},
				function(err, pkgInfo) {
					helpers.checkPkgExists(pkgInfo, true, this.slot());
				},
				done
			);
		});

		it('should be ok with remote tar.gz source', function(done) {
			Steppy(
				function() {
					npack.install({
						src: staticServer.baseUrl + 'simple.tar.gz',
						dir: helpers.tempDir
					}, this.slot());
				},
				function(err, pkgInfo) {
					helpers.checkPkgExists(pkgInfo, true, this.slot());
				},
				done
			);
		});

		it(
			'should fail if package with such name/version is already installed',
			function(done) {
				Steppy(
					function() {
						npack.install({
							src: path.join(helpers.fixturesDir, 'simple.tar.gz'),
							dir: helpers.tempDir
						}, this.slot());
					},
					function() {
						npack.install({
							src: path.join(helpers.fixturesDir, 'simple.tar.gz'),
							dir: helpers.tempDir
						}, this.slot());
					},
					function(err) {
						helpers.checkError(
							err,
							'Package with npm name "test" and version "1.0.0" already installed'
						);
						done();
					}
				);
			}
		);

		it(
			'should repeatedly install existing package with `force` option',
			function(done) {
				Steppy(
					function() {
						npack.install({
							src: path.join(helpers.fixturesDir, 'simple.tar.gz'),
							dir: helpers.tempDir
						}, this.slot());
					},
					function(err, pkgInfo) {
						helpers.checkPkgExists(pkgInfo, true, this.slot());
					},
					function() {
						npack.install({
							src: path.join(helpers.fixturesDir, 'simple.tar.gz'),
							dir: helpers.tempDir,
							force: true
						}, this.slot());
					},
					function(err, pkgInfo) {
						helpers.checkPkgExists(pkgInfo, true, this.slot());
					},
					done
				);
			}
		);

		it('should fail with invalid syncMode option', function(done) {
			Steppy(
				function() {
					npack.install({
						src: path.join(helpers.fixturesDir, 'simple.tar.gz'),
						dir: helpers.tempDir,
						syncMode: 'invalidSyncMode'
					}, this.slot());
				},
				function(err) {
					helpers.checkError(
						err,
						'Expect sync mode "invalidSyncMode" to be ' +
						'one of "install", "ci"'
					);

					done();
				}
			);
		});
	});

	// run this tests only in node with npm version containing `ci` command
	var describeSyncByCi = semver.gte(process.versions.node, '8.12.0') ?
		describe : describe.skip;
	describeSyncByCi('with ci sync mode', function() {
		beforeEach(function(done) {
			fse.emptyDir(helpers.tempDir, done);
		});

		afterEach(function(done) {
			fse.remove(helpers.tempDir, done);
		});

		it('should be ok with shrinkwrap in package', function(done) {
			Steppy(
				function() {
					npack.install({
						src: path.join(helpers.fixturesDir, 'shrinkwrap.tar.gz'),
						dir: helpers.tempDir,
						syncMode: 'ci'
					}, this.slot());
				},
				function(err, pkgInfo) {
					helpers.checkPkgExists(pkgInfo, true, this.slot());
				},
				done
			);
		});

		it('should fail without shrinkwrap in package', function(done) {
			Steppy(
				function() {
					npack.install({
						src: path.join(helpers.fixturesDir, 'simple.tar.gz'),
						dir: helpers.tempDir,
						syncMode: 'ci'
					}, this.slot());
				},
				function(err) {
					helpers.checkError(
						err,
						'npm-shrinkwrap.json file is not found'
					);

					done();
				}
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

		it('should return error if `preinstall` hook fails', function(done) {
			npack.install({
				src: path.join(helpers.fixturesDir, 'preinstall-fail.tar.gz'),
				dir: helpers.tempDir
			}, function(err) {
				helpers.checkError(err, 'Command "exit 1" failed with exit code: 1');
				done();
			});
		});

		it('should call `preinstall` hook', function(done) {
			Steppy(
				function() {
					npack.install({
						src: path.join(helpers.fixturesDir, 'preinstall-success.tar.gz'),
						dir: helpers.tempDir
					}, this.slot());
				},
				function() {
					helpers.checkSuccessHookResult('preinstall', this.slot());
				},
				done
			);
		});

		it('should skip `preinstall` hook if it`s disabled', function(done) {
			Steppy(
				function() {
					npack.install({
						src: path.join(helpers.fixturesDir, 'preinstall-success.tar.gz'),
						dir: helpers.tempDir,
						disabledHooks: ['preinstall']
					}, this.slot());
				},
				function() {
					helpers.checkDisabledHookResult('preinstall', this.slot());
				},
				done
			);
		});

		it('should return error if `postinstall` hook fails', function(done) {
			npack.install({
				src: path.join(helpers.fixturesDir, 'postinstall-fail.tar.gz'),
				dir: helpers.tempDir
			}, function(err) {
				helpers.checkError(err, 'Command "exit 1" failed with exit code: 1');
				done();
			});
		});

		it('should call `postinstall` hook', function(done) {
			Steppy(
				function() {
					npack.install({
						src: path.join(helpers.fixturesDir, 'postinstall-success.tar.gz'),
						dir: helpers.tempDir
					}, this.slot());
				},
				function() {
					helpers.checkSuccessHookResult('postinstall', this.slot());
				},
				done
			);
		});

		it('should skip `postinstall` hook if it`s disabled', function(done) {
			Steppy(
				function() {
					npack.install({
						src: path.join(helpers.fixturesDir, 'postinstall-success.tar.gz'),
						dir: helpers.tempDir,
						disabledHooks: ['postinstall']
					}, this.slot());
				},
				function() {
					helpers.checkDisabledHookResult('postinstall', this.slot());
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
			var originalVersion = npack.version;
			Steppy(
				function() {
					// set incompatible version
					npack.version = '2.0.0';

					npack.install({
						src: path.join(helpers.fixturesDir, 'compatibility.tar.gz'),
						dir: helpers.tempDir
					}, this.slot());
				},
				function(err) {
					// restore original version
					npack.version = originalVersion;

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
					helpers.checkPkgExists(pkgInfo, true, this.slot());
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
