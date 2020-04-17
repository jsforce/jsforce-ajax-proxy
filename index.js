const jsforceAjaxProxy = require('jsforce-ajax-proxy')
const https = require("https"), fs = require("fs");
const options = {
  key: fs.readFileSync('cert/toonboom-wildcard.key'),
  cert: fs.readFileSync('cert/wildcard.toonboom.com.pem')
};
const app = express();
app
  .all('/proxy/?*', jsforceAjaxProxy({ enableCORS: true }))
  .listen(8000);
https.createServer(options, app).listen(8080);