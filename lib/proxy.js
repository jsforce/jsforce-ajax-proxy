var https = require('https');
var pipeline = require('stream').pipeline;
var debug = require('debug')('jsforce-ajax-proxy');

/**
 * Allowed request headers 
 */
var ALLOWED_HEADERS = [
  'Authorization',
  'Content-Type',
  'DPoP',
  'Salesforceproxy-Endpoint',
  'Salesforceproxy-Redirect',
  'X-Authorization',
  'X-SFDC-Session',
  'SOAPAction',
  'Sforce-Auto-Assign',
  'Sforce-Call-Options',
  'Sforce-Query-Options',
  'x-sfdc-packageversion-clientPackage',
  'If-Modified-Since',
  'X-User-Agent'
];

/**
 * Endpoint URL validation
 */
var SF_ENDPOINT_REGEXP =
  /^https:\/\/[a-zA-Z0-9\.\-]+\.(force|salesforce|cloudforce|database)\.com\//;

/**
 * Redirect status codes, which are reported in headers when the client asks for it
 */
var REDIRECT_STATUS_CODES = [301, 302, 303, 307, 308];

/**
 * Headers that apply only to the connection with the endpoint (RFC 9110, Section 7.6.1)
 */
var HOP_BY_HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
];

/**
 * Copy the endpoint response headers to the client response,
 * except the connection-specific ones and the given ones
 */
function copyResponseHeaders(proxyRes, res, options, excluded) {
  var connectionHeaders = String(proxyRes.headers.connection || '')
    .split(',')
    .map(function(name) { return name.trim().toLowerCase(); });
  Object.keys(proxyRes.headers).forEach(function(name) {
    if (HOP_BY_HOP_HEADERS.indexOf(name) >= 0 || connectionHeaders.indexOf(name) >= 0 ||
        excluded.indexOf(name) >= 0) {
      return;
    }
    // with CORS enabled, the proxy's own CORS headers are kept
    if (options.enableCORS && name.indexOf('access-control-') === 0) {
      return;
    }
    res.setHeader(name, proxyRes.headers[name]);
  });
}

/**
 * Add a field name to the Vary header of the response
 */
function addVary(res, name) {
  var vary = res.getHeader('vary');
  res.setHeader('Vary', vary ? vary + ', ' + name : name);
}

/**
 * Create middleware to proxy request to salesforce server
 */
module.exports = function(options) {

  options = options || {}
  var proxyCounter = 0;

  return function(req, res) {
    if (options.enableCORS) {
      res.header('Access-Control-Allow-Origin', options.allowedOrigin || '*');
      res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE');
      res.header('Access-Control-Allow-Headers', ALLOWED_HEADERS.join(','));
      res.header('Access-Control-Expose-Headers', 'SForce-Limit-Info,DPoP-Nonce,WWW-Authenticate,SalesforceProxy-Redirect-Status,SalesforceProxy-Redirect-Location');
      if (req.method === 'OPTIONS') {
        res.end();
        return;
      }
    }
    var sfEndpoint = req.headers["salesforceproxy-endpoint"];
    if (!SF_ENDPOINT_REGEXP.test(sfEndpoint)) {
      res.send(400, "Proxying endpoint is not allowed. `salesforceproxy-endpoint` header must be a valid Salesforce domain: " + sfEndpoint);
      return;
    }
    // pass through the incoming request headers except host, as the request module did when piped
    var headers = {};
    Object.keys(req.headers).forEach(function(name) {
      if (name !== 'host') {
        headers[name] = req.headers[name];
      }
    });
    ALLOWED_HEADERS.forEach(function(header) {
      header = header.toLowerCase();
      var value = req.headers[header]
      if (value) {
        var name = header === 'x-authorization' ? 'authorization' : header;
        headers[name] = req.headers[header];
      }
    });
    var params = {
      url: sfEndpoint || "https://login.salesforce.com//services/oauth2/token",
      method: req.method,
      headers: headers
    };
    proxyCounter++;
    debug("(++req++) " + new Array(proxyCounter+1).join('*'));
    debug("method=" + params.method + ", url=" + params.url);
    // redirects are not followed to other hosts, but returned to the client
    var proxyReq = https.request(params.url, {
      method: params.method,
      headers: headers
    }, function(proxyRes) {
      proxyCounter--;
      debug("(--res--) " + new Array(proxyCounter+1).join('*'));
      var location = proxyRes.headers.location;
      // an empty Location is a reference to the endpoint URL, not a missing header
      var isRedirect = REDIRECT_STATUS_CODES.indexOf(proxyRes.statusCode) >= 0 && typeof location === 'string';
      if (isRedirect && req.headers['salesforceproxy-redirect'] === 'report') {
        // browsers hide the status and headers of a redirect response from scripts,
        // so the redirect is reported in headers of a 200 response instead
        var redirectUrl;
        try {
          redirectUrl = new URL(location, params.url).href;
        } catch (err) {
          debug(err);
          proxyRes.resume();
          res.status(502).send("Invalid redirect location from the proxying endpoint: " + sfEndpoint);
          return;
        }
        res.status(200);
        copyResponseHeaders(proxyRes, res, options,
          ['location', 'content-length', 'content-type', 'content-encoding']);
        res.setHeader('SalesforceProxy-Redirect-Status', String(proxyRes.statusCode));
        res.setHeader('SalesforceProxy-Redirect-Location', redirectUrl);
        // caches must not store this response or use it for a request without the header
        res.setHeader('Cache-Control', 'no-store');
        addVary(res, 'SalesforceProxy-Redirect');
        proxyRes.resume();
        res.end();
        return;
      }
      res.status(proxyRes.statusCode);
      copyResponseHeaders(proxyRes, res, options, []);
      if (isRedirect) {
        addVary(res, 'SalesforceProxy-Redirect');
      }
      // when the endpoint closes the connection in the middle of the body, the client response is closed too
      pipeline(proxyRes, res, function(err) {
        if (err) {
          debug(err);
        }
      });
    });
    proxyReq.on('error', function(err) {
      if (proxyReq.res) {
        // after the response has started, the error is handled in the pipeline
        return;
      }
      proxyCounter--;
      debug("(--err--) " + new Array(proxyCounter+1).join('*'));
      debug(err);
      if (!res.headersSent) {
        res.status(502).send("Failed to connect to the proxying endpoint: " + sfEndpoint);
      } else {
        res.destroy(err);
      }
    });
    req.pipe(proxyReq);
  }
};
