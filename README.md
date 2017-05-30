# ndxdb-client
* clientside database for [ndx-framework](https://github.com/ndxbxrme/ndx-framework) or angular apps  
* built on top of the mighty [alasql](https://github.com/agershun/alasql)  

### Usage  
`bower install --save ndxdb`  
```coffeescript
angular.module 'myApp', ['ndx']
.config (ndxdbProvider) ->
  ndxdbProvider.config
    tables: ['users', 'countries']
.controller 'MyCtrl', ($scope, ndxdb) ->
  ndxdb.insert 'users',
    name: 'jeff'
  ndxdb.select 'users', null, (users) ->
    console.log users
```

### Configuration

Inject `ndxdbProvider` into a config block and call it's `.config()` function to configure the database.  

```coffeescript
ndxdbProvider.config
  autoId: '_id' # id column [String] defaults to _id
  database: 'db' # dabase name [String] defaults to db
  tables: [true, 'people'] # list of tables, can be a Boolean, String or and Array of Booleans and Strings
    # if set to true then table names are grabbed from ndx-rest endpoints
  data: [object data, string url, function data] # source/sources of data to prefill the database with
  maxSqlCacheSize: 50 # number of unique statements saved to cache before it gets reset
```



### Methods
<a name="methods"></a>

#### `ndxdb.on(string callbackName, function callbackFn) -> db`

Register a callback
- *`ready`*  - the database is ready to use
- *`preSelect`* - data is about to be fetched from the database
- *`select`* - data has been fetched from the database
- *`preInsert`* - data is about to be inserted into the database
- *`insert`* - data has been inserted into the database
- *`preUpdate`* - data is about to be updated in the database
- *`update`* - data has been updated in the database
- *`preDelete`* - data is about to be deleted  
- *`delete`* - data has been deleted  

callbacks can be used to modify data flowing to and from the database.  

#### `ndxdb.off(string callbackName, function callback) -> db`

Unregister a callback

#### `db.select(string table, object whereObj, function callback)`

Select data  

#### `db.insert(string table, object insertObj, function callback)`

Insert data

#### `db.update(string table, object updateObj, object whereObj, function callback)`

Update data

#### `db.upsert(string table, object upsertObj, object whereObj, function callback)`

Upsert data

#### `db.delete(string table, object whereObj, function callback)`

Delete data  

#### `db.exec(string sql, array props, bool notCritical) -> data`

Execute an SQL command
