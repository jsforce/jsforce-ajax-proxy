/*global process */
var http = require('http');
var https = require('https');
var express = require('express');
var cors = require('cors')
var jsforceAjaxProxy = require('./proxy');
var jsforce = require("jsforce");
var decode = require('decode-html');
var axios = require('axios');
var FormData = require('form-data');
const Blob = require('node-blob');

require('dotenv').config();

const fetch = require("node-fetch");
const fetchBase64 = require('fetch-base64');

var app = express();
app.use(express.json({limit: "50mb"}));
app.use(express.urlencoded());
app.use(cors());

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
	console.log("Start :: oauthurl", JSON.stringify(req.query));
	let sandbox = req.query.sandbox;
	let host = req.query.host;
	let authURI;
	try {
	if (sandbox == 'true') {
		//console.log("sandbox");
		if(host == "extension"){
			sandboxOauth2ReqOptions.redirectUri = process.env.EXTENSIONREDIRECTURI
		}else{
			sandboxOauth2ReqOptions.redirectUri = process.env.REDIRECTURI
		}
		var sandboxOauth2 = new jsforce.OAuth2(sandboxOauth2ReqOptions);
		authURI = sandboxOauth2.getAuthorizationUrl({ scope: "api id refresh_token" });
		console.log("oauthurl host", host);
		console.log("oauthurl Sandbox", authURI);
	} else {
		if(host == "extension"){
			//console.log("From Chrome")
			oauth2ReqOptions.redirectUri = process.env.EXTENSIONREDIRECTURI
		}else{
			oauth2ReqOptions.redirectUri = process.env.REDIRECTURI
			//console.log("Others")
		}
		var oauth2 = new jsforce.OAuth2(oauth2ReqOptions);
		authURI = oauth2.getAuthorizationUrl({ scope: "api id refresh_token" });
		console.log("oauthurl host", host);
		console.log("oauthurl Production", authURI);
	}
	authURI = authURI + "&prompt=login";

	console.log("oauthurl", process.env.REDIRECTURI);
	console.log("oauthurl", process.env.EXTENSIONREDIRECTURI);
	

	console.log("End :: oauthurl", authURI);

	res.send(authURI);
	} catch (error) {
		console.log("Error :: oauthurl ", error);
		res.send(error);
	}
});
app.get('/oauthurlauthorize/', cors(corsOptions), async function (req, res) {
	console.log("Start:: oauthurlauthorize", JSON.stringify(req.query));
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
		console.log("oauthurlauthorize Sandbox", oauth2ReqOptions);
		console.log("oauthurlauthorize Sandbox", conn);
	} else {
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
		console.log("oauthurlauthorize Production", oauth2ReqOptions);
		console.log("oauthurlauthorize Production", conn);
	}

	token = await conn.authorize(req.query.code);

	let bearer = [];
	let bearerVals = {};
	bearerVals.instanceUrl = conn.instanceUrl;
	bearerVals.accessToken = conn.accessToken;
	bearerVals.userInfo = conn.userInfo.id;
	bearer.push(bearerVals);

	let result = JSON.stringify(bearer);
	console.log("End:: oauthurlauthorize", result);

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
	let checkOnError = false;
	try{
		if(qryParams.qry.includes("SELECT FirstName, LastName, FullPhotoUrl, Username") && qryParams.qry.includes("FROM User")){
			result = await conn.query(qryParams.qry);
			//console.log("for user detail", result.records[0].FullPhotoUrl)

			var requestOptions = {
				method: 'GET',
				headers: {
					"Authorization": "Bearer " + qryParams.token,
				}
			};
			  
			let photo = await fetch(result.records[0].FullPhotoUrl, requestOptions);
			photo = await photo.blob();
			photo = toBase64(await photo.arrayBuffer());
			photo = 'data:image/png;base64,'+photo;
			result.records[0].FullPhotoUrl = photo;
			res.send(result);
		}
		else{
			let data = [];
			result = await conn.query(qryParams.qry)
				.on("record", (record) => {
					data.push(record);
				})
				.on("end", async () => {
					let resultData = {
						records: data
					}
					res.send(resultData);
				})
				.on("error", (err) => {
					checkOnError = true;
					console.log("qry function inner ", err);
					res.send(err);
				})
				.run({
					autoFetch: true,
					maxFetch: 5000
				});
		}
		
	}catch(err){
		if(!checkOnError){
			console.log("qry function ", err);
			res.send(err);
		}
	}
});
// app.get('/insert/', cors(corsOptions), async function (req, res) {
// 	let conn, result;
// 	let qryParams = req.query;
// 	let sandbox = req.query.sandbox;
// 	conn = new jsforce.Connection({
// 		instanceUrl : qryParams.instanceURL,
// 		accessToken : qryParams.token
// 	});
// 	try {
// 		result = await conn.sobject(qryParams.objName).create(JSON.parse(qryParams.recList),
// 		   function(err, rets) {
// 			 if (err) { return console.error(err); }else{
// 				return rets;
// 			 }
// 			 for (var i=0; i < rets.length; i++) {
// 			   if (rets[i].success) {
// 				 console.log("Upserted Successfully Created record id : " + rets[i].id);
// 			   }
// 			 }
// 		   });
// 		res.send(result);		
// 	} catch (error) {
// 		res.send(error);
// 	}	
// });
app.post('/insert/', async function (req, res) {
	let conn, result;
	let qryParams = req.query;
	let sandbox = req.query.sandbox;
	let body = req.body;
	//console.log("body here", body);
	conn = new jsforce.Connection({
		instanceUrl: qryParams.instanceURL,
		accessToken: qryParams.token
	});
	try {
		result = await conn.sobject(qryParams.objName).create(body,
			function (err, rets) {
				//console.log("err", err);
				//console.log("ret", rets);
				if (err) { return console.error(err); } else {
					return rets;
				}
			});
		console.log("result", result);
		res.send(result);
	} catch (error) {
		console.log("error", error);
		res.send(error);
	}
});
app.get('/kbsearch/', cors(corsOptions), async function (req, res) {
	console.log(req.query, req.query.isLogUserActivity);
	let qryParams = req.query;
    //var raw = JSON.stringify(qrySet(qryParams.currCat, qryParams.srhTxt, qryParams.categories, qryParams.tags, qryParams.isLogUserActivity, qryParams.channel, qryParams.origin));
	let categories = qryParams.categories ? qryParams.categories : [];
	let tags = qryParams.tags ? qryParams.tags : [];
	let categoryMatch = qryParams.categoryMatch?qryParams.categoryMatch:'OR';
	let tagMatch = qryParams.tagMatch?qryParams.tagMatch:'OR';
	let filterAndOr = qryParams.filterAndOr?qryParams.filterAndOr:'true';
	let userActivity =  {
		isLogUserActivity: true, 
		channel: qryParams.channel, 
		origin: qryParams.origin,
		transactionId: ''
	}

	var raw = JSON.stringify(qrySet(qryParams.currCat, qryParams.srhTxt, categories, tags, categoryMatch, tagMatch, filterAndOr, userActivity));
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
	try {
		response = await fetch(qryParams.instanceURL+"/services/apexrest/avnio/LibrarySearch", requestOptions);
	} catch (error) {
		console.error("Fetch Error", error);
	}
	if(response.status === 200){
        response = await response.text();
    }
	if(response.status != 401 && response.status != 500){
		if(Array.isArray(response) && JSON.parse(response)?.length == 0){
			response = [{"questionId":"1", "noresult": true, "answers":[{"source":null,"sfid":null,"score":0.0,"questions":[],"metadata":[],"id":"1","answer":"Sorry, No matching result found! Please try searching in a different way."}]}];  
			response = JSON.stringify(response);
		}
		let newResponse = JSON.parse(response);
		try {
			var requestOptions = {
				method: 'GET',
				headers: {
					"Authorization": "Bearer " + qryParams.token
				},
				redirect: 'follow'
			};
			for(let i=0; i<newResponse[0].answers.length;i++){
				let sfid = newResponse[0].answers[i].sfid;
				let answer = newResponse[0].answers[i].answer;
				newResponse[0].answers[i].answer = await generateImageBlob(answer, sfid, qryParams, requestOptions, "avnio__Response__c");

				if(newResponse[0].answers[i].alternativeAnswers){
					for(let j=0; j<newResponse[0].answers[i].alternativeAnswers.length;j++){
						let altAnswer = newResponse[0].answers[i].alternativeAnswers[j].answer;
						let altsfid = newResponse[0].answers[i].alternativeAnswers[j].id;
						newResponse[0].answers[i].alternativeAnswers[j].answer = await generateImageBlob(altAnswer, altsfid, qryParams, requestOptions, "avnio__AlternativeAnswer__c");
					}
				}
			}
		} catch (error) {
			console.log("ResultTemp Error", error);
		}
		res.send(newResponse);
	}
	else{
		res.send('AccessError');
	}
});
app.get('/questionuserfetch/', cors(corsOptions), async function (req, res) {
	let conn, result;
	let qryParams = req.query;
	let sandbox = req.query.sandbox;
	conn = new jsforce.Connection({
		instanceUrl : qryParams.instanceURL,
		accessToken : qryParams.token
	});
	try{
		result = await conn.query(qryParams.qry);
		let usersList = result.records;		
		let userResponseList = {};

		if(usersList != null && usersList != ''){
			for (const user of usersList) {
				let userObj = {};
				userObj.Name = user.Name;
				userObj.FirstName = user.FirstName;
				userObj.LastName = user.LastName;
				userObj.AvatarName = getAvatarName(user.Name, user.FirstName, user.LastName);
				userObj.SmallPhotoUrl = getPhotoUrl(user.SmallPhotoUrl);			
				if(userObj.SmallPhotoUrl != null){
					// Photo Blob logic
					var requestOptions = {
						method: 'GET',
						headers: {
							"Authorization": "Bearer " + qryParams.token,
						}
					};
		
					let photo = await fetch(userObj.SmallPhotoUrl, requestOptions);
					photo = await photo.blob();
					photo = toBase64(await photo.arrayBuffer());
					photo = 'data:image/png;base64,'+photo;
					userObj.PhotoBlob = photo;				
				}
				else{
					userObj.PhotoBlob = '';
				}	
				userResponseList[user.Id] = userObj;
			}
		}
		res.send(userResponseList);
	}catch(err){
		res.send(err);
	}
});
app.get('/projectdetailfetch/', cors(corsOptions), async function (req, res) {
	let qryParams = req.query;
	if(qryParams.objectApiName && qryParams.fieldSetApiName){		
		var rawObj = {};
		rawObj.projectId = qryParams.projectId;
		rawObj.objectApiName = qryParams.objectApiName;
		rawObj.fieldSetApiName = qryParams.fieldSetApiName;

		var raw = JSON.stringify(rawObj);
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
		response = await fetch(qryParams.instanceURL+"/services/apexrest/avnio/ProjectDetails", requestOptions);
		if(response.status === 200){
			response = await response.text();
			res.send(response);
		}
		else{
			res.send('Error');
		}
	}
	else{
		res.send('Error');
	}	
});
app.get('/questionfieldfetch/', cors(corsOptions), async function (req, res) {
	let qryParams = req.query;
	if(qryParams.objectApiName && qryParams.fieldSetApiName){		
		var rawObj = {};
		rawObj.objectApiName = qryParams.objectApiName;
		rawObj.fieldSetApiName = qryParams.fieldSetApiName;

		var raw = JSON.stringify(rawObj);
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
		response = await fetch(qryParams.instanceURL+"/services/apexrest/avnio/ProjectQueFieldSets", requestOptions);
		if(response.status === 200){
			response = await response.text();
			res.send(response);
		}
		else{
			res.send('Error');
		}
	}
	else{
		res.send('Error');
	}	
});
app.get('/imagebyversiondata/', cors(corsOptions), async function (req, res) {
	let qryParams = req.query
	var requestOptions = {
        method: 'GET',
        headers: {
			"Authorization": "Bearer " + qryParams.token,
			"Content-Type": "image/png"
		},
        redirect: 'follow'
    };
    let response = await fetch(qryParams.instanceURL+qryParams.imgURL, requestOptions);
    response = await response.blob();
	response = toBase64(await response.arrayBuffer());
	response = 'data:image/png;base64,'+response;
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
app.post('/uploadfile/', async function (req, res) {

	let conn, result, templateParams;
	let qryParams = req.query;
	let fileName = qryParams.fileName;
	let currentProjectId = qryParams.currentProjectId;
	let uploadType = (qryParams.uploadType=="template") ? true : false;
	let fileContent = req.body;
	console.log("fileContent", fileContent.contentData)
	conn = new jsforce.Connection({
		instanceUrl : qryParams.instanceURL,
		accessToken : qryParams.token
	});
	try {
		result = await conn.sobject('ContentVersion').create({
			PathOnClient : fileName,
			VersionData : fileContent.contentData,
			avnio__IsActive__c: uploadType,
			avnio__IsTemplate__c: uploadType,
		});
		console.log("result", result);
		if(!uploadType){
			let ids = await conn.query("select ContentDocumentId from ContentVersion where Id='" + result.id + "'");
			result = await conn.sobject("ContentDocumentLink").create({ 
				ContentDocumentId : ids.records[0].ContentDocumentId,
				LinkedEntityId : currentProjectId,
				ShareType:'I'
			});
			console.log("Upload As Project File");
		}
		console.log("linkContentVersion", result)
		return res.send(result);

	} catch (error) {
		console.log("error", error);
		return res.send(error);
	}
});
app.get('/', function (req, res) {
	res.send('JSforce AJAX Proxy');
});
function getPhotoUrl(photoUrl) { 
	return ((photoUrl == '' || photoUrl == null || photoUrl.endsWith('profilephoto/005/T')) ? null : photoUrl);
}
function getAvatarName(Name, firstName, lastName){
	let avatarName = '';
	if(Name != '' && Name != null && Name.indexOf(" ") != -1){
		let nameArray = Name.split(" ");
		avatarName = nameArray[0].substr(0, 1) + nameArray[1].substr(0, 1);
	}
	else if(firstName != '' && firstName != null && lastName != '' && lastName != null){
		avatarName = firstName.substr(0, 1) + lastName.substr(0, 1);
	}
	return avatarName.toLocaleUpperCase();
}
// Generate the Image Blob
async function generateImageBlob(answer, sfid, qryParams, requestOptions, objectName){
	var m,
		rex = /<img\b(?=\s)(?=(?:[^>=]|='[^']*'|="[^"]*"|=[^'"][^\s>]*)*?\ssrc=['"]([^"]*)['"]?)(?:[^>=]|='[^']*'|="[^"]*"|=[^'"\s]*)*"\s?\/?>/g;

	while ( m = rex.exec( answer ) ) {
		let imageURLCheck = m[1];
		const current_url = new URL(decode(m[1]));
		//console.log("current_url", imageURLCheck.includes("/servlet/"));
		if(imageURLCheck.includes("/servlet/")){
			const search_params = current_url.searchParams;
			var refid = search_params.get('refid');
			let imageResult;
						
			if(refid == undefined || refid == ''){
				let imageUrl = decode(imageURLCheck);
				imageResult = await fetch(imageUrl, requestOptions);
				/*
				let id = search_params.get('id');
				imageResult = await fetch(qryParams.instanceURL+"/services/data/v54.0/sobjects/Document/"+id+"/body", requestOptions);
				*/
			}
			else{
				imageResult = await fetch(qryParams.instanceURL+"/services/data/v51.0/sobjects/"+objectName+"/"+ sfid +"/richTextImageFields/avnio__Answer__c/"+refid, requestOptions)
			}

			imageResult = await imageResult.blob();
			let imageTag = toBase64(await imageResult.arrayBuffer());
			imageTag = 'data:image/png;base64,'+imageTag;
			answer = answer.replace(m[1], imageTag);
		}
	}
	return answer;
}
//function qrySet(currCat, srhText, categories, tags, isLogUserActivity, channel, origin){
function qrySet(currCat, srhText, categories, tags, categoryMatch, tagMatch, filterAndOr, userActivity){
    let value = 0;
    value = currCat;
    let requestBody = {};
    requestBody.questions = [];
    let question = {};
    question.QuestionText = srhText;
    question.Top = 20;
    question.Id = 1;
	if(categories != ''){
    	question.categories = categories.split(",");
	}else{
		question.categories = []
	}
	if(tags != ''){
		question.tags = tags.split(",");
	}else{
		question.tags = [];
	}
	
	question.categoryFilter = categoryMatch;
	question.tagFilter = tagMatch;
	question.andOr = filterAndOr=='true'?true:false;
	question.userActivity = userActivity;
	/*
	question.categoryFilter = 'OR';
	question.tagFilter = 'OR';
	question.andOr = true;
	*/
    // if(currCat != "all"){        
    //     question.categories.push(value);
    // }
	// question.userActivity = {
	// 	isLogUserActivity: (isLogUserActivity === 'true'),
	// 	channel: channel,
	// 	origin: origin,
	// }

    requestBody.questions.push(question);
    return requestBody;
}
function toBase64(arr) {
	//arr = new Uint8Array(arr) //if it's an ArrayBuffer
	//let newBuffer = new Buffer();
	return Buffer.from(arr, 'binary').toString('base64');
	return btoa(
	   arr.reduce((data, byte) => data + String.fromCharCode(byte), '')
	);
 }
http.createServer(app).listen(app.get('port'), function () {
	console.log("Express server listening on port " + app.get('port'));
});
