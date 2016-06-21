"use strict";

import url from 'url';
import path from 'path';
import gm from 'gm';
import debug from 'debug';

let log   = debug('emma:log');
let error = debug('emma:error');

function handleFailedImageResponse(imageResponse, res) {
  res.writeHead(imageResponse.statusCode, {
    'Date': new Date().toUTCString(),
    'Content-Type': imageResponse.headers['content-type'],
    'Cache-Control': 'no-cache'
  });
  imageResponse.pipe(res);
}

function failResponse(res, message) {
  res.writeHead(500, {
    'Date': new Date().toUTCString(),
    'Content-Type': 'text/plain',
    'Cache-Control': 'no-cache'
  });
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

  process(req, res) {
    let context = {};
    context.request = req;
    context.params = this.route.extractParameters(req);

    log('params: %o', context.params);

    let proc = this;
    let socketTimeout = this.socketTimeout;

    this.imageSource.getImage(context, function(imageResponse) {
      if (imageResponse.statusCode != 200) {
        handleFailedImageResponse(imageResponse, res);
      } else {
        context.imageContentType = imageResponse.headers['content-type'];
        context.imageLastModified = imageResponse.headers['last-modified'];
        let image = gm(imageResponse, path.basename(context.imageUrl));
        proc.processImage(image, context, res);
      }

    }).on('error', function(err) {
      error("error fetching image: %s", err.message);
      failResponse(res, err);

    }).on('socket', function(socket) {
      if (socketTimeout) {
        socket.setTimeout(socketTimeout);
      }
    });
  }

  processImage(image, context, res) {
    this.processFunc(image, context);
    let cacheExpiration = this.cacheExpiration;
    image.stream(function(err, stdout, stderr) {
      if (err) {
        error("error processing image: %s", err.message);
        failResponse(res, err);

      } else {
        let headers = {
          'Date': new Date().toUTCString(),
          'Content-Type': context.imageContentType,
          'Last-Modified': context.imageLastModified
        };

        if (cacheExpiration) {
          headers['Expires'] = new Date(new Date().getTime() + (cacheExpiration*1000)).toUTCString();
          headers['Cache-Control'] = "public, max-age=" + cacheExpiration;
        }

        res.writeHead(200, headers);
        stdout.pipe(res);
      }
    });
  }
}

module.exports = Processor;
