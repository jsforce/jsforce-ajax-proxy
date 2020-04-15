const express = require('express')
const PORT = process.env.PORT || 5000
const jsforceAjaxProxy = require('jsforce-ajax-proxy')

express()
  .all('/proxy/?*', jsforceAjaxProxy({ enableCORS: true }))
  .listen(PORT, () => console.log(`Listening on ${ PORT }`))