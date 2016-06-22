"use strict";

import http  from 'http';
import https from 'https';
import url   from 'url';
import debug from 'debug';

let log = debug("emma:log");

class ImageSource {
  constructor(urlTemplate) {
    this.urlTemplate = urlTemplate;
  }

  getImage(context, responseHandler) {
    let imageUrl = this.urlTemplate.replace(/:[a-z]+/ig, function(match) {
      return context.params[match.substring(1)];
    });

    log('image url: %s', imageUrl);
    context.imageUrl = imageUrl;

    let protocol = http;
    if (0 == imageUrl.indexOf('https')) {
      protocol = https;
    }

    return protocol.get(url.parse(imageUrl), responseHandler);
  }
}

module.exports = ImageSource;
