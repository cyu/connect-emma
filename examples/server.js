var app, connect, emma, emmaConfig, http, express, port;

connect = require('connect');
express = require('express');
http    = require('http');
emma    = require('../lib/connect-emma');

port = process.env.PORT || 8888;

emmaConfig = {
  namespaces: {
    test: {
      urlTemplate: 'http://localhost:' + port + '/images/$1.$extension',
      cacheExpiration: 24 * 60 * 60,
      processImage: function(image) {
        return image.quality(10);
      }
    }
  }
};

app = connect().
  use(emma(emmaConfig)).
  use('/images', express.static(__dirname + '/images')).
  listen(port);

console.log('Server started on port ' + port);
console.log('See a transformed image here: http://localhost:' + port + '/test/lighthouse.jpg');
console.log('See the original image here: http://localhost:' + port + '/images/lighthouse.jpg');

