"use strict";

import url from 'url';
import path from 'path';
import gm from 'gm';
import Promise from 'promise';
import {log,error} from './utils';

function headers(contentType) {
  let extraHeaders = arguments.length > 1 ? arguments[1] : {};
  return Object.assign({
    'Date': dateHeaderValue(new Date()),
    'Content-Type': contentType
  }, extraHeaders);
}

function dateHeaderValue(dt) {
  return dt.toUTCString();
}

function handleFailedImageResponse(imageResponse, res) {
  let h = headers(imageResponse.headers['content-type'], {'Cache-Control': 'no-cache'});
  res.writeHead(imageResponse.statusCode, h);
  imageResponse.on('error', function(err) {
    error('handleFailedImageResponse imageResponse stream error: %o', err);
    try { imageResponse.close(); } catch(e) {}
    res.end();
  });
  imageResponse.pipe(res);
}

function failResponse(res, message) {
  res.writeHead(500, headers('text/plain', {'Cache-Control': 'no-cache'}));
  res.end(message);
}

class Processor {
  constructor(route, imageSource, options, processFunc) {
    this.route = route;
    this.imageSource = imageSource;
    this.processFunc = processFunc;

    if ('cacheExpiration' in options) {
      this.cacheExpiration = options.cacheExpiration;
    }
    if ('socketTimeout' in options) {
      this.socketTimeout = options.socketTimeout;
    }
  }

  process(context, res) {
    context.params = this.route.extractParameters(context.request);
    log('params: %o', context.params);
    return this._getImage(context, res).
      then( (image) => this.processImage(image, context, res) ).
      then( (image) => this._streamImage(image, context, res) ).
      then(function() {
        if (context._cleanupFunctions) {
          for (let i = 0, len = context._cleanupFunctions.length; i < len; i++) {
            let func = context._cleanupFunctions[0];
            log('performing cleanup: %o', func);
            func();
          }
        }
      });
  }

  processImage(image, context, res) {
    return this._executeProcessFunction(image, context).
      catch(function(err) {
        error("error in process function: %o", err);
        failResponse(res, err.message);
      });
  }

  _getImage(context, res) {
    return this._requestImage(context).
      then(function(imageResponse) {
        if (imageResponse.statusCode != 200) {
          handleFailedImageResponse(imageResponse, res);
          return Promise.reject(new Error("Unexpected HTTP response code: " + imageResponse.statusCode));
        } else {
          context.imageContentType = imageResponse.headers['content-type'];
          context.imageLastModified = imageResponse.headers['last-modified'];
          log("received image: %s", context.imageContentType);
          return gm(imageResponse, path.basename(context.imageUrl));
        }
      }, function(err) {
        error("error fetching image: %o", err);
        failResponse(res, err.message);
      });
  }

  _requestImage(context) {
    log('requesting image...');
    let proc = this;
    let socketTimeout = this.socketTimeout;
    return new Promise(function(resolve, reject) {
      proc.imageSource.getImage(context, function(imageResponse) {
        resolve(imageResponse);
      }).on('error', function(err) {
        reject(err);
      }).on('socket', function(socket) {
        if (socketTimeout) {
          socket.setTimeout(socketTimeout);
        }
      });
    });
  }

  _executeProcessFunction(image, context) {
    let promise = null;
    try {
      log('executing process image function...');
      let result = this.processFunc(image, context);
      promise = (('constructor' in result) && result.constructor == Promise) ? result : Promise.resolve(result);
    } catch(err) {
      promise = Promise.reject(err);
    }
    return promise;
  }

  _streamImage(image, context, res) {
    log('streaming processed image...');
    let proc = this;
    return this._createImageStream(image, context).
      then(function(stream) {
        return proc._pipeStreamToResponse(stream, context, res);
      }, function(err) {
        error("error processing image: %o", err);
        failResponse(res, err.message);
      });
  }

  _createImageStream(image, context) {
    return new Promise(function(resolve, reject) {
      image.stream(function(err, stdout, stderr) {
        if (err) {
          reject(err);
        } else {
          resolve(stdout);
        }
      });
    });
  }

  _pipeStreamToResponse(stream, context, res) {
    log('sending transformed image...');
    let cacheExpiration = this.cacheExpiration;
    let h = headers(context.imageContentType, {'Last-Modified': context.imageLastModified});
    if (cacheExpiration) {
      h['Expires'] = dateHeaderValue(new Date(new Date().getTime() + (cacheExpiration*1000)));
      h['Cache-Control'] = "public, max-age=" + cacheExpiration;
    }
    res.writeHead(200, h);
    return this._pipeStream(stream, res).
      catch(function(err) {
        failResponse(res, err.message);
        res.end();
      });
  }

  _pipeStream(a,b) {
    return new Promise(function(resolve, reject) {
      let streamError = false;
      a.on('finish', function() {
          if (!streamError) { resolve(); }
        }).
        on('error', function(err) {
          streamError = true;
          reject(err);
          try { a.close(); } catch(e) {}
        });
      a.pipe(b);
    });
  }
}

module.exports = Processor;
