/*global process */
var http = require('http');
var express = require('express');
var cors = require('cors')
var jsforceAjaxProxy = require('./proxy');
var jsforce = require("jsforce");
require('dotenv').config()

var app = express();

var oauth2 = new jsforce.OAuth2({
	clientId: process.env.CLIENTID,
	clientSecret: process.env.SECRET,
	redirectUri: process.env.REDIRECTURI,
	state: "test"
});

var sandboxOauth2 = new jsforce.OAuth2({
	clientId: process.env.CLIENTID,
	clientSecret: process.env.SECRET,
	redirectUri: process.env.REDIRECTURI,
	state: "test",
	loginUrl: 'https://test.salesforce.com'
});

var whitelist = []
if (process.env.CORSPRODURL) {
	let pattern = new RegExp(process.env.CORSPRODURL);
	whitelist.push(pattern)
}
if (process.env.CORSDEVURL) {
	let pattern = new RegExp(process.env.CORSDEVURL);
	whitelist.push(pattern)
}
var corsOptions = {
	origin: function (origin, callback) {
		if (regCheck(origin)) {
			callback(null, true)
		} else {
			callback(new Error('Not allowed by CORS'))
		}
	}
}
function regCheck(url) {
	for (let i = 0; i < whitelist.length; i++) {
		if (whitelist[i].test(url)) {
			return whitelist[i].test(url);
			break;
		}
	}
	return false;
}
app.set('port', process.env.PORT || 3123);

if (process.env.NODE_ENV === 'development') {
	app.use(express.errorHandler());
}

app.all('/proxy/?*', jsforceAjaxProxy({ enableCORS: true }));

app.get('/oauthurl/', cors(corsOptions), function (req, res) {
	console.log(req.query)
	let sandbox = req.query.sandbox;
	let authURI;
	if (sandbox == 'true') {
		console.log("sandbox")
		authURI = sandboxOauth2.getAuthorizationUrl({ scope: "full api id web refresh_token" });
	} else {
		authURI = oauth2.getAuthorizationUrl({ scope: "full api id web refresh_token" });
	}
	authURI = authURI + "&prompt=login";
	res.send(authURI);
});
app.get('/oauthurlauthorize/', cors(corsOptions), async function (req, res) {
	let conn;
	console.log(req.query)
	let sandbox = req.query.sandbox;
	if (sandbox == 'true') {
		console.log("sandbox")
		conn = new jsforce.Connection({
			oauth2: sandboxOauth2,
		});
	} else {
		conn = new jsforce.Connection({
			oauth2: oauth2,
		});
	}

	token = await conn.authorize(req.query.code);

	let bearer = [];
	let bearerVals = {};
	bearerVals.instanceUrl = conn.instanceUrl;
	bearerVals.accessToken = conn.accessToken;
	bearerVals.userInfo = conn.userInfo.id;
	bearer.push(bearerVals);

	let result = JSON.stringify(bearer);
	res.send(result);
});
app.get('/', function (req, res) {
	res.send('JSforce AJAX Proxy');
});

http.createServer(app).listen(app.get('port'), function () {
	console.log("Express server listening on port " + app.get('port'));
});
