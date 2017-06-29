/*global process */
var http = require('http');
var express = require('express');
var jsforceAjaxProxy = require('./proxy');
var proxyAuth = require('./express-proxy-auth');

var app = express();

if (process.env.ENABLE_AUTH === 'true') {
  var userName = process.env.USER_NAME;
  var password = process.env.PASSWORD;

  if (!userName || !password) {
    throw new Error("User name or password for basic authentication is not set.");
  }

  var users = {};
  users[userName] = password;

  app.use(proxyAuth({users}));
}

app.configure(function () {
  app.set('port', process.env.PORT || 3123);
});

app.configure('development', function () {
  app.use(express.errorHandler());
});

app.all('/proxy/?*', jsforceAjaxProxy({
  enableCORS: !process.env.DISABLE_CORS || process.env.DISABLE_CORS === 'false',
  allowedOrigin: process.env.ALLOWED_ORIGIN
}));

app.get('/', function(req, res) {
  res.send('JSforce AJAX Proxy');
});

http.createServer(app).listen(app.get('port'), function () {
  console.log("Express server listening on port " + app.get('port'));
});
