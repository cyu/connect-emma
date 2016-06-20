import http   from 'http';
import https  from 'https';
import url    from 'url';
import path   from 'path';
import gm     from 'gm';

function merge(options, overrides) {
  return extend(extend({}, options), overrides);
}

function extend(object, properties) {
  Object.keys(properties).reduce(function(obj, key) {
    obj[key] = properties[key];
    return obj;
  }, object);
}

class Route {
  constructor(pathname) {
    this.pathComponents = pathname.split('/');

    if (this.pathComponents[0] == '') {
      this.pathComponents.shift();
    }

    let lastPathComponent = this.pathComponents.pop();
    let ext = path.extname(lastPathComponent);

    this.pathComponents.push(path.basename(lastPathComponent, ext));
    this.extension = ext.substring(1, ext.length);
  }

  buildURL(urlTemplate) {
    let u = this.pathComponents.reduce(function(targetUrl, comp, index) {
      return targetUrl.replace(new RegExp('\\$'+(index+1), 'g'), comp);
    }, urlTemplate);
    return u.replace(/\$extension/g, this.extension);
  }

}

class Namespace {
  constructor(name, config) {
    this.name = name;
    this.config = config;
    if ('namespaces' in this.config) {
      this.namespaces = {};
    } else if ('defaults' in this.config) {
      defaults = this.config.defaults
      delete this.config.defaults
      this.config = merge(defaults, this.config)
    }
  }

  ns(name) {
    let ns = null;
    let nsConfig = null;
    if (!(ns = this.namespaces[name])) {
      if (nsConfig = this.config.namespaces[name]) {
        if ('defaults' in this.config) {
          nsConfig.defaults = merge(this.config.defaults, nsConfig.defaults || {});
        }
        this.namespaces[name] = ns = new Namespace(name, nsConfig);
      }
    }
    return ns;
  }

  process(route, req, res, next) {
    let ns = null;
    if ('namespaces' in this) {
      if (ns = this.ns(route.pathComponents[0])) {
        route.pathComponents.shift();
        ns.process(route, req, res, next);
      } else if (ns = this.ns('default')) {
        ns.process(route, req, res, next);
      } else {
        next();
      }
    } else {
      this.fetchImage(route, req, res);
    }
  }

  fetchImage(route, req, res) {
    // Store config options into the request for use by processimage scripts
    req.emma = {
      pathComponents: route.pathComponents,
      extension: route.extension,
      targetURL: route.buildURL(this.config.urlTemplate)
    };
    new Processor(this.config, req, res).fetch();
  }
}

class Processor {
  constructor(ns, request, response) {
    this.ns = ns;
    this.request = request;
    this.response = response;
  }

  fetch() {
    try {
      this.doFetch();
    } catch (err) {
      console.log("[ERR] error fetching image: "+ err.message);
      this.failWithError(err);
    }
  }

  doFetch() {
    let urlString = this.request.emma.targetURL;
    let protocol = http;
    if (0 == urlString.indexOf('https')) {
      protocol = https;
    }
    let proc = this;
    protocol.get(url.parse(urlString), function(imageResponse) {
      try {
        if (imageResponse.statusCode == 200) {
          proc.processImage(imageResponse, urlString);

        } else {
          proc.sendSourceError(imageResponse);
        }
      } catch (err) {
        console.log("[ERR] error serving image: " + err.message);
        proc.failWithError(err);
      }

    }).on('error', function(err) {
      console.log("[ERR] error fetching image: " + err.message);
      proc.failWithError(err);

    }).on('socket', function(socket) {
      if ('timeout' in proc.ns) {
        socket.setTimeout(proc.ns.timeout) 
      }
    });
  }

  processImage(imageData, imageURL) {
    let contentType  = imageData.headers['content-type'];
    let lastModified = imageData.headers['last-modified'];
    let statusCode   = imageData.statusCode;
    let queue        = this.ns.processImage;

    if (typeof queue == 'function') {
      queue = [queue];
    } else {
      queue = queue.slice(); // Clone a copy
    }

    let proc = this;

    // Helper method to recursively chain the queued methods
    let _processImage = function(steps, imageData, imageURL) {
      let image = gm(imageData, path.basename(imageURL));

      let step = steps.shift();
      if (step) {
        step(image, proc.request);
      }

      image.stream(function(err, stdout, stderr) {
        if (err) {
          console.log("[ERR] error processing image: " + err.message);
          proc.failWithError(err);

        } else {
          if (steps.length > 0) { // Stream to the next step
            _processImage(steps, stdout, imageURL);

          } else {

            let headers = {
              'Date': new Date().toUTCString(),
              'Content-Type': contentType,
              'Last-Modified': lastModified
            };

            if ('cacheExpiration' in proc.ns) {
              headers['Expires'] = new Date(new Date().getTime() + (proc.ns.cacheExpiration * 1000)).toUTCString();
              headers['Cache-Control'] = "public, max-age=#{this.ns.cacheExpiration}";
            }

            proc.response.writeHead(statusCode, headers);
            stdout.pipe(proc.response)
          }
        }
      });
    }
    return _processImage(queue, imageData, imageURL);
  }

  sendSourceError(sourceResponse) {
    let headers = {
      'Date': new Date().toUTCString(),
      'Content-Type': sourceResponse.headers['content-type'],
      'Cache-Control': 'no-cache'
    };

    this.response.writeHead(sourceResponse.statusCode, headers);
    sourceResponse.pipe(this.response);
  }

  failWithError(err) {
     this.fail(500, err.message);
  } 

  fail(statusCode, message) {
    this.response.writeHead(statusCode, {
      'Date': new Date().toUTCString(),
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-cache'
    });
    this.response.end(message);
  }

}

module.exports = function(options) {
  if ('gmPrototype' in options) {
    extend(gm.prototype, options.gmPrototype);
    delete options.gmPrototype;
  }

  let rootNamespace = new Namespace('root', options);
  return function (req, res, next) {
    let route = new Route(url.parse(req.url).pathname);
    rootNamespace.process(route, req, res, next);
  };
}

