# ndxdb-client
* clientside database for [ndx-framework](https://github.com/ndxbxrme/ndx-framework) apps  
## Usage  
`bower install --save ndxdb`  
```coffeescript
angular.module 'myApp', []
.config (ndxdbProvider) ->
  ndxdbProvider.config
    tables: ['users', 'countries']
.controller 'MyCtrl', ($scope, ndxdb) ->
  ndxdb.insert 'users',
    name: 'jeff'
  ndxdb.select 'users', null, (users) ->
    console.log users
```