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
    var asyncCallback, attachDatabase, auth, callbacks, cleanObj, database, del, doexec, exec, generateId, getDocsToUpload, getId, getIdField, insert, maintenanceMode, makeTable, makeWhere, maxModified, readDiffs, resetSqlCache, select, settings, sqlCache, sqlCacheSize, syncCallback, update, upsert;
    auth = {
      getUser: function() {
        return {
          displayName: 'anonymous',
          roles: {
            anon: true
          }
        };
      }
    };
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
      preDelete: [],
      selectTransform: [],
      restore: []
    };
    generateId = function(num) {
      var chars, i, output;
      chars = 'abcdef1234567890';
      output = new Date().valueOf().toString(16);
      i = output.length;
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
    makeTable = function(table, cb) {
      var type;
      type = Object.prototype.toString.call(table);
      switch (type) {
        case '[object Array]':
          return async.eachSeries(table, function(item, callback) {
            return makeTable(item, callback);
          }, cb);
        case '[object String]':
          alasql("CREATE TABLE IF NOT EXISTS " + table);
          return typeof cb === "function" ? cb() : void 0;
      }
    };
    attachDatabase = function() {
      var firstTime;
      alasql("CREATE localStorage DATABASE IF NOT EXISTS `" + settings.database + "`");
      alasql("ATTACH localStorage DATABASE `" + settings.database + "` AS `" + settings.database + "`");
      alasql("USE `" + settings.database + "`");
      database = alasql.databases["" + settings.database];
      firstTime = true;

      /*
      for t of database.tables
        firstTime = false
        alasql "DELETE FROM #{t}"
       */
      if (settings.maxSqlCacheSize) {
        alasql.MAXSQLCACHESIZE = settings.maxSqlCacheSize;
      }
      maintenanceMode = false;
      return syncCallback('ready');
    };
    readDiffs = function(from, to, out) {
      var dif, diffs, good, j, len, myout, mypath;
      diffs = DeepDiff.diff(from, to);
      out = out || {};
      if (diffs) {
        for (j = 0, len = diffs.length; j < len; j++) {
          dif = diffs[j];
          switch (dif.kind) {
            case 'E':
            case 'N':
              myout = out;
              mypath = dif.path.join('.');
              good = true;
              if (dif.lhs && dif.rhs && typeof dif.lhs !== typeof dif.rhs) {
                if (dif.lhs.toString() === dif.rhs.toString()) {
                  good = false;
                }
              }
              if (good) {
                myout[mypath] = {};
                myout = myout[mypath];
                myout.from = dif.lhs;
                myout.to = dif.rhs;
              }
          }
        }
      }
      return out;
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
                user: auth.getUser(),
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
                user: auth.getUser(),
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
              user: auth.getUser(),
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
              user: auth.getUser(),
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
    maxModified = function(table, cb) {
      return database.exec('SELECT MAX(modifiedAt) as maxModified FROM ' + table, null, function(result) {
        maxModified = 0;
        if (result && result.length) {
          maxModified = result[0].maxModified || 0;
        }
        return typeof cb === "function" ? cb(maxModified) : void 0;
      });
    };
    getDocsToUpload = function(table, cb) {
      return database.exec("SELECT * FROM " + table + " WHERE modifiedAt=0", null, function(result) {
        if (result && result.length) {
          return typeof cb === "function" ? cb(result) : void 0;
        }
        return typeof cb === "function" ? cb(null) : void 0;
      });
    };
    makeWhere = function(whereObj) {
      var parent, parse, props, sql;
      if (!whereObj || whereObj.sort || whereObj.sortDir || whereObj.pageSize) {
        return {
          sql: ''
        };
      }
      props = [];
      parent = '';
      parse = function(obj, op, comp) {
        var andsql, j, k, key, len, len1, objsql, orsql, ref, ref1, sql, thing, writeVal;
        sql = '';
        writeVal = function(key, comp) {
          var fullKey;
          fullKey = (parent + "`" + key + "`").replace(/\./g, '->');
          fullKey = fullKey.replace(/->`\$[a-z]+`$/, '');
          if (obj[key] === null) {
            if (key === '$ne' || key === '$neq') {
              return sql += " " + op + " " + fullKey + " IS NOT NULL";
            } else {
              return sql += " " + op + " " + fullKey + " IS NULL";
            }
          } else {
            sql += " " + op + " " + fullKey + " " + comp + " ?";
            return props.push(obj[key]);
          }
        };
        for (key in obj) {
          if (key === '$or') {
            orsql = '';
            ref = obj[key];
            for (j = 0, len = ref.length; j < len; j++) {
              thing = ref[j];
              objsql = parse(thing, 'AND', comp).replace(/^ AND /, '');
              if (/ AND | OR /.test(objsql) && objsql.indexOf('(') !== 0) {
                objsql = "(" + objsql + ")";
              }
              orsql += ' OR ' + objsql;
            }
            sql += (" " + op + " (" + orsql + ")").replace(/\( OR /g, '(');
          } else if (key === '$and') {
            andsql = '';
            ref1 = obj[key];
            for (k = 0, len1 = ref1.length; k < len1; k++) {
              thing = ref1[k];
              andsql += parse(thing, 'AND', comp);
            }
            sql += (" " + op + " (" + andsql + ")").replace(/\( AND /g, '(');
          } else if (key === '$gt') {
            writeVal(key, '>');
          } else if (key === '$lt') {
            writeVal(key, '<');
          } else if (key === '$gte') {
            writeVal(key, '>=');
          } else if (key === '$lte') {
            writeVal(key, '<=');
          } else if (key === '$eq') {
            writeVal(key, '=');
          } else if (key === '$neq') {
            writeVal(key, '!=');
          } else if (key === '$ne') {
            writeVal(key, '!=');
          } else if (key === '$in') {
            writeVal(key, 'IN');
          } else if (key === '$nin') {
            writeVal(key, 'NOT IN');
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
            parent += '`' + key + '`->';
            sql += parse(obj[key], op, comp);
          } else {
            writeVal(key, comp);
          }
        }
        parent = '';
        return sql;
      };
      delete whereObj['#'];
      sql = parse(whereObj, 'AND', '=').replace(/(^|\() (AND|OR) /g, '$1');
      return {
        sql: sql,
        props: props
      };
    };
    select = function(table, args, cb, isServer) {
      return (function(user) {
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
            args.sort = args.sort.replace(/\./g, '->');
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
              return asyncCallback((isServer ? 'serverSelectTransform' : 'selectTransform'), {
                table: table,
                objs: output,
                isServer: isServer,
                user: user
              }, function() {
                return typeof cb === "function" ? cb(output, total) : void 0;
              });
            });
          };
          return output = exec("SELECT * FROM " + table + where.sql + sorting, where.props, null, isServer, myCb);
        });
      })(auth.getUser());
    };
    cleanObj = function(obj) {
      var key;
      for (key in obj) {
        if (key.indexOf('$') === 0 || key === '#') {
          delete obj[key];
        }
      }
    };
    update = function(table, obj, whereObj, cb, isServer) {
      var where;
      cleanObj(obj);
      obj.modifiedAt = obj.modifiedAt || 0;
      where = makeWhere(whereObj);
      if (where.sql) {
        where.sql = " WHERE " + where.sql;
      }
      return (function(user) {
        return exec("SELECT * FROM " + table + where.sql, where.props, null, true, function(oldItems) {
          if (oldItems) {
            return async.each(oldItems, function(oldItem, diffCb) {
              var diffs, id;
              diffs = readDiffs(oldItem, obj);
              id = getId(oldItem);
              return asyncCallback((isServer ? 'serverPreUpdate' : 'preUpdate'), {
                id: id,
                table: table,
                obj: obj,
                where: whereObj,
                changes: diffs,
                user: user
              }, function(result) {
                var key, updateProps, updateSql;
                if (!result) {
                  return typeof cb === "function" ? cb([]) : void 0;
                }
                updateSql = [];
                updateProps = [];
                for (key in obj) {
                  if (where.props.indexOf(obj[key]) === -1) {
                    updateSql.push(" `" + key + "`=? ");
                    updateProps.push(obj[key]);
                  }
                }
                updateProps.push(id);
                return exec("UPDATE " + table + " SET " + (updateSql.join(',')) + " WHERE `" + [settings.autoId] + "`= ?", updateProps, null, isServer, diffCb, diffs);
              });
            }, function() {
              return typeof cb === "function" ? cb([]) : void 0;
            });
          } else {
            return typeof cb === "function" ? cb([]) : void 0;
          }
        });
      })(auth.getUser());
    };
    insert = function(table, obj, cb, isServer) {
      cleanObj(obj);
      obj.modifiedAt = obj.modifiedAt || 0;
      return (function(user) {
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
      })(auth.getUser());
    };
    upsert = function(table, obj, whereObj, cb, isServer) {
      var test, where;
      where = makeWhere(whereObj);
      if (!whereObj && obj[settings.autoId]) {
        whereObj = {};
        whereObj[settings.autoId] = obj[settings.autoId];
        where = makeWhere(whereObj);
      }
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
      return (function(user) {
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
      })(auth.getUser());
    };
    return {
      config: function(args) {
        return Object.assign(settings, args);
      },
      $get: function($injector, $rootElement) {
        settings.database = $rootElement.attr('ng-app');
        if ($injector.has('Auth')) {
          auth = $injector.get('Auth');
        }
        return {
          start: function() {
            if (settings.database) {
              return attachDatabase();
            }
          },
          exec: exec,
          select: select,
          update: update,
          insert: insert,
          upsert: upsert,
          "delete": del,
          makeTable: makeTable,
          maxModified: maxModified,
          getDocsToUpload: getDocsToUpload,
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
