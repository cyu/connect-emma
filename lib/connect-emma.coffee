http = require 'http'
url  = require 'url'
path = require 'path'
gm   = require 'gm'

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
      if imageResponse.statusCode == 200
        image = gm(imageResponse, path.basename(urlString))
        @ns.processImage(image)
        image.stream((err, stdout, stderr) =>
          if err
            console.log("[ERR] error processing image: #{err.message}")
            this.fail(500, err.message)

          else
            headers =
              'Date': new Date().toUTCString()
              'Content-Type': imageResponse.headers['content-type']
              'Last-Modified': imageResponse.headers['last-modified']

            if @ns.cacheExpiration?
              headers['Expires'] = new Date(new Date().getTime() + (@ns.cacheExpiration * 1000)).toUTCString()

            @response.writeHead(imageResponse.statusCode, headers)
            stdout.pipe(@response)
        )

      else
        headers =
          'Date': new Date().toUTCString()
          'Content-Type': imageResponse.headers['content-type']
          'Cache-Control': 'no-cache'

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

module.exports = (options) ->
  (req, res, next) ->
    route = new Route(url.parse(req.url).pathname)

    if ns = options.namespaces[route.namespace]
      targetURL = ns.urlTemplate

      for comp, i in route.pathComponents
        targetURL = targetURL.replace(new RegExp("\\$#{i + 1}", 'g'), comp)

      targetURL = targetURL.replace(/\$extension/g, route.extension)

      new Processor(ns, req, res).fetch(targetURL)

    else
      next()
  