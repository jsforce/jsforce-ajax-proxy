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

```javascript
var conn = new jsforce.Connection({
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
app.all('/proxy/?*', jsforceAjaxProxy({ enableCORS: true }));
```

## Redirects

The proxy does not follow redirects. A redirect response from the endpoint is returned to the client, and following it is up to the client: to follow it, the client sends the request for the redirect URL through the proxy again, with the method and body that the redirect status calls for. The proxy checks that request like any other, so every request goes only to a Salesforce domain.

Browsers do not let scripts read the status or the `Location` header of a redirect response when `fetch` is called with `redirect: 'manual'`. A client in the browser can send the `SalesforceProxy-Redirect: report` request header, and the proxy then returns a redirect response (301, 302, 303, 307 or 308 with a `Location` header) as a 200 response with these headers instead:

- `SalesforceProxy-Redirect-Status`: the status code of the redirect response
- `SalesforceProxy-Redirect-Location`: the redirect URL, made absolute

This response has an empty body and `Cache-Control: no-store`. The other headers of the redirect response are kept, except `Location` and the headers about the body (`Content-Length`, `Content-Type` and `Content-Encoding`). If `Location` is not a valid URL, the proxy returns 502. Without the request header, redirect responses are returned as they are, with `SalesforceProxy-Redirect` added to `Vary`.

The client has to support this request header. Clients that do not send it get redirect responses as before.

In all responses, the headers that apply only to the connection with the endpoint, such as `Connection` and `Keep-Alive`, are not passed to the client. With `enableCORS`, the CORS headers of the endpoint response are not passed either, so the proxy's own CORS headers are kept.

## Note

You don't have to use this app when you are building a JSforce app in Visualforce,
because it works in the same domain as Salesforce API.

