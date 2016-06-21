"use strict";

import url from 'url';
import querystring from 'querystring';
import debug from 'debug';

let log = debug('emma:log');

let variable = function(variableName) {
  return function(comp, store) {
    if (store) { store[variableName] = comp; }
    return true;
  }
}

let literal = function(literalValue) {
  return function(comp) { return comp == literalValue; }
}

function buildPathComponentsArray(str) {
  str = (str[0] == "/") ? str.substring(1) : str;
  return str.split('/');
}

class Route {
  constructor(routeString) {
    this.routeString = routeString;
    this.componentMatchers = buildPathComponentsArray(routeString).
      map( (comp) => comp[0] == ':' ? variable(comp.substring(1)) : literal(comp) );
  }

  accept(req) {
    let pathComponents = buildPathComponentsArray(url.parse(req.url).pathname);
    if (this.componentMatchers.length != pathComponents.length) {
      return false;
    }
    for (let i = 0, len = this.componentMatchers.length; i < len; i++) {
      if (!this.componentMatchers[i](pathComponents[i])) {
        return false;
      }
    }
    return true;
  }

  extractParameters(req) {
    let parsedUrl = url.parse(req.url)
    let pathComponents = buildPathComponentsArray(parsedUrl.pathname);
    let params = querystring.parse(parsedUrl.query);
    log('query string params: %o', params);
    for (let i = 0, len = this.componentMatchers.length; i < len; i++) {
      this.componentMatchers[i](pathComponents[i], params);
    }
    return params;
  }
}

module.exports = Route;
