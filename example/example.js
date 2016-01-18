var slogdb = require('../');
var level = require('level-test')();

var db = slogdb(level('example'));


db.getValues('example', console.log.bind(console));
