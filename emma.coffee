require 'coffee-script'

http = require 'http'
util = require 'util'
url  = require 'url'
gm   = require 'gm'

config = require './config'

server = http.createServer((req, res) ->
  try
    console.log("Incoming Request from: #{req.connection.remoteAddress} for href: #{req.url}")

    # pipe some details to the node console
    urlObj = url.parse(req.url)

    pathComponents = urlObj.pathname.split('/')
    pathComponents.shift() if pathComponents[0] == ''

    nsConfig = config.namespaces[pathComponents.shift()]
    if nsConfig
      targetURL = nsConfig.urlTemplate
      fileName = null
      index = 0
      while pathComponents.length
        comp = pathComponents.shift()
        if pathComponents.length == 0
          fileName = comp
          idx = comp.lastIndexOf('.')
          comp = comp.substring(0, idx) if idx >= 0
        targetURL = targetURL.replace(new RegExp("\\$#{index + 1}", 'g'), comp)
        index++

      console.log("Fetching image #{targetURL}")
      http.get(url.parse(targetURL), (imageRes) ->
        console.log('HEADERS: ' + JSON.stringify(imageRes.headers))

        res.writeHead(imageRes.statusCode,
          'Date': imageRes.headers['date'],
          'Last-Modified': imageRes.headers['last-modified'],
          'ETag': imageRes.headers['etag'],
          'Content-Type': 'image/jpeg'
        )

        if imageRes.statusCode == 200
          image = gm(imageRes, fileName)
          nsConfig.processImage(image)
          image.stream((err, stdout, stderr) -> stdout.pipe(res))

        else
          # res.setEncoding('utf8')
          imageRes.on('data'  , (chunk) -> res.write(chunk))
          imageRes.on('end'   , -> res.end())
          imageRes.on('close' , -> res.end())

      ).on('error', (err) ->
        console.log("problem with request: #{err.message}")
        res.writeHead(500)
        res.end(err.message)
      )

    else
      res.writeHead(404)
      res.end('Not Found')

  catch err
    # handle errors gracefully
    util.puts(err)
    res.writeHead(500)
    res.end('Internal Server Error')
)

server.listen(1337, '127.0.0.1', ->
  console.log('Server running at http://127.0.0.1:1337/')
)
