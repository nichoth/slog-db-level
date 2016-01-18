var after = require('after');
var levelgraph = require('levelgraph');
var sublevel = require('level-sublevel');

module.exports = slogDb;

function slogDb(db) {

  db = sublevel(db);
  var graphSub = db.sublevel('graph', { valueEncoding: 'utf8' });
  var graph = levelgraph(graphSub);
  db.methods = db.methods || {};

  db.methods.slogGetValues = { type: 'async' };
  db.slogGetValues = getValues;

  db.methods.slogFetchNode = { type: 'async' };
  db.slogFetchNode = fetchNode;

  db.methods.slogPutNode = { type: 'async' };
  db.slogPutNode = putNode;

  db.methods.slogFetchNodes = { type: 'async' };
  db.slogFetchNodes = fetchNodes;

  db.methods.slogPutField = { type: 'async' };
  db.slogPutField = slogOp.bind(null, 'put', 'field');

  db.methods.slogDelField = { type: 'async' };
  db.slogDelField = slogOp.bind(null, 'del', 'field');

  db.methods.slogPutValue = { type: 'async' };
  db.slogPutValue = slogOp.bind(null, 'put', 'value');

  db.methods.slogDelValue = { type: 'async' };
  db.slogDelValue = slogOp.bind(null, 'del', 'value');

  db.methods.slogDelNode = { type: 'async' };
  db.slogDelNode = slogOp.bind(null, 'del', 'node');

  db.slog

  return db;

  function slogOp(opType, FVType, item, cb) {
    var ops = [
      { type: opType, key: item.key }
    ];
    var map = {
      node: 'subject',
      field: 'predicate',
      value: 'object'
    };

    var pattern = {};
    pattern[ map[FVType] ] = item.key;
    graph.get(pattern, function(err, res) {
      if (err) return cb(err);
      res = res instanceof Array ? res : [res];

      var graphBatch = res.map(function(r) {
        return graph.generateBatch(r, opType);
      }).reduce(function(acc, rs) {
        return acc.concat(
          rs.map(function(r) {
            r.prefix = ['graph'];
            r.valueEncoding = 'utf8';
            return r;
          })
        );
      }, []);

      db.batch(ops.concat(graphBatch), cb);
    });
  }

  function fetchNodes(query, cb) {
    var db = this;
    graph.get(query, function(err, res) {
      var nodes = [];
      var next = after(res.length, cb);
      res.forEach(function(r) {
        db.get(r.subject, function(err, node) {
          if (err) return next(err);
          nodes.push({ index: r.subject, name: node.name });
          next(null, nodes);
        });
      });
    });
  }

  function getValues(index, cb) {
    var db = this;

    graph.get({ predicate: index }, function(err, res) {
      if (res.length === 0) {  // this field has no relationships
        return db.del(index, function(err) {
          cb(err, []);
        });
      }
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
    var db = this;

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
    var db = this;

    var node = fields.reduce(function(acc, f) {
      if (f.field) acc[f.field] = f.value;
      return acc;
    }, {});

    var fs = fields.filter(function(f) { return f.field !== 'name'; });

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
