http  = require 'http'
https = require 'https'
url   = require 'url'
path  = require 'path'
gm    = require 'gm'

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
    try
      this.doFetch(urlString)
    catch err
      console.log("[ERR] error fetching image: #{err.message}")
      this.failWithError(err)

  doFetch: (urlString) ->
    protocol = if (0 == urlString.indexOf('https')) then https else http
    protocol.get(url.parse(urlString), (imageResponse) =>
      try
        if imageResponse.statusCode == 200
          this.processImage(imageResponse, urlString)
        else
          this.sendSourceError(imageResponse)

      catch err
        console.log("[ERR] error serving image: #{err.message}")
        this.failWithError(err);

    ).on('error', (err) =>
      console.log("[ERR] error fetching image: #{err.message}")
      this.failWithError(err)

    ).on('close', =>
      console.log("[ERR] connection closed")
      this.fail(500, 'Connection closed')

    ).on('socket', (socket) =>
      socket.setTimeout(@ns.timeout) if @ns.timeout?
    )

  processImage: (imageData, imageURL) ->
    image = gm(imageData, path.basename(imageURL))
    @ns.processImage(image, @request)
    image.stream((err, stdout, stderr) =>
      if err
        console.log("[ERR] error processing image: #{err.message}")
        this.failWithError(err)

      else
        headers =
          'Date': new Date().toUTCString()
          'Content-Type': imageData.headers['content-type']
          'Last-Modified': imageData.headers['last-modified']

        if @ns.cacheExpiration?
          headers['Expires'] = new Date(new Date().getTime() + (@ns.cacheExpiration * 1000)).toUTCString()

        @response.writeHead(imageData.statusCode, headers)
        stdout.pipe(@response)
    )

  sendSourceError: (sourceResponse) ->
    headers =
      'Date': new Date().toUTCString()
      'Content-Type': sourceResponse.headers['content-type']
      'Cache-Control': 'no-cache'

    @response.writeHead(sourceResponse.statusCode, headers)
    sourceResponse.pipe(@response)

  failWithError: (err) -> this.fail(500, err.message)

  fail: (statusCode, message) ->
    @response.writeHead(statusCode,
      'Date': new Date().toUTCString()
      'Content-Type': 'text/plain'
      'Cache-Control': 'no-cache'
    )
    @response.end(message)

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
  
