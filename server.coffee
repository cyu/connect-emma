http    = require 'http'
url     = require 'url'
gm      = require 'gm'
path    = require 'path'
coffee  = require 'coffee-script'

config = require './config'

class Route
  constructor: (pathname) ->
    @pathComponents = pathname.split('/')
    @pathComponents.shift() if @pathComponents[0] == ''

    @namespace = @pathComponents.shift()

    lastPathComponent = @pathComponents.pop()
    ext = path.extname(lastPathComponent)
    @pathComponents.push(path.basename(lastPathComponent, ext))
    @extension = ext.substring(1, ext.length)

class Processor
  constructor: (@ns, @request, @response) ->

  fetch: (urlString) ->
    http.get(url.parse(urlString), (imageResponse) =>
      console.log('HEADERS: ' + JSON.stringify(imageResponse.headers))

      if imageResponse.statusCode == 200
        image = gm(imageResponse, path.basename(urlString))
        @ns.processImage(image)
        image.stream((err, stdout, stderr) =>
          if err
            console.log("[ERR] error processing image: #{err.message}")
            this.fail(500, err.message)

          else
            headers = coffee.helpers.extend({'Cache-Control': 'public'}, imageResponse.headers)
            delete headers['content-length']
            @response.writeHead(imageResponse.statusCode, headers)
            stdout.pipe(@response)
        )

      else
        headers = coffee.helpers.extend({'Cache-Control': 'no-cache'}, imageResponse.headers)
        @response.writeHead(imageResponse.statusCode, headers)
        imageResponse.pipe(@response)

    ).on('error', (err) =>
      console.log("[ERR] error fetching image: #{err.message}")
      this.fail(500, err.message)
    )

  fail: (statusCode, message) ->
    @response.writeHead(statusCode,
      'Date': new Date().toUTCString()
      'Content-Type': 'text/plain'
      'Cache-Control': 'no-cache'
    )
    @response.end(err.message)


class Emma
  constructor: ->
    @server = http.createServer((req, res) =>
      try
        console.log("Incoming Request from: #{req.connection.remoteAddress} for href: #{req.url}")
        route = new Route(url.parse(req.url).pathname)

        if ns = config.namespaces[route.namespace]
          targetURL = ns.urlTemplate

          for comp, i in route.pathComponents
            targetURL = targetURL.replace(new RegExp("\\$#{i + 1}", 'g'), comp)

          targetURL = targetURL.replace(/\$extension/g, route.extension)

          console.log("Fetching image #{targetURL}")
          new Processor(ns, req, res).fetch(targetURL)

        else
          res.writeHead(404,
            'Cache-Control': 'no-cache'
          )
          res.end('Not Found')

      catch err
        console.log("[ERR] #{err.message}")
        res.writeHead(500,
          'Cache-Control': 'no-cache'
        )
        res.end('Internal Server Error')
    )
  start: (host, port) ->
    @server.listen(port, host, -> console.log("Server running at http://#{host}:#{port}/"))

exports.server = new Emma()
exports.server.start('0.0.0.0', 1337)

