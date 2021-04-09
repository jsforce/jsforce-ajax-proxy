/*global process */
var http = require('http');
var express = require('express');
var cors = require('cors')
var jsforceAjaxProxy = require('./proxy');
var jsforce = require("jsforce");
require('dotenv').config();

const fetch = require("node-fetch");
const fetchBase64 = require('fetch-base64');

var app = express();

var oauth2ReqOptions = {
	clientId: process.env.CLIENTID,
	clientSecret: process.env.SECRET,
	redirectUri: process.env.REDIRECTURI,
	state: "test"
};

var sandboxOauth2ReqOptions = {
	clientId: process.env.CLIENTID,
	clientSecret: process.env.SECRET,
	redirectUri: process.env.REDIRECTURI,
	state: "test",
	loginUrl: 'https://test.salesforce.com'
};

var whitelist = []
if (process.env.CORSPRODURL) {
	let pattern = new RegExp(process.env.CORSPRODURL);
	whitelist.push(pattern)
}
if (process.env.CORSDEVURL) {
	let pattern = new RegExp(process.env.CORSDEVURL);
	whitelist.push(pattern)
}
if (process.env.EXTENSIONURL) {
	let pattern = new RegExp(process.env.EXTENSIONURL);
	whitelist.push(pattern)
}
var corsOptions = {
	origin: function (origin, callback) {

		if (regCheck(origin) || !origin) {
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
	let sandbox = req.query.sandbox;
	let host = req.query.host;
	let authURI;
	if (sandbox == 'true') {
		console.log("sandbox");
		if(host == "extension"){
			sandboxOauth2ReqOptions.redirectUri = process.env.EXTENSIONREDIRECTURI
		}else{
			sandboxOauth2ReqOptions.redirectUri = process.env.REDIRECTURI
		}
		var sandboxOauth2 = new jsforce.OAuth2(sandboxOauth2ReqOptions);
		authURI = sandboxOauth2.getAuthorizationUrl({ scope: "full api id web refresh_token" });
	} else {
		if(host == "extension"){
			console.log("From Chrome")
			oauth2ReqOptions.redirectUri = process.env.EXTENSIONREDIRECTURI
		}else{
			oauth2ReqOptions.redirectUri = process.env.REDIRECTURI
			console.log("Others")
		}
		var oauth2 = new jsforce.OAuth2(oauth2ReqOptions);
		authURI = oauth2.getAuthorizationUrl({ scope: "full api id web refresh_token" });
	}
	authURI = authURI + "&prompt=login";
	res.send(authURI);
});
app.get('/oauthurlauthorize/', cors(corsOptions), async function (req, res) {
	let conn;
	let sandbox = req.query.sandbox;
	let host = req.query.host;
	if (sandbox == 'true') {
		console.log("sandbox")
		if(host == "extension"){
			console.log("From Chrome");
			sandboxOauth2ReqOptions.redirectUri = process.env.EXTENSIONREDIRECTURI;
		}else{
			console.log("Others");
			sandboxOauth2ReqOptions.redirectUri = process.env.REDIRECTURI;
		}
		var sandboxOauth2 = new jsforce.OAuth2(sandboxOauth2ReqOptions);
		conn = new jsforce.Connection({
			oauth2: sandboxOauth2,
		});
	} else {
		console.log("oauth2ReqOptions", oauth2ReqOptions);
		if(host == "extension"){
			console.log("From Chrome");
			oauth2ReqOptions.redirectUri = process.env.EXTENSIONREDIRECTURI;
		}else{
			console.log("Others");
			oauth2ReqOptions.redirectUri = process.env.REDIRECTURI;
		}
		var oauth2 = new jsforce.OAuth2(oauth2ReqOptions);
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
app.get('/qry/', cors(corsOptions), async function (req, res) {
	let conn, result;
	let qryParams = req.query;
	let sandbox = req.query.sandbox;
	conn = new jsforce.Connection({
		instanceUrl : qryParams.instanceURL,
		accessToken : qryParams.token
	});
	try{
		result = await conn.query(qryParams.qry);
		res.send(result);
	}catch(err){
		res.send(err);
	}
});

app.get('/kbsearch/', cors(corsOptions), async function (req, res) {
	console.log(req.query);
	let qryParams = req.query;
    var raw = JSON.stringify(qrySet(qryParams.currCat, qryParams.srhTxt));
    var requestOptions = {
        method: 'POST',
        headers: {
			"Authorization": "Bearer " + qryParams.token,
			"Content-Type": "application/json"
		},
        body: raw,
        redirect: 'follow'
    };
    let response;
    response = await fetch(qryParams.instanceURL+"/services/apexrest/avnio/LibrarySearch", requestOptions);
    if(response.status === 200){
        response = await response.text();
    }
    if(JSON.parse(response).length == 0){
        response = [{"questionId":"1", "noresult": true, "answers":[{"source":null,"sfid":null,"score":0.0,"questions":[],"metadata":[],"id":"1","answer":"Sorry, I didn\'t get that. Please try asking in a different way."}]}];  
        response = JSON.stringify(response);
    }
    res.send(response);
});
app.get('/getimagedata/', cors(corsOptions), async function (req, res) {
	let conn, result;
	let qryParams = req.query;
	let qry = "select VersionData, Title, Description, FileType from ContentVersion where (FileType = 'PNG' or FileType = 'JPG') and  (Title like '%" + qryParams.srhtxt + "%' OR Description like '%" + qryParams.srhtxt + "%') order by lastmodifieddate desc LIMIT 5";
	let sandbox = req.query.sandbox;
	conn = new jsforce.Connection({
		instanceUrl : qryParams.instanceURL,
		accessToken : qryParams.token
	});
	try{
		result = await conn.query(qry);
	}catch(err){
		res.send(err);
	}
	for (let i=0; i<result.totalSize ;i++){

		const doFetchRemote = await fetchBase64.remote({ 
		  url: qryParams.instanceURL + result.records[i].VersionData, 
		  headers: { 
		    'Authorization': 'Bearer ' + qryParams.token 
		  } 
		});
		result.records[i].imgData = doFetchRemote[1];
	}
    return res.send(result);
});
app.get('/', function (req, res) {
	res.send('JSforce AJAX Proxy');
});
function qrySet(currCat, srhText){
    let value = 0;
    value = currCat;
    let requestBody = {};
    requestBody.questions = [];
    let question = {};
    question.QuestionText = srhText;
    question.Top = 5;
    question.Id = 1;
    question.categories = [];
    if(currCat != "all"){        
        question.categories.push(value);
    }
    requestBody.questions.push(question);
    return requestBody;
}
http.createServer(app).listen(app.get('port'), function () {
	console.log("Express server listening on port " + app.get('port'));
});
