"use strict";

import Processor from './processor';
import Route from './route';
import ImageSource from './image_source';
import debug from 'debug';

let log = debug("emma:log");

class Emma {
  constructor(processors) {
    this.processors = processors;
  }

  process(req, res, next) {
    let found = false;
    for (let processor of this.processors) {
      if (processor.route.accept(req)) {
        log("selected processor: %s", processor.route.routeString);
        processor.process(req, res);
        found = true;
        break;
      }
    }
    if (!found) {
      next();
    }
  }
}

class Builder {
  constructor() {
    this.processors = [];
  }

  process(route, urlTemplate) {
    let processFunc, processOptions;
    if (arguments.length == 3) {
      processOptions = {};
      processFunc = arguments[2];
    } else if (arguments.length > 3) {
      processOptions = arguments[2];
      processFunc = arguments[3];
    }
    let processor = new Processor(
        new Route(route),
        new ImageSource(urlTemplate),
        processOptions,
        processFunc);
    this.processors.push(processor);
    return this;
  }

  buildMiddleware() {
    let emma = new Emma(this.processors);
    return function(req, res, next) {
      emma.process(req, res, next);
    }
  }
}

module.exports = function() { return new Builder(); }

