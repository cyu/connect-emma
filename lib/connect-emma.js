(function() {
  var Namespace, Processor, Route, extend, gm, http, https, merge, path, url;

  http = require('http');

  https = require('https');

  url = require('url');

  path = require('path');

  gm = require('gm');

  merge = function(options, overrides) {
    return extend(extend({}, options), overrides);
  };

  extend = function(object, properties) {
    var key, val;
    for (key in properties) {
      val = properties[key];
      object[key] = val;
    }
    return object;
  };

  Route = (function() {

    function Route(pathname) {
      var ext, lastPathComponent;
      this.pathComponents = pathname.split('/');
      if (this.pathComponents[0] === '') this.pathComponents.shift();
      lastPathComponent = this.pathComponents.pop();
      ext = path.extname(lastPathComponent);
      this.pathComponents.push(path.basename(lastPathComponent, ext));
      this.extension = ext.substring(1, ext.length);
    }

    Route.prototype.buildURL = function(urlTemplate) {
      var comp, i, targetURL, _len, _ref;
      targetURL = urlTemplate;
      _ref = this.pathComponents;
      for (i = 0, _len = _ref.length; i < _len; i++) {
        comp = _ref[i];
        targetURL = targetURL.replace(new RegExp("\\$" + (i + 1), 'g'), comp);
      }
      return targetURL.replace(/\$extension/g, this.extension);
    };

    return Route;

  })();

  Namespace = (function() {

    function Namespace(name, config) {
      var defaults;
      this.name = name;
      this.config = config;
      if (this.config.namespaces != null) {
        this.namespaces = {};
      } else if (this.config.defaults != null) {
        defaults = this.config.defaults;
        delete this.config.defaults;
        this.config = merge(defaults, this.config);
      }
    }

    Namespace.prototype.ns = function(name) {
      var ns, nsConfig;
      if (!(ns = this.namespaces[name])) {
        if (nsConfig = this.config.namespaces[name]) {
          if (this.config.defaults != null) {
            nsConfig.defaults = merge(this.config.defaults, nsConfig.defaults || {});
          }
          this.namespaces[name] = ns = new Namespace(name, nsConfig);
        }
      }
      return ns;
    };

    Namespace.prototype.process = function(route, req, res, next) {
      var ns;
      if (this.namespaces != null) {
        if (ns = this.ns(route.pathComponents[0])) {
          route.pathComponents.shift();
          return ns.process(route, req, res, next);
        } else if (ns = this.ns('default')) {
          return ns.process(route, req, res, next);
        } else {
          return next();
        }
      } else {
        return this.fetchImage(route, req, res);
      }
    };

    Namespace.prototype.fetchImage = function(route, req, res) {
      req.emma = {
        pathComponents: route.pathComponents,
        extension: route.extension,
        targetURL: route.buildURL(this.config.urlTemplate)
      };
      return new Processor(this.config, req, res).fetch();
    };

    return Namespace;

  })();

  Processor = (function() {

    function Processor(ns, request, response) {
      this.ns = ns;
      this.request = request;
      this.response = response;
    }

    Processor.prototype.fetch = function() {
      try {
        return this.doFetch();
      } catch (err) {
        console.log("[ERR] error fetching image: " + err.message);
        return this.failWithError(err);
      }
    };

    Processor.prototype.doFetch = function() {
      var protocol, urlString,
        _this = this;
      urlString = this.request.emma.targetURL;
      protocol = 0 === urlString.indexOf('https') ? https : http;
      return protocol.get(url.parse(urlString), function(imageResponse) {
        try {
          if (imageResponse.statusCode === 200) {
            return _this.processImage(imageResponse, urlString);
          } else {
            return _this.sendSourceError(imageResponse);
          }
        } catch (err) {
          console.log("[ERR] error serving image: " + err.message);
          return _this.failWithError(err);
        }
      }).on('error', function(err) {
        console.log("[ERR] error fetching image: " + err.message);
        return _this.failWithError(err);
      }).on('close', function() {
        console.log("[ERR] connection closed");
        return _this.fail(500, 'Connection closed');
      }).on('socket', function(socket) {
        if (_this.ns.timeout != null) return socket.setTimeout(_this.ns.timeout);
      });
    };

    Processor.prototype.processImage = function(imageData, imageURL) {
      var image,
        _this = this;
      image = gm(imageData, path.basename(imageURL));
      this.ns.processImage(image, this.request);
      return image.stream(function(err, stdout, stderr) {
        var headers;
        if (err) {
          console.log("[ERR] error processing image: " + err.message);
          return _this.failWithError(err);
        } else {
          headers = {
            'Date': new Date().toUTCString(),
            'Content-Type': imageData.headers['content-type'],
            'Last-Modified': imageData.headers['last-modified']
          };
          if (_this.ns.cacheExpiration != null) {
            headers['Expires'] = new Date(new Date().getTime() + (_this.ns.cacheExpiration * 1000)).toUTCString();
            headers['Cache-Control'] = "public, max-age=" + _this.ns.cacheExpiration;
          }
          _this.response.writeHead(imageData.statusCode, headers);
          return stdout.pipe(_this.response);
        }
      });
    };

    Processor.prototype.sendSourceError = function(sourceResponse) {
      var headers;
      headers = {
        'Date': new Date().toUTCString(),
        'Content-Type': sourceResponse.headers['content-type'],
        'Cache-Control': 'no-cache'
      };
      this.response.writeHead(sourceResponse.statusCode, headers);
      return sourceResponse.pipe(this.response);
    };

    Processor.prototype.failWithError = function(err) {
      return this.fail(500, err.message);
    };

    Processor.prototype.fail = function(statusCode, message) {
      this.response.writeHead(statusCode, {
        'Date': new Date().toUTCString(),
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-cache'
      });
      return this.response.end(message);
    };

    return Processor;

  })();

  module.exports = function(options) {
    var rootNamespace;
    rootNamespace = new Namespace('root', options);
    return function(req, res, next) {
      var route;
      route = new Route(url.parse(req.url).pathname);
      return rootNamespace.process(route, req, res, next);
    };
  };

}).call(this);
