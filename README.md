# npack

[![Build Status](https://travis-ci.org/2do2go/npack.svg?branch=master)](https://travis-ci.org/2do2go/npack)

npack - node.js packages manipulation tool. It provides few methods to install new package, fast switch between package versions, clean installed package.

## Installation

```bash
$ npm install -g npack
```

alternatively you could install it locally

## Usage

You should create npm tarball package first with a command `npm pack`.

### Install package

Go to some directory and run:

```bash
$ npack install <path_to_npm_tarball_package>
```

Package will be installed and will be set as current.

### Switch package

You can switch between installed packages with command:

```bash
$ npack use <package_name>
```

### Show list and package info

In directory where you previously installed package run:

```bash
$ npack list
```

To show detailed info about package run:

```bash
$ npack info <package_name>
```

### Uninstall package

To uninstall installed package run:

```bash
$ npack uninstall <package_name>
```

## License

[MIT](./LICENSE)
