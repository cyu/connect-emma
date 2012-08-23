http    = require 'http'
https   = require 'https'
url     = require 'url'
path    = require 'path'
gm      = require 'gm'

merge = (options, overrides) ->
  extend (extend {}, options), overrides

extend = (object, properties) ->
  for key, val of properties
    object[key] = val
  object

class Route
  constructor: (pathname) ->
    @pathComponents = pathname.split('/')
    @pathComponents.shift() if @pathComponents[0] == ''

    lastPathComponent = @pathComponents.pop()
    ext = path.extname(lastPathComponent)
    @pathComponents.push(path.basename(lastPathComponent, ext))
    @extension = ext.substring(1, ext.length)

  buildURL: (urlTemplate) ->
    targetURL = urlTemplate
    for comp, i in @pathComponents
      targetURL = targetURL.replace(new RegExp("\\$#{i + 1}", 'g'), comp)
    targetURL.replace(/\$extension/g, @extension)


class Namespace
  constructor: (@name, @config) ->
    if @config.namespaces?
      @namespaces = {}
    else if @config.defaults?
      defaults = @config.defaults
      delete @config.defaults
      @config = merge(defaults, @config)

  ns: (name) ->
    unless ns = @namespaces[name]
      if nsConfig = @config.namespaces[name]
        if @config.defaults?
          nsConfig.defaults = merge(@config.defaults, nsConfig.defaults || {})
        @namespaces[name] = ns = new Namespace(name, nsConfig)
    ns

  process: (route, req, res, next) ->
    if @namespaces?
      if ns = @ns(route.pathComponents[0])
        route.pathComponents.shift()
        ns.process(route, req, res, next)
      else if ns = @ns('default')
        ns.process(route, req, res, next)
      else next()
    else
      @fetchImage(route, req, res)

  fetchImage: (route, req, res) ->
    # Store config options into the request for use by processimage scripts
    req.emma = {
      pathComponents: route.pathComponents
      extension: route.extension
      targetURL: route.buildURL(@config.urlTemplate)
    }
    new Processor(@config, req, res).fetch()

class Processor
  constructor: (@ns, @request, @response) ->

  fetch: ->
    try
      this.doFetch()
    catch err
      console.log("[ERR] error fetching image: #{err.message}")
      this.failWithError(err)

  doFetch: ->
    urlString = @request.emma.targetURL
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
  rootNamespace = new Namespace('root', options)
  (req, res, next) ->
    route = new Route(url.parse(req.url).pathname)
    rootNamespace.process(route, req, res, next)

