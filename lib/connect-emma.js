(function() {
  var Processor, Route, gm, http, path, url;

  http = require('http');

  url = require('url');

  path = require('path');

  gm = require('gm');

  Route = (function() {

    function Route(pathname) {
      var ext, lastPathComponent;
      this.pathComponents = pathname.split('/');
      if (this.pathComponents[0] === '') this.pathComponents.shift();
      this.namespace = this.pathComponents.shift();
      lastPathComponent = this.pathComponents.pop();
      ext = path.extname(lastPathComponent);
      this.pathComponents.push(path.basename(lastPathComponent, ext));
      this.extension = ext.substring(1, ext.length);
    }

    return Route;

  })();

  Processor = (function() {

    function Processor(ns, request, response) {
      this.ns = ns;
      this.request = request;
      this.response = response;
    }

    Processor.prototype.fetch = function(urlString) {
      var _this = this;
      return http.get(url.parse(urlString), function(imageResponse) {
        var headers, image;
        if (imageResponse.statusCode === 200) {
          image = gm(imageResponse, path.basename(urlString));
          _this.ns.processImage(image);
          return image.stream(function(err, stdout, stderr) {
            var headers;
            if (err) {
              console.log("[ERR] error processing image: " + err.message);
              return _this.fail(500, err.message);
            } else {
              headers = {
                'Date': new Date().toUTCString(),
                'Content-Type': imageResponse.headers['content-type'],
                'Last-Modified': imageResponse.headers['last-modified']
              };
              if (_this.ns.cacheExpiration != null) {
                headers['Expires'] = new Date(new Date().getTime() + (_this.ns.cacheExpiration * 1000)).toUTCString();
              }
              _this.response.writeHead(imageResponse.statusCode, headers);
              return stdout.pipe(_this.response);
            }
          });
        } else {
          headers = {
            'Date': new Date().toUTCString(),
            'Content-Type': imageResponse.headers['content-type'],
            'Cache-Control': 'no-cache'
          };
          _this.response.writeHead(imageResponse.statusCode, headers);
          return imageResponse.pipe(_this.response);
        }
      }).on('error', function(err) {
        console.log("[ERR] error fetching image: " + err.message);
        return _this.fail(500, err.message);
      });
    };

    Processor.prototype.fail = function(statusCode, message) {
      this.response.writeHead(statusCode, {
        'Date': new Date().toUTCString(),
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-cache'
      });
      return this.response.end(err.message);
    };

    return Processor;

  })();

  module.exports = function(options) {
    return function(req, res, next) {
      var comp, i, ns, route, targetURL, _len, _ref;
      route = new Route(url.parse(req.url).pathname);
      if (ns = options.namespaces[route.namespace]) {
        targetURL = ns.urlTemplate;
        _ref = route.pathComponents;
        for (i = 0, _len = _ref.length; i < _len; i++) {
          comp = _ref[i];
          targetURL = targetURL.replace(new RegExp("\\$" + (i + 1), 'g'), comp);
        }
        targetURL = targetURL.replace(/\$extension/g, route.extension);
        return new Processor(ns, req, res).fetch(targetURL);
      } else {
        return next();
      }
    };
  };

}).call(this);
