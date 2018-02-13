'use strict'
module = null
try
  module = angular.module 'ndx'
catch e
  module = angular.module 'ndx', []
module.provider 'ndxdb', ->
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
    selectTransform: []
    restore: []
  generateId = (num) ->
    chars = 'abcdef1234567890'
    output = new Date().valueOf().toString(16)
    i = output.length
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
  makeTable = (table, cb) ->
    type = Object.prototype.toString.call table
    switch type
      when '[object Array]'
        async.eachSeries table, (item, callback) ->
          makeTable item, callback
        , cb
      when '[object String]'
        alasql "CREATE TABLE IF NOT EXISTS #{table}"
        cb?()
  attachDatabase = ->
    alasql "CREATE localStorage DATABASE IF NOT EXISTS `#{settings.database}`"
    #alasql "DROP localStorage DATABASE #{settings.database}; CREATE localStorage DATABASE #{settings.database}"
    alasql "ATTACH localStorage DATABASE `#{settings.database}` AS `#{settings.database}`"
    alasql "USE `#{settings.database}`"
    database = alasql.databases["#{settings.database}"]
    firstTime = true
    ###
    for t of database.tables
      firstTime = false
      alasql "DELETE FROM #{t}"
    ###
    if settings.maxSqlCacheSize
      alasql.MAXSQLCACHESIZE = settings.maxSqlCacheSize
    maintenanceMode = false
    syncCallback 'ready'

  readDiffs = (from, to, out) ->
    diffs = DeepDiff.diff from, to
    out = out or {}
    if diffs
      for dif in diffs
        switch dif.kind
          when 'E', 'N'
            myout = out
            mypath = dif.path.join('.')
            good = true
            if dif.lhs and dif.rhs and typeof(dif.lhs) isnt typeof(dif.rhs)
              if dif.lhs.toString() is dif.rhs.toString()
                good = false
            if good
              myout[mypath] ={}
              myout = myout[mypath]
              myout.from = dif.lhs
              myout.to = dif.rhs
    out
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
  maxModified = (table, cb) ->
    database.exec 'SELECT MAX(modifiedAt) as maxModified FROM ' + table, null, (result) ->
      maxModified = 0
      if result and result.length
        maxModified = result[0].maxModified or 0
      cb? maxModified
  getDocsToUpload = (table, cb) ->
    database.exec "SELECT * FROM #{table} WHERE modifiedAt=0", null, (result) ->
      if result and result.length
        return cb? result
      cb? null
  makeWhere = (whereObj) ->
    if not whereObj or whereObj.sort or whereObj.sortDir or whereObj.pageSize
      return sql: ''
    props = []
    parent = ''

    parse = (obj, op, comp) ->
      sql = ''
      writeVal = (key, comp) ->
        fullKey = "#{parent}`#{key}`".replace /\./g, '->'
        fullKey = fullKey.replace /->`\$[a-z]+`$/, ''
        if obj[key] is null
          if key is '$ne' or key is '$neq'
            sql += " #{op} #{fullKey} IS NOT NULL"
          else
            sql += " #{op} #{fullKey} IS NULL"
        else
          sql += " #{op} #{fullKey} #{comp} ?"
          props.push obj[key]
      for key of obj
        if key is '$or'
          orsql = ''
          for thing in obj[key]
            objsql = parse(thing, 'AND', comp).replace /^ AND /, ''
            if / AND | OR /.test(objsql) and objsql.indexOf('(') isnt 0
              objsql = "(#{objsql})"
            orsql += ' OR ' + objsql
          sql += " #{op} (#{orsql})".replace /\( OR /g, '('
        else if key is '$and'
          andsql = ''
          for thing in obj[key]
            andsql += parse(thing, 'AND', comp)
          sql += " #{op} (#{andsql})".replace /\( AND /g, '('
        else if key is '$gt'
          writeVal key, '>'
        else if key is '$lt'
          writeVal key, '<'
        else if key is '$gte'
          writeVal key, '>='
        else if key is '$lte'
          writeVal key, '<='
        else if key is '$eq'
          writeVal key, '='
        else if key is '$neq'
          writeVal key, '!='
        else if key is '$ne'
          writeVal key, '!='
        else if key is '$in'
           writeVal key, 'IN'
        else if key is '$nin'
           writeVal key, 'NOT IN'
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
          parent += '`' + key + '`->'
          sql += parse(obj[key], op, comp)
        else
          writeVal key, comp
      parent = ''
      sql
    delete whereObj['#']
    sql = parse(whereObj, 'AND', '=').replace(/(^|\() (AND|OR) /g, '$1')
    {
      sql: sql
      props: props
    }
  select = (table, args, cb, isServer) ->
    ((user) ->
      asyncCallback (if isServer then 'serverPreSelect' else 'preSelect'), 
        table: table
        args: args
        user: user
      , (result) ->
        if not result
          return cb? [], 0
        args = args or {}
        where = makeWhere if args.where then args.where else args
        sorting = ''
        if args.sort
          if Object.prototype.toString.call(args.sort) is '[object Object]'
            sorting += ' ORDER BY '
            i = 0
            for key of args.sort
              if i++ > 0
                sorting += ', '
              bit = args.sort[key]
              mykey = key.replace /\./g, '->'
              if bit is 1 or bit is 'ASC'
                sorting += "`#{mykey}` ASC"
              else
                sorting += "`#{mykey}` DESC"
          else
            args.sort = args.sort.replace /\./g, '->'
            sorting += " ORDER BY `#{args.sort}`"
            if args.sortDir
              sorting += " #{args.sortDir}"
        if where.sql
          where.sql = " WHERE #{where.sql}"
        myCb = (output) ->
          asyncCallback (if isServer then 'serverSelect' else 'select'), 
            table: table
            objs: output
            isServer: isServer
            user: user
          , ->
            total = output.length
            if args.page or args.pageSize
              args.page = args.page or 1
              args.pageSize = args.pageSize or 10
              output = output.splice (args.page - 1) * args.pageSize, args.pageSize
            asyncCallback (if isServer then 'serverSelectTransform' else 'selectTransform'),
              table: table
              objs: output
              isServer: isServer
              user: user
            , ->
              cb? output, total
        output = exec "SELECT * FROM #{table}#{where.sql}#{sorting}", where.props, null, isServer,  myCb
    )(auth.getUser())
  cleanObj = (obj) ->
    for key of obj
      if key.indexOf('$') is 0 or key is '#'
        delete obj[key]
    return
  update = (table, obj, whereObj, cb, isServer) ->
    cleanObj obj
    obj.modifiedAt = obj.modifiedAt or 0
    where = makeWhere whereObj
    if where.sql
      where.sql = " WHERE #{where.sql}"
    ((user) ->
      exec "SELECT * FROM #{table}#{where.sql}", where.props, null, true, (oldItems) ->
        if oldItems
          async.each oldItems, (oldItem, diffCb) ->
            diffs = readDiffs oldItem, obj
            id = getId oldItem
            asyncCallback (if isServer then 'serverPreUpdate' else 'preUpdate'),
              id: id
              table: table
              obj: obj
              oldObj: oldItem
              where: whereObj
              changes: diffs
              user: user
            , (result) ->
              if not result
                return cb? []
              updateSql = []
              updateProps = []
              for key of obj
                if where.props.indexOf(obj[key]) is -1
                  updateSql.push " `#{key}`=? "
                  updateProps.push obj[key]
              updateProps.push id
              exec "UPDATE #{table} SET #{updateSql.join(',')} WHERE `#{[settings.autoId]}`= ?", updateProps, null, isServer, diffCb, diffs
          , ->
            cb? []
        else
          cb? []
    )(auth.getUser())
  insert = (table, obj, cb, isServer) ->
    cleanObj obj
    obj.modifiedAt = obj.modifiedAt or 0
    ((user) ->
      asyncCallback (if isServer then 'serverPreInsert' else 'preInsert'),
        table: table
        obj: obj
        user: user
      , (result) ->
        if not result
          return cb? []
        if Object.prototype.toString.call(obj) is '[object Array]'
          exec "INSERT INTO #{table} SELECT * FROM ?", [obj], null, isServer, cb
        else
          exec "INSERT INTO #{table} VALUES ?", [obj], null, isServer, cb
    )(auth.getUser())
  upsert = (table, obj, whereObj, cb, isServer) ->
    where = makeWhere whereObj
    if not whereObj and obj[settings.autoId]
      whereObj = {}
      whereObj[settings.autoId] = obj[settings.autoId]
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
    ((user) ->
      asyncCallback (if isServer then 'serverPreDelete' else 'preDelete'),
        table: table
        where: whereObj
        user: user
      , (result) ->
        if not result
          cb? []
        exec "DELETE FROM #{table}#{where.sql}", where.props, null, isServer, cb
    )(auth.getUser())  
    
  config: (args) ->
    Object.assign settings, args
  $get: ($injector, $rootElement) ->
    settings.database = $rootElement.attr('ng-app')
    if $injector.has 'Auth'
      auth = $injector.get 'Auth'
    start: ->
      if settings.database
        attachDatabase()
    exec: exec
    select: select 
    update: update
    insert: insert
    upsert: upsert
    delete: del
    makeTable: makeTable
    maxModified: maxModified
    getDocsToUpload: getDocsToUpload
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