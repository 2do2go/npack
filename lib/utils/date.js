'use strict';

var moment = require('moment');

exports.getTimestamp = function() {
	return moment().format('YYYY.MM.DD-HH.mm.ss');
};
