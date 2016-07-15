"use strict";

import queue from 'async/queue';
import {log,error} from './utils';

class FetchImageQueue {
  constructor(queue) {
    this.queue = queue;
  }

  push(imageSource, context, options) {
    let socketTimeout = options.socketTimeout;
    let q = this.queue;
    return new Promise(function(resolve, reject) {
      q.push({
        image: imageSource,
        socketTimeout: socketTimeout,
        context: context,
        resolve: resolve,
        reject: reject
      });
    });
  }
}

module.exports = function(workerCount) {
  let q = queue(function(task, callback) {
    log('requesting image...');
    task.image.getImage(task.context, function(imageResponse) {
      task.resolve(imageResponse);
      callback();
    }).on('error', function(err) {
      task.reject(err);
      callback();
    }).on('socket', function(socket) {
      if (task.socketTimeout) {
        socket.setTimeout(task.socketTimeout);
      }
    });
  }, workerCount);
  return new FetchImageQueue(q);
}
