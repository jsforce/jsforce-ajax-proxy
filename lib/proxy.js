var request = require('request');
var debug = require('debug')('jsforce-ajax-proxy');

/**
 * Allowed request headers 
 */
var ALLOWED_HEADERS = [
  'Authorization',
  'Content-Type',
  'Salesforceproxy-Endpoint',
  'X-Authorization',
  'X-SFDC-Session',
  'SOAPAction',
  'SForce-Auto-Assign',
  'If-Modified-Since',
  'X-User-Agent'
];

/**
 * Endpoint URL validation
 */
var SF_ENDPOINT_REGEXP =
  /^https:\/\/[a-zA-Z0-9\.\-]+\.(force|salesforce|cloudforce|database)\.com\//;

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
      res.header('Access-Control-Expose-Headers', 'SForce-Limit-Info');
      if (req.method === 'OPTIONS') {
        res.end();
        return;
      }
    }
    var sfEndpoint = req.headers["salesforceproxy-endpoint"];
    if (!SF_ENDPOINT_REGEXP.test(sfEndpoint)) {
      res.send(400, "Proxying endpoint is not allowed.");
      return;
    }
    var headers = {};
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
    req.pipe(request(params))
      .on('response', function() {
        proxyCounter--;
        debug("(--res--) " + new Array(proxyCounter+1).join('*'));
      })
      .on('error', function() {
        proxyCounter--;
        debug("(--err--) " + new Array(proxyCounter+1).join('*'));
      })
      .pipe(res);
  }
};
