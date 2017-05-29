(function() {
  'use strict';
  var e, error1, module;

  module = null;

  try {
    module = angular.module('ndx');
  } catch (error1) {
    e = error1;
    module = angular.module('ndx', []);
  }

  module.provider('ndxdb', function() {
    var asyncCallback, attachDatabase, callbacks, cleanObj, database, del, doexec, exec, generateId, getId, getIdField, http, inflate, inflateFromHttp, inflateFromObject, inflateFromRest, insert, maintenanceMode, makeTable, makeTablesFromRest, makeWhere, resetSqlCache, select, settings, sqlCache, sqlCacheSize, syncCallback, update, upsert, user;
    http = null;
    user = {};
    database = null;
    settings = {
      database: 'db',
      autoId: '_id'
    };
    sqlCache = {};
    sqlCacheSize = 0;
    resetSqlCache = function() {
      sqlCache = {};
      return sqlCacheSize = 0;
    };
    maintenanceMode = true;
    callbacks = {
      ready: [],
      insert: [],
      update: [],
      select: [],
      "delete": [],
      preInsert: [],
      preUpdate: [],
      preSelect: [],
      preDelete: []
    };
    generateId = function(num) {
      var chars, i, output;
      output = '';
      chars = 'abcdefghijklmnopqrstuvwxyz1234567890';
      i = 0;
      while (i++ < num) {
        output += chars[Math.floor(Math.random() * chars.length)];
      }
      return output;
    };
    getId = function(row) {
      return row[settings.autoId] || row.id || row._id || row.i;
    };
    getIdField = function(row) {
      var output;
      output = '_id';
      if (row[settings.autoId]) {
        output = settings.autoId;
      } else if (row.id) {
        output = 'id';
      } else if (row._id) {
        output = '_id';
      } else if (row.i) {
        output = 'i';
      }
      return output;
    };
    syncCallback = function(name, obj, cb) {
      var callback, j, len, ref;
      if (callbacks[name] && callbacks[name].length) {
        ref = callbacks[name];
        for (j = 0, len = ref.length; j < len; j++) {
          callback = ref[j];
          callback(obj);
        }
      }
      return typeof cb === "function" ? cb() : void 0;
    };
    asyncCallback = function(name, obj, cb) {
      var truth;
      truth = false;
      if (callbacks[name] && callbacks[name].length) {
        return async.eachSeries(callbacks[name], function(cbitem, callback) {
          return cbitem(obj, function(result) {
            truth = truth || result;
            return callback();
          });
        }, function() {
          return typeof cb === "function" ? cb(truth) : void 0;
        });
      } else {
        return typeof cb === "function" ? cb(true) : void 0;
      }
    };
    inflateFromObject = function(data, cb) {
      return async.eachOfSeries(data, function(value, key, tableCb) {
        if (value.length) {
          if (value[0][settings.autoId]) {
            if (database.tables[key]) {
              database.tables[key].data = value;
            }
            return tableCb();
          } else {
            return async.eachSeries(value, function(obj, insertCb) {
              database.insert(key, obj);
              return insertCb();
            }, tableCb);
          }
        } else {
          return tableCb();
        }
      }, cb);
    };
    inflateFromRest = function(cb) {
      return http.get('/rest/endpoints').then(function(response) {
        if (response.data && response.data.endpoints && response.data.endpoints.length) {
          return async.eachSeries(response.data.endpoints, function(endpoint, callback) {
            return http.post("/api/" + endpoint).then(function(epResponse) {
              if (epResponse.data && epResponse.data.items && database.tables[endpoint]) {
                database.tables[endpoint].data = epResponse.data.items;
              }
              return callback();
            }, callback);
          }, cb());
        } else {
          return cb();
        }
      }, cb);
    };
    inflateFromHttp = function(url, cb) {
      return http.get(url).then(function(response) {
        if (response.data) {
          return inflateFromObject(response.data, cb);
        } else {
          return cb();
        }
      }, function() {
        return cb();
      });
    };
    inflate = function(data, cb) {
      var type;
      type = Object.prototype.toString.call(data);
      switch (type) {
        case '[object Array]':
          return async.eachSeries(data, function(item, callback) {
            return inflate(item, callback);
          }, cb);
        case '[object Object]':
          return inflateFromObject(data, cb);
        case '[object Function]':
          return data(this, cb);
        case '[object Boolean]':
          if (data) {
            return inflateFromRest(cb);
          } else {
            return cb();
          }
          break;
        case '[object String]':
          if (data.toLowerCase() === 'rest') {
            return inflateFromRest(cb);
          } else {
            return inflateFromHttp(data, cb);
          }
      }
    };
    makeTablesFromRest = function(cb) {
      return http.get('/rest/endpoints').then(function(response) {
        var endpoint, j, len, ref;
        if (response.data && response.data.endpoints && response.data.endpoints.length) {
          ref = response.data.endpoints;
          for (j = 0, len = ref.length; j < len; j++) {
            endpoint = ref[j];
            alasql("CREATE TABLE IF NOT EXISTS " + endpoint);
          }
        }
        if (response.data.autoId) {
          settings.autoId = response.data.autoId;
        }
        return cb();
      }, function() {
        return cb();
      });
    };
    makeTable = function(table, cb) {
      var type;
      type = Object.prototype.toString.call(table);
      switch (type) {
        case '[object Array]':
          return async.eachSeries(table, function(item, callback) {
            return makeTable(item, callback);
          }, cb);
        case '[object Boolean]':
          if (table) {
            return makeTablesFromRest(cb);
          } else {
            return cb();
          }
          break;
        case '[object String]':
          if (table.toLowerCase() === 'restTables') {
            return makeTablesFromRest(cb);
          } else {
            alasql("CREATE TABLE IF NOT EXISTS " + table);
            return cb();
          }
      }
    };
    attachDatabase = function() {
      var firstTime, t;
      alasql("CREATE localStorage DATABASE IF NOT EXISTS " + settings.database);
      alasql("ATTACH localStorage DATABASE " + settings.database + " AS My" + settings.database);
      alasql("USE My" + settings.database);
      database = alasql.databases["My" + settings.database];
      firstTime = true;
      for (t in database.tables) {
        firstTime = false;
      }
      if (settings.maxSqlCacheSize) {
        alasql.MAXSQLCACHESIZE = settings.maxSqlCacheSize;
      }
      return makeTable(settings.tables, function() {
        if (firstTime && settings.data) {
          return inflate(settings.data, function() {
            maintenanceMode = false;
            return syncCallback('ready');
          });
        } else {
          maintenanceMode = false;
          return syncCallback('ready');
        }
      });
    };
    exec = function(sql, props, notCritical, isServer, cb) {
      if (!maintenanceMode) {
        return doexec(sql, props, notCritical, isServer, cb);
      } else {
        return callbacks.ready.push(function() {
          return doexec(sql, props, notCritical, isServer, cb);
        });
      }
    };
    doexec = function(sql, props, notCritical, isServer, cb) {
      var args, ast, error, hash, hh, idProps, idWhere, isDelete, isInsert, isSelect, isUpdate, j, k, l, len, len1, len2, output, prop, ref, ref1, ref2, res, statement, table, updateIds;
      hash = function(str) {
        var h, i;
        h = 5381;
        i = str.length;
        while (i) {
          h = (h * 33) ^ str.charCodeAt(--i);
        }
        return h;
      };
      hh = hash(sql);
      ast = sqlCache[hh];
      if (!ast) {
        ast = alasql.parse(sql);
      }
      if (!(ast.statements && ast.statements.length)) {
        if (typeof cb === "function") {
          cb([]);
        }
        return [];
      } else {
        if (sqlCacheSize > database.MAX_SQL_CACHE_SIZE) {
          resetSqlCache();
        }
        sqlCacheSize++;
        sqlCache[hh] = ast;
      }
      args = [].slice.call(arguments);
      args.splice(0, 3);
      error = '';
      ref = ast.statements;
      for (j = 0, len = ref.length; j < len; j++) {
        statement = ref[j];
        table = '';
        isUpdate = statement instanceof alasql.yy.Update;
        isInsert = statement instanceof alasql.yy.Insert;
        isDelete = statement instanceof alasql.yy.Delete;
        isSelect = statement instanceof alasql.yy.Select;
        if (statement.into) {
          table = statement.into.tableid;
          isInsert = true;
          isSelect = false;
        } else if (statement.table) {
          table = statement.table.tableid;
        } else if (statement.from && statement.from.lenth) {
          table = statement.from[0].tableid;
        }
        if (settings.autoId && isInsert) {
          if (Object.prototype.toString.call(props[0]) === '[object Array]') {
            ref1 = props[0];
            for (k = 0, len1 = ref1.length; k < len1; k++) {
              prop = ref1[k];
              if (!prop[settings.autoId]) {
                prop[settings.autoId] = generateId(24);
              }
            }
          } else {
            if (!props[0][settings.autoId]) {
              props[0][settings.autoId] = generateId(24);
            }
          }
        }
        updateIds = [];
        if (isUpdate) {
          idWhere = '';
          idProps = [];
          if (statement.where) {
            idWhere = ' WHERE ' + statement.where.toString().replace(/\$(\d+)/g, function(all, p) {
              if (props.length > +p) {
                idProps.push(props[+p]);
              }
              return '?';
            });
          }
          updateIds = database.exec('SELECT *, \'' + table + '\' as ndxtable FROM ' + table + idWhere, idProps);
        } else if (isDelete) {
          idWhere = '';
          if (statement.where) {
            idWhere = ' WHERE ' + statement.where.toString().replace(/\$(\d+)/g, '?');
          }
          res = database.exec('SELECT * FROM ' + table + idWhere, props);
          if (res && res.length) {
            async.each(res, function(r, callback) {
              var delObj;
              delObj = {
                '__!deleteMe!': true
              };
              delObj[getIdField(r)] = getId(r);
              asyncCallback((isServer ? 'serverDelete' : 'delete'), {
                id: getId(r),
                table: table,
                obj: delObj,
                user: user,
                isServer: isServer
              });
              return callback();
            });
          }
        } else if (isInsert) {
          if (Object.prototype.toString.call(props[0]) === '[object Array]') {
            ref2 = props[0];
            for (l = 0, len2 = ref2.length; l < len2; l++) {
              prop = ref2[l];
              if (settings.AUTO_DATE) {
                prop.u = new Date().valueOf();
              }
              asyncCallback((isServer ? 'serverInsert' : 'insert'), {
                id: getId(prop),
                table: table,
                obj: prop,
                args: args,
                user: user,
                isServer: isServer
              });
            }
          } else {
            if (settings.AUTO_DATE) {
              props[0].u = new Date().valueOf();
            }
            asyncCallback((isServer ? 'serverInsert' : 'insert'), {
              id: getId(props[0]),
              table: table,
              obj: props[0],
              user: user,
              args: args,
              isServer: isServer
            });
          }
        }
      }
      output = database.exec(sql, props, cb);
      if (updateIds && updateIds.length) {
        async.each(updateIds, function(updateId, callback) {
          var r;
          if (settings.AUTO_DATE) {
            database.exec('UPDATE ' + updateId.ndxtable + ' SET u=? WHERE ' + getIdField(updateId) + '=?', [new Date().valueOf(), getId(updateId)]);
          }
          res = database.exec('SELECT * FROM ' + updateId.ndxtable + ' WHERE ' + getIdField(updateId) + '=?', [getId(updateId)]);
          if (res && res.length) {
            r = res[0];
            asyncCallback((isServer ? 'serverUpdate' : 'update'), {
              id: getId(r),
              table: updateId.ndxtable,
              obj: r,
              args: args,
              user: user,
              isServer: isServer
            });
          }
          return callback();
        });
      }
      if (error) {
        output.error = error;
      }
      return output;
    };
    makeWhere = function(whereObj) {
      var parent, parse, props, sql;
      if (!whereObj || whereObj.sort || whereObj.sortDir || whereObj.pageSize) {
        return {
          sql: ''
        };
      }
      sql = '';
      props = [];
      parent = '';
      parse = function(obj, op, comp) {
        var key;
        sql = '';
        for (key in obj) {
          if (key === '$or') {
            sql += (" " + op + " (" + (parse(obj[key], 'OR', comp)) + ")").replace(/\( OR /g, '(');
          } else if (key === '$gt') {
            sql += parse(obj[key], op, '>');
          } else if (key === '$lt') {
            sql += parse(obj[key], op, '<');
          } else if (key === '$gte') {
            sql += parse(obj[key], op, '>=');
          } else if (key === '$lte') {
            sql += parse(obj[key], op, '<=');
          } else if (key === '$eq') {
            sql += parse(obj[key], op, '=');
          } else if (key === '$neq') {
            sql += parse(obj[key], op, '!=');
          } else if (key === '$like') {
            sql += " " + op + " " + (parent.replace(/->$/, '')) + " LIKE '%" + obj[key] + "%'";
            parent = '';
          } else if (key === '$null') {
            sql += " " + op + " " + (parent.replace(/->$/, '')) + " IS NULL";
            parent = '';
          } else if (key === '$nnull') {
            sql += " " + op + " " + (parent.replace(/->$/, '')) + " IS NOT NULL";
            parent = '';
          } else if (key === '$nn') {
            sql += " " + op + " " + (parent.replace(/->$/, '')) + " IS NOT NULL";
            parent = '';
          } else if (Object.prototype.toString.call(obj[key]) === '[object Object]') {
            parent += key + '->';
            sql += parse(obj[key], op, comp);
          } else {
            sql += " " + op + " " + parent + key + " " + comp + " ?";
            props.push(obj[key]);
            parent = '';
          }
        }
        return sql;
      };
      sql = parse(whereObj, 'AND', '=').replace(/(^|\() (AND|OR) /g, '$1');
      return {
        sql: sql,
        props: props
      };
    };
    select = function(table, args, cb, isServer) {
      return asyncCallback((isServer ? 'serverPreSelect' : 'preSelect'), {
        table: table,
        args: args,
        user: user
      }, function(result) {
        var myCb, output, sorting, where;
        if (!result) {
          return typeof cb === "function" ? cb([], 0) : void 0;
        }
        args = args || {};
        where = makeWhere(args.where ? args.where : args);
        sorting = '';
        if (args.sort) {
          sorting += " ORDER BY " + args.sort;
          if (args.sortDir) {
            sorting += " " + args.sortDir;
          }
        }
        if (where.sql) {
          where.sql = " WHERE " + where.sql;
        }
        myCb = function(output) {
          return asyncCallback((isServer ? 'serverSelect' : 'select'), {
            table: table,
            objs: output,
            isServer: isServer,
            user: user
          }, function() {
            var total;
            total = output.length;
            if (args.page || args.pageSize) {
              args.page = args.page || 1;
              args.pageSize = args.pageSize || 10;
              output = output.splice((args.page - 1) * args.pageSize, args.pageSize);
            }
            return typeof cb === "function" ? cb(output, total) : void 0;
          });
        };
        return output = exec("SELECT * FROM " + table + where.sql + sorting, where.props, null, isServer, myCb);
      });
    };
    cleanObj = function(obj) {
      var key;
      for (key in obj) {
        if (key.indexOf('$') === 0) {
          delete obj[key];
        }
      }
    };
    update = function(table, obj, whereObj, cb, isServer) {
      cleanObj(obj);
      return asyncCallback((isServer ? 'serverPreUpdate' : 'preUpdate'), {
        id: getId(obj),
        table: table,
        obj: obj,
        where: whereObj,
        user: user
      }, function(result) {
        var key, props, updateProps, updateSql, where;
        if (!result) {
          return typeof cb === "function" ? cb([]) : void 0;
        }
        updateSql = [];
        updateProps = [];
        where = makeWhere(whereObj);
        if (where.sql) {
          where.sql = " WHERE " + where.sql;
        }
        for (key in obj) {
          if (where.props.indexOf(obj[key]) === -1) {
            updateSql.push(" `" + key + "`=? ");
            updateProps.push(obj[key]);
          }
        }
        props = updateProps.concat(where.props);
        return exec("UPDATE " + table + " SET " + (updateSql.join(',')) + where.sql, props, null, isServer, cb);
      });
    };
    insert = function(table, obj, cb, isServer) {
      cleanObj(obj);
      return asyncCallback((isServer ? 'serverPreInsert' : 'preInsert'), {
        table: table,
        obj: obj,
        user: user
      }, function(result) {
        if (!result) {
          return typeof cb === "function" ? cb([]) : void 0;
        }
        if (Object.prototype.toString.call(obj) === '[object Array]') {
          return exec("INSERT INTO " + table + " SELECT * FROM ?", [obj], null, isServer, cb);
        } else {
          return exec("INSERT INTO " + table + " VALUES ?", [obj], null, isServer, cb);
        }
      });
    };
    upsert = function(table, obj, whereObj, cb, isServer) {
      var test, where;
      where = makeWhere(whereObj);
      if (where.sql) {
        where.sql = " WHERE " + where.sql;
      }
      test = exec("SELECT * FROM " + table + where.sql, where.props, null, isServer);
      if (test && test.length && where.sql) {
        return update(table, obj, whereObj, cb, isServer);
      } else {
        return insert(table, obj, cb, isServer);
      }
    };
    del = function(table, whereObj, cb, isServer) {
      var where;
      where = makeWhere(whereObj);
      if (where.sql) {
        where.sql = " WHERE " + where.sql;
      }
      return asyncCallback((isServer ? 'serverPreDelete' : 'preDelete'), {
        table: table,
        where: whereObj,
        user: user
      }, function(result) {
        if (!result) {
          if (typeof cb === "function") {
            cb([]);
          }
        }
        return exec("DELETE FROM " + table + where.sql, where.props, null, isServer, cb);
      });
    };
    return {
      config: function(args) {
        return Object.assign(settings, args);
      },
      $get: function($http) {
        http = $http;
        return {
          start: function() {
            if (settings.database && settings.tables) {
              return attachDatabase();
            }
          },
          exec: exec,
          select: select,
          update: update,
          insert: insert,
          upsert: upsert,
          "delete": del,
          on: function(name, callback) {
            callbacks[name].push(callback);
            return this;
          },
          off: function(name, callback) {
            callbacks[name].splice(callbacks[name].indexOf(callback), 1);
            return this;
          }
        };
      }
    };
  });

  module.run(function(ndxdb) {
    return ndxdb.start();
  });

  alasql.yy.UniOp.prototype.toString = function() {
    var s;
    s = void 0;
    if (this.op === '~') {
      s = this.op + this.right.toString();
    }
    if (this.op === '-') {
      s = this.op + this.right.toString();
    }
    if (this.op === '+') {
      s = this.op + this.right.toString();
    }
    if (this.op === '#') {
      s = this.op + this.right.toString();
    }
    if (this.op === 'NOT') {
      s = this.op + '(' + this.right.toString() + ')';
    }
    if (this.op === null) {
      s = '(' + this.right.toString() + ')';
    }
    if (!s) {
      s = this.right.toString();
    }
    return s;
  };

  alasql.yy.Select.prototype.toString = function() {
    var s;
    s = '';
    if (this.explain) {
      s += 'EXPLAIN ';
    }
    s += 'SELECT ';
    if (this.modifier) {
      s += this.modifier + ' ';
    }
    if (this.distinct) {
      s += 'DISTINCT ';
    }
    if (this.top) {
      s += 'TOP ' + this.top.value + ' ';
      if (this.percent) {
        s += 'PERCENT ';
      }
    }
    s += this.columns.map(function(col) {
      var s;
      s = col.toString();
      if (typeof col.as !== 'undefined') {
        s += ' AS ' + col.as;
      }
      return s;
    }).join(', ');
    if (this.from) {
      s += ' FROM ' + this.from.map(function(f) {
        var ss;
        ss = f.toString();
        if (f.as) {
          ss += ' AS ' + f.as;
        }
        return ss;
      }).join(',');
    }
    if (this.joins) {
      s += this.joins.map(function(jn) {
        var ss;
        ss = ' ';
        if (jn.joinmode) {
          ss += jn.joinmode + ' ';
        }
        if (jn.table) {
          ss += 'JOIN ' + jn.table.toString();
        } else if (jn.select) {
          ss += 'JOIN (' + jn.select.toString() + ')';
        } else if (jn instanceof alasql.yy.Apply) {
          ss += jn.toString();
        } else {
          throw new Error('Wrong type in JOIN mode');
        }
        if (jn.as) {
          ss += ' AS ' + jn.as;
        }
        if (jn.using) {
          ss += ' USING ' + jn.using.toString();
        }
        if (jn.on) {
          ss += ' ON ' + jn.on.toString();
        }
        return ss;
      });
    }
    if (this.where) {
      s += ' WHERE ' + this.where.toString();
    }
    if (this.group && this.group.length > 0) {
      s += ' GROUP BY ' + this.group.map(function(grp) {
        return grp.toString();
      }).join(', ');
    }
    if (this.having) {
      s += ' HAVING ' + this.having.toString();
    }
    if (this.order && this.order.length > 0) {
      s += ' ORDER BY ' + this.order.map(function(ord) {
        return ord.toString();
      }).join(', ');
    }
    if (this.limit) {
      s += ' LIMIT ' + this.limit.value;
    }
    if (this.offset) {
      s += ' OFFSET ' + this.offset.value;
    }
    if (this.union) {
      s += ' UNION ' + (this.corresponding ? 'CORRESPONDING ' : '') + this.union.toString();
    }
    if (this.unionall) {
      s += ' UNION ALL ' + (this.corresponding ? 'CORRESPONDING ' : '') + this.unionall.toString();
    }
    if (this.except) {
      s += ' EXCEPT ' + (this.corresponding ? 'CORRESPONDING ' : '') + this.except.toString();
    }
    if (this.intersect) {
      s += ' INTERSECT ' + (this.corresponding ? 'CORRESPONDING ' : '') + this.intersect.toString();
    }
    return s;
  };

}).call(this);

//# sourceMappingURL=index.js.map
