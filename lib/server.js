/*global process */
var http = require('http');
var express = require('express');
var jsforceAjaxProxy = require('./proxy');

var app = express();

app.configure(function () {
  app.set('port', process.env.PORT || 3123);
});

app.configure('development', function () {
  app.use(express.errorHandler());
});

app.all('/proxy/?*', jsforceAjaxProxy({ enableCORS: true }));

app.get('/', function(req, res) {
  res.send('JSforce AJAX Proxy');
});

http.createServer(app).listen(app.get('port'), function () {
  console.log("Express server listening on port " + app.get('port'));
});
