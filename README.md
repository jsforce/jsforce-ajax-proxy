# JSforce AJAX Proxy

A proxy server to access Salesforce API from JSforce JavaScript apps served outside of Salesforce.

As the same origin policy restricts communication to the Salesforce API from outer domain,
you should serve cross-domain proxy server when you build a app using JSforce outside of Salesforce.

As Salesforce REST API supports CORS (Cross-Origin Resource Sharing) access, this proxy is not always required when you are using only REST API and you can change security setting in your connecting organization. This proxy is still useful because you can access not only REST APIs but also SOAP-based APIs from outer domain.

## Usage

Start proxy server in your server environment which can run Node.js app (Heroku is the one you might choose).

Install required packages :

```
$ npm install
```

Run proxy server :

```
$ npm start
```

When you use JSforce in your JavaScript app, set `proxyUrl` when creating `Connection` instance. 

```
var conn = jsforce.Connection({
  accessToken: '<access_token>',
  instanceUrl: '<instance_url>',
  proxyUrl: 'https://your-ajax-proxy-service.herokuapp.com/proxy/'
});

conn.query('SELECT Id, Name FROM Account', function(err, res) {
  // ...
});
```

## Using as Middleware

Ajax proxy is not only provided in standalone server but also works as connect middleware.
You can include the proxy functionality in your express.js app.

First install `jsforce-ajax-proxy` in your app project:

```
$ npm install jsforce-ajax-proxy --save
```

Then include the middleware under certain path:

```javascript
var express = require('express');
var jsforceAjaxProxy = require('jsforce-ajax-proxy');
var app = express();

app.all('/proxy/?*', jsforceAjaxProxy());
```

If you want to accept http request from other origin, set `enableCORS` option to true.

```javascript
app.all('/proxy/?*', jsforceAjaxProxy({ enableCORS: true });
```


## Note

You don't have to use this app when you are building a JSforce app in Visualforce,
because it works in the same domain as Salesforce API.

