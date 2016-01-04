var after = require('after');
var levelgraph = require('levelgraph');

module.exports = adapter;

function adapter(db) {

  db.sublevel('graph', { valueEncoding: 'utf8' });
  var graph = levelgraph(db.sublevels.graph);

  var slogDb = {
    getValues: getValues,
    fetchNode: fetchNode,
    putNode: putNode,
    fetchNodes: fetchNodes
  };

  return slogDb;

  function fetchNodes(query, cb) {
    graph.get(query, function(err, res) {
      var nodes = [];
      var next = after(res.length, cb);
      res.forEach(function(r) {
        db.get(r.subject, function(err, node) {
          nodes.push({ index: r.subject, name: node.name });
          next(null, nodes);
        });
      });
    });
  }

  function getValues(index, cb) {
    graph.get({ predicate: index }, function(err, res) {
      var valIndexes = res.reduce(function(acc, t) {
        acc[t.object] = true;
        return acc;
      }, {});

      var values = [];
      var next = after(Object.keys(valIndexes).length, function(err, res) {
        cb(err, values);
      });
      Object.keys(valIndexes).forEach(function(i) {
        db.get(i, function(err, res) {
          if (err) return next(err);
          res.index = i;
          values.push(res);
          next(null, values);
        });
      });
    });
  }

  function fetchNode(id, cb) {
    var node = { index: id };
    var next = after(2, function(err, node) {
      cb(err, node);
    });
    db.get(id, function(err, res) {
      if (err) return next(err);
      node.name = res.name;
      next(null, node);
    });
    graph.get({subject: id}, function(err, triples) {
      var n = after(triples.length, function(err, res) {
        next(err, node);
      });
      triples.forEach(function(t) {
        var fs = {};
        var nextInTriple = after(2, function(err, res) {
          node[res.field] = res.value;
          n(null, node);
        });
        db.get(t.predicate, function(err, res) {
          fs.field = res.name;
          nextInTriple(null, fs);
        });
        db.get(t.object, function(err, res) {
          fs.value = res.name;
          nextInTriple(null, fs);
        });
      });
    });
  }

  function putNode(fields, cb) {

    var node = fields.reduce(function(acc, f) {
      if (f.field) acc[f.field] = f.value;
      return acc;
    }, {});

    var fs = fields.filter(function(f) { return f.field !== 'name'; });

    console.log(node);

    var ops = [
      {
        type: 'put',
        key: 'node'+node.name,
        value: { name: node.name },
      }
    ];

    var triples = [];

    fs.forEach(function(f) {
      ops.push({
        type: 'put',
        key: 'field'+f.field,
        value: { name: f.field }
      });
      ops.push({
        type: 'put',
        key: 'value'+f.value,
        value: { name: f.value }
      });
      triples.push({
        subject: 'node'+node.name,
        predicate: 'field'+f.field,
        object: 'value'+f.value
      });
    });

    var triplesBatch = [];
    triples.forEach(function(t) {
      triplesBatch = triplesBatch.concat(graph.generateBatch(t));
    });

    ops = ops.concat(triplesBatch.map(function(op) {
      op.prefix = ['graph'];
      op.valueEncoding = 'utf8';
      return op;
    }));

    db.batch(ops, cb);
  }
}

