var test = require('tape');
var slogdb = require('../');
var level = require('level-test')();

function createDb() {
  return slogdb( level('testdb') );
}

// Get all values that are related to the given field. Return an array of
// objects.
test('Get values for a field', function (t) {
  t.plan(1);
  var db = createDb();
  t.equal(typeof db.getValues, 'function');
});

// fetchNode
// Get a node by id. Returns an object with all metadata.

// putNode
// Take an object and put it in the db with the right indexes.

// fetchNodes
// Get array of nodes from levelgraph query. Like
// [{ index: '', name: '' }]
