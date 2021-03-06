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
  constructor(route, imageSource, imageQueue, options, processFunc) {
    this.route = route;
    this.imageSource = imageSource;
    this.imageQueue = imageQueue;
    this.processFunc = processFunc;

    if ('cacheExpiration' in options) {
      this.cacheExpiration = options.cacheExpiration;
    } else {
      this.cacheExpiration = null;
    }
    if ('socketTimeout' in options) {
      this.socketTimeout = options.socketTimeout;
    } else {
      this.socketTimeout = null;
    }
    if ('gifFirstFrame' in options) {
      this.gifFirstFrame = options.gifFirstFrame;
    } else {
      this.gifFirstFrame = false;
    }
  }

  process(context, res) {
    context.params = this.route.extractParameters(context.request);
    log('params: %o', context.params);
    return this._getImage(context, res).
      then( (image) => this._processImage(image, context, res) ).
      then( (image) => this._writeImage(image, context, res) ).
      then( () => this._cleanup(context) );
  }

  _processImage(image, context, res) {
    return this._executeProcessFunction(image, context).
      catch(function(err) {
        error("error in process function: %o", err);
        failResponse(res, err.message);
        return Promise.reject(err);
      });
  }

  _getImage(context, res) {
    let gifFirstFrame = this.gifFirstFrame;
    return this.imageQueue.push(this.imageSource, context, {socketTimeout: this.socketTimeout}).
      then(function(imageResponse) {
        if (imageResponse.statusCode != 200) {
          handleFailedImageResponse(imageResponse, res);
          return Promise.reject(new Error("Unexpected HTTP response code: " + imageResponse.statusCode));
        } else {
          context.imageContentType = imageResponse.headers['content-type'];
          context.imageLastModified = imageResponse.headers['last-modified'];
          log("received image: %s", context.imageContentType);
          let filename = path.basename(context.imageUrl);
          context.basename = filename;
          if (gifFirstFrame && filename.match(/\.gif$/)) {
            log('processing first frame of gif: %s', filename);
            filename = filename + '[0]';
          }
          return gm(imageResponse, filename);
        }
      }, function(err) {
        error("error fetching image: %o", err);
        failResponse(res, err.message);
        return Promise.reject(err);
      });
  }

  _executeProcessFunction(image, context) {
    let promise = null;
    try {
      log('executing process image function...');
      let result = this.processFunc(image, context);
      if (result == null || typeof result == 'undefined') {
        promise = Promise.reject(new Error('Expecting promise or image as result of process function'));
      } else if (('constructor' in result) && result.constructor == Promise) {
        promise = result;
      } else {
        promise = Promise.resolve(result);
      }
    } catch(err) {
      promise = Promise.reject(err);
    }
    return promise;
  }

  _bufferImage(image) {
    return new Promise(function(resolve, reject) {
      log("buffering final image...");
      image.toBuffer(function(err, buf) {
        if (err) {
          reject(err);
        } else {
          resolve(buf);
        }
      });
    });
  }

  _writeImage(image, context, res) {
    let proc = this;
    return this._bufferImage(image).
      then(function(buffer) {
        log("writing image...");
        context.imageFileSize = buffer.length;
        proc._writeResponseHead(context, res);
        res.write(buffer);
        res.end();
      }).
      catch(function(err) {
        error("error writing image: %o", err);
        failResponse(res, err.message);
        return Promise.reject(err);
      });
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
        return Promise.reject(err);
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

  _writeResponseHead(context, res) {
    let cacheExpiration = this.cacheExpiration;
    let h = headers(context.imageContentType, {'Last-Modified': context.imageLastModified});
    if (cacheExpiration) {
      h['Expires'] = dateHeaderValue(new Date(new Date().getTime() + (cacheExpiration*1000)));
      h['Cache-Control'] = "public, max-age=" + cacheExpiration;
    }
    if (context.imageFileSize) {
      h['Content-Length'] = context.imageFileSize;
    }
    res.writeHead(200, h);
  }

  _pipeStreamToResponse(stream, context, res) {
    log('sending transformed image...');
    this._writeResponseHead(context, res);
    return this._pipeStream(stream, res).
      catch(function(err) {
        error('error streaming image to response: %o', err);
        failResponse(res, err.message);
        res.end();
        return Promise.reject(err);
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

  _cleanup(context) {
    if (context._cleanupFunctions) {
      for (let i = 0, len = context._cleanupFunctions.length; i < len; i++) {
        let func = context._cleanupFunctions[0];
        log('performing cleanup: %o', func);
        try {
          func();
          log('cleanup completed');
        } catch (err) {
          error('error in cleanup function: %o', err);
        }
      }
    }
  }

}

module.exports = Processor;
