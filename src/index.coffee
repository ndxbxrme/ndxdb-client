'use strict'
module = null
try
  module = angular.module 'ndx'
catch e
  module = angular.module 'ndx', []
module.provider 'ndxdb', ->
  http = null
  auth =
    getUser: ->
      displayName: 'anonymous'
      roles:
        anon: true
  database = null
  settings = 
    database: 'db'
    autoId: '_id'
  sqlCache = {}
  sqlCacheSize = 0
  resetSqlCache = ->
    sqlCache = {}
    sqlCacheSize = 0
  maintenanceMode = true
  callbacks =
    ready: []
    insert: []
    update: []
    select: []
    delete: []
    preInsert: []
    preUpdate: []
    preSelect: []
    preDelete: []
  generateId = (num) ->
    output = ''
    chars = 'abcdefghijklmnopqrstuvwxyz1234567890'
    i = 0
    while i++ < num
      output += chars[Math.floor(Math.random() * chars.length)]
    output
  getId = (row) ->
    row[settings.autoId] or row.id or row._id or row.i
  getIdField = (row) ->
    output = '_id'
    if row[settings.autoId] then output = settings.autoId
    else if row.id then output = 'id'
    else if row._id then output = '_id'
    else if row.i then output = 'i'
    output
  syncCallback = (name, obj, cb) ->
    if callbacks[name] and callbacks[name].length
      for callback in callbacks[name]
        callback obj
    cb?()
  asyncCallback = (name, obj, cb) ->
    truth = false
    if callbacks[name] and callbacks[name].length
      async.eachSeries callbacks[name], (cbitem, callback) ->
        cbitem obj, (result) ->
          truth = truth or result
          callback()
      , ->
        cb? truth
    else
      cb? true
  inflateFromObject = (data, cb) ->
    async.eachOfSeries data, (value, key, tableCb) ->
      if value.length
        if value[0][settings.autoId]
          #already id'd copy them in
          if database.tables[key]
            database.tables[key].data = value
          tableCb()
        else
          async.eachSeries value, (obj, insertCb) ->
            insert key, obj
            insertCb()
          , tableCb
      else
        tableCb()
    , cb
  inflateFromRest = (cb) ->
    http.get '/rest/endpoints'
    .then (response) ->
      if response.data and response.data.endpoints and response.data.endpoints.length
        async.eachSeries response.data.endpoints, (endpoint, callback) ->
          http.post "/api/#{endpoint}"
          .then (epResponse) ->
            if epResponse.data and epResponse.data.items and database.tables[endpoint]
              database.tables[endpoint].data = epResponse.data.items
            callback()
          , callback
        , cb()
      else
        cb()
    , cb
  inflateFromHttp = (url, cb) ->
    http.get url
    .then (response) ->
      if response.data
        inflateFromObject response.data, cb
      else
        cb()
    , ->
      cb()
  inflate = (data, cb) ->
    type = Object.prototype.toString.call data
    switch type
      when '[object Array]'
        async.eachSeries data, (item, callback) ->
          inflate item, callback
        , cb
      when '[object Object]'
        inflateFromObject data, cb
      when '[object Function]'
        data @, cb
      when '[object Boolean]'
        if data
          inflateFromRest cb
        else
          cb()
      when '[object String]'
        if data.toLowerCase() is 'rest'
          inflateFromRest cb
        else
          inflateFromHttp data, cb
  makeTablesFromRest = (cb) ->
    http.get '/rest/endpoints'
    .then (response) ->
      if response.data and response.data.endpoints and response.data.endpoints.length
        for endpoint in response.data.endpoints
          alasql "CREATE TABLE IF NOT EXISTS #{endpoint}"
      if response.data.autoId
        settings.autoId = response.data.autoId
      cb()
    , ->
      cb()
  makeTable = (table, cb) ->
    type = Object.prototype.toString.call table
    switch type
      when '[object Array]'
        async.eachSeries table, (item, callback) ->
          makeTable item, callback
        , cb
      when '[object Boolean]'
        if table
          makeTablesFromRest cb
        else
          cb()
      when '[object String]'
        if table.toLowerCase() is 'restTables'
          makeTablesFromRest cb
        else
          alasql "CREATE TABLE IF NOT EXISTS #{table}"
          cb()
  attachDatabase = ->
    alasql "CREATE localStorage DATABASE IF NOT EXISTS #{settings.database}"
    alasql "ATTACH localStorage DATABASE #{settings.database} AS My#{settings.database}"
    alasql "USE My#{settings.database}"
    database = alasql.databases["My#{settings.database}"]
    firstTime = true
    for t of database.tables
      firstTime = false
    if settings.maxSqlCacheSize
      alasql.MAXSQLCACHESIZE = settings.maxSqlCacheSize
    makeTable settings.tables, ->
      if firstTime and settings.data
        inflate settings.data, ->
          maintenanceMode = false
          syncCallback 'ready'
      else
        maintenanceMode = false
        syncCallback 'ready'
  exec = (sql, props, notCritical, isServer, cb) ->
    if not maintenanceMode
      return doexec sql, props, notCritical, isServer, cb
    else
      callbacks.ready.push ->
        doexec sql, props, notCritical, isServer, cb
  doexec = (sql, props, notCritical, isServer, cb) ->
    hash = (str) ->
      h = 5381
      i = str.length
      while i
        h = (h * 33) ^ str.charCodeAt --i
      h
    hh = hash sql
    ast = sqlCache[hh]
    if not ast
      ast = alasql.parse sql
    if not (ast.statements and ast.statements.length)
      cb? []
      return []
    else
      if sqlCacheSize > database.MAX_SQL_CACHE_SIZE
        resetSqlCache()
      sqlCacheSize++
      sqlCache[hh] = ast
    args = [].slice.call arguments
    args.splice 0, 3
    error = ''
    for statement in ast.statements
      table = ''
      isUpdate = statement instanceof alasql.yy.Update
      isInsert = statement instanceof alasql.yy.Insert
      isDelete = statement instanceof alasql.yy.Delete
      isSelect = statement instanceof alasql.yy.Select
      if statement.into
        table = statement.into.tableid
        isInsert = true
        isSelect = false
      else if statement.table then table = statement.table.tableid
      else if statement.from and statement.from.lenth then table = statement.from[0].tableid
      if settings.autoId and isInsert
        if Object.prototype.toString.call(props[0]) is '[object Array]'
          for prop in props[0]
            if not prop[settings.autoId]
              prop[settings.autoId] = generateId(24)
        else
          if not props[0][settings.autoId]
            props[0][settings.autoId] = generateId(24)
      updateIds = []
      if isUpdate
        idWhere = ''
        idProps = []
        if statement.where
          idWhere = ' WHERE ' + statement.where.toString().replace /\$(\d+)/g, (all, p) ->
            if props.length > +p
              idProps.push props[+p]
            '?'
        updateIds = database.exec 'SELECT *, \'' + table + '\' as ndxtable FROM ' + table + idWhere, idProps
      else if isDelete
        idWhere = ''
        if statement.where
          idWhere = ' WHERE ' + statement.where.toString().replace /\$(\d+)/g, '?'
        res = database.exec 'SELECT * FROM ' + table + idWhere, props
        if res and res.length
          async.each res, (r, callback) ->
            delObj =
              '__!deleteMe!': true
            delObj[getIdField(r)] = getId r
            asyncCallback (if isServer then 'serverDelete' else 'delete'), 
              id: getId r
              table: table
              obj: delObj
              user: auth.getUser()
              isServer: isServer
            callback()
      else if isInsert
        if Object.prototype.toString.call(props[0]) is '[object Array]'
          for prop in props[0]
            if settings.AUTO_DATE
              prop.u = new Date().valueOf()
            asyncCallback (if isServer then 'serverInsert' else 'insert'), 
              id: getId prop
              table: table
              obj: prop
              args: args
              user: auth.getUser()
              isServer: isServer
        else
          if settings.AUTO_DATE
            props[0].u = new Date().valueOf();
          asyncCallback (if isServer then 'serverInsert' else 'insert'),
            id: getId props[0]
            table: table
            obj: props[0]
            user: auth.getUser()
            args: args
            isServer: isServer
    output = database.exec sql, props, cb   
    if updateIds and updateIds.length
      async.each updateIds, (updateId, callback) ->
        if settings.AUTO_DATE
          database.exec 'UPDATE ' + updateId.ndxtable + ' SET u=? WHERE ' + getIdField(updateId) + '=?', [new Date().valueOf(), getId(updateId)]
        res = database.exec 'SELECT * FROM ' + updateId.ndxtable + ' WHERE ' + getIdField(updateId) + '=?', [getId(updateId)]
        if res and res.length
          r = res[0]
          asyncCallback (if isServer then 'serverUpdate' else 'update'),
            id: getId r
            table: updateId.ndxtable
            obj: r
            args: args
            user: auth.getUser()
            isServer: isServer
        callback()
    if error
      output.error = error
    output
  makeWhere = (whereObj) ->
    if not whereObj or whereObj.sort or whereObj.sortDir or whereObj.pageSize
      return sql: ''
    sql = ''
    props = []
    parent = ''

    parse = (obj, op, comp) ->
      sql = ''
      for key of obj
        if key is '$or'
          sql += " #{op} (#{parse(obj[key], 'OR', comp)})".replace /\( OR /g, '('
        else if key is '$gt'
          sql += parse obj[key], op, '>'
        else if key is '$lt'
          sql += parse obj[key], op, '<'
        else if key is '$gte'
          sql += parse obj[key], op, '>='
        else if key is '$lte'
          sql += parse obj[key], op, '<='
        else if key is '$eq'
          sql += parse obj[key], op, '='
        else if key is '$neq'
          sql += parse obj[key], op, '!='
        else if key is '$like'
          sql += " #{op} #{parent.replace(/->$/, '')} LIKE '%#{obj[key]}%'"
          parent = ''
        else if key is '$null'
          sql += " #{op} #{parent.replace(/->$/, '')} IS NULL"
          parent = ''
        else if key is '$nnull'
          sql += " #{op} #{parent.replace(/->$/, '')} IS NOT NULL"
          parent = ''
        else if key is '$nn'
          sql += " #{op} #{parent.replace(/->$/, '')} IS NOT NULL"
          parent = ''
        else if Object::toString.call(obj[key]) is '[object Object]'
          parent += key + '->'
          sql += parse(obj[key], op, comp)
        else
          sql += " #{op} #{parent}#{key} #{comp} ?"
          props.push obj[key]
          parent = ''
      sql

    sql = parse(whereObj, 'AND', '=').replace(/(^|\() (AND|OR) /g, '$1')
    {
      sql: sql
      props: props
    }
  select = (table, args, cb, isServer) ->
    asyncCallback (if isServer then 'serverPreSelect' else 'preSelect'), 
      table: table
      args: args
      user: auth.getUser()
    , (result) ->
      if not result
        return cb? [], 0
      args = args or {}
      where = makeWhere if args.where then args.where else args
      sorting = ''
      if args.sort
        sorting += " ORDER BY #{args.sort}"
        if args.sortDir
          sorting += " #{args.sortDir}"
      if where.sql
        where.sql = " WHERE #{where.sql}"
      myCb = (output) ->
        asyncCallback (if isServer then 'serverSelect' else 'select'), 
          table: table
          objs: output
          isServer: isServer
          user: auth.getUser()
        , ->
          total = output.length
          if args.page or args.pageSize
            args.page = args.page or 1
            args.pageSize = args.pageSize or 10
            output = output.splice (args.page - 1) * args.pageSize, args.pageSize
          cb? output, total
      output = exec "SELECT * FROM #{table}#{where.sql}#{sorting}", where.props, null, isServer,  myCb
  cleanObj = (obj) ->
    for key of obj
      if key.indexOf('$') is 0
        delete obj[key]
    return
  update = (table, obj, whereObj, cb, isServer) ->
    cleanObj obj
    asyncCallback (if isServer then 'serverPreUpdate' else 'preUpdate'),
      id: getId obj
      table: table
      obj: obj
      where: whereObj
      user: auth.getUser()
    , (result) ->
      if not result
        return cb? []
      updateSql = []
      updateProps = []
      where = makeWhere whereObj
      if where.sql
        where.sql = " WHERE #{where.sql}"
      for key of obj
        if where.props.indexOf(obj[key]) is -1
          updateSql.push " `#{key}`=? "
          updateProps.push obj[key]
      props = updateProps.concat where.props
      exec "UPDATE #{table} SET #{updateSql.join(',')}#{where.sql}", props, null, isServer, cb
  insert = (table, obj, cb, isServer) ->
    cleanObj obj
    asyncCallback (if isServer then 'serverPreInsert' else 'preInsert'),
      table: table
      obj: obj
      user: auth.getUser()
    , (result) ->
      if not result
        return cb? []
      if Object.prototype.toString.call(obj) is '[object Array]'
        exec "INSERT INTO #{table} SELECT * FROM ?", [obj], null, isServer, cb
      else
        exec "INSERT INTO #{table} VALUES ?", [obj], null, isServer, cb
  upsert = (table, obj, whereObj, cb, isServer) ->
    where = makeWhere whereObj
    if where.sql
      where.sql = " WHERE #{where.sql}"
    test = exec "SELECT * FROM #{table}#{where.sql}", where.props, null, isServer
    if test and test.length and where.sql
      update table, obj, whereObj, cb, isServer
    else
      insert table, obj, cb, isServer
  del = (table, whereObj, cb, isServer) ->
    where = makeWhere whereObj
    if where.sql
      where.sql = " WHERE #{where.sql}"
    asyncCallback (if isServer then 'serverPreDelete' else 'preDelete'),
      table: table
      where: whereObj
      user: auth.getUser()
    , (result) ->
      if not result
        cb? []
      exec "DELETE FROM #{table}#{where.sql}", where.props, null, isServer, cb
    
  config: (args) ->
    Object.assign settings, args
  $get: ($http, $injector) ->
    http = $http
    if $injector.has 'Auth'
      auth = $injector.get 'Auth'
    start: ->
      if settings.database and settings.tables
        attachDatabase()
    exec: exec
    select: select 
    update: update
    insert: insert
    upsert: upsert
    delete: del
    on: (name, callback) ->
      callbacks[name].push callback
      @
    off: (name, callback) ->
      callbacks[name].splice callbacks[name].indexOf(callback), 1
      @
module.run (ndxdb) ->
  ndxdb.start()
  
#some patching
alasql.yy.UniOp::toString = ->
  s = undefined
  if @op == '~'
    s = @op + @right.toString()
  if @op == '-'
    s = @op + @right.toString()
  if @op == '+'
    s = @op + @right.toString()
  if @op == '#'
    s = @op + @right.toString()
  if @op == 'NOT'
    s = @op + '(' + @right.toString() + ')'
  # Please avoid === here
  if @op == null
    # jshint ignore:line
    s = '(' + @right.toString() + ')'
  if not s
    s = @right.toString()
  s
alasql.yy.Select::toString = ->
  s = ''
  if @explain
    s += 'EXPLAIN '
  s += 'SELECT '
  if @modifier
    s += @modifier + ' '
  if @distinct
    s += 'DISTINCT '
  if @top
    s += 'TOP ' + @top.value + ' '
    if @percent
      s += 'PERCENT '
  s += @columns.map((col) ->
    `var s`
    s = col.toString()
    if typeof col.as != 'undefined'
      s += ' AS ' + col.as
    s
  ).join(', ')
  if @from
    s += ' FROM ' + @from.map((f) ->
      ss = f.toString()
      if f.as
        ss += ' AS ' + f.as
      ss
    ).join(',')
  if @joins
    s += @joins.map((jn) ->
      ss = ' '
      if jn.joinmode
        ss += jn.joinmode + ' '
      if jn.table
        ss += 'JOIN ' + jn.table.toString()
      else if jn.select
        ss += 'JOIN (' + jn.select.toString() + ')';
      else if jn instanceof alasql.yy.Apply
        ss += jn.toString()
      else
        throw new Error('Wrong type in JOIN mode')
      if jn.as
        ss += ' AS ' + jn.as
      if jn.using
        ss += ' USING ' + jn.using.toString()
      if jn.on
        ss += ' ON ' + jn.on.toString()
      ss
    )
  if @where
    s += ' WHERE ' + @where.toString()
  if @group and @group.length > 0
    s += ' GROUP BY ' + @group.map((grp) ->
      grp.toString()
    ).join(', ')
  if @having
    s += ' HAVING ' + @having.toString()
  if @order and @order.length > 0
    s += ' ORDER BY ' + @order.map((ord) ->
      ord.toString()
    ).join(', ')
  if @limit
    s += ' LIMIT ' + @limit.value
  if @offset
    s += ' OFFSET ' + @offset.value
  if @union
    s += ' UNION ' + (if @corresponding then 'CORRESPONDING ' else '') + @union.toString()
  if @unionall
    s += ' UNION ALL ' + (if @corresponding then 'CORRESPONDING ' else '') + @unionall.toString()
  if @except
    s += ' EXCEPT ' + (if @corresponding then 'CORRESPONDING ' else '') + @except.toString()
  if @intersect
    s += ' INTERSECT ' + (if @corresponding then 'CORRESPONDING ' else '') + @intersect.toString()
  s