"use strict";

import Processor from './processor';
import Route from './route';
import ImageSource from './image_source';
import {log,error} from './utils';

let contextHelpers = {
  addCleanup: function(cleanupFunc) {
    if (this._cleanupFunctions) {
      this._cleanupFunctions.push(cleanupFunc);
    } else {
      this._cleanupFunctions = [cleanupFunc];
    }
  }
}

class Emma {
  constructor(processors, helpers) {
    this.processors = processors;
    if (helpers) {
      this.helpers = Object.assign(contextHelpers, helpers);
    } else {
      this.helpers = contextHelpers;
    }
  }

  process(req, res, next) {
    let found = false;
    for (let processor of this.processors) {
      if (processor.route.accept(req)) {
        log("selected processor: %s", processor.route.routeString);

        let context = {};
        context.request = req;

        if (this.helpers) {
          log('adding helper to context: %o', this.helpers);
          context.__proto__ = this.helpers;
        }

        processor.process(context, res);
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
    this.helpers = null;
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

  helper(helperObj) {
    this.helpers = Object.assign(this.helpers || {}, helperObj);
  }

  buildMiddleware() {
    let emma = new Emma(this.processors, this.helpers);
    return function(req, res, next) {
      emma.process(req, res, next);
    }
  }
}

module.exports = function() { return new Builder(); }

