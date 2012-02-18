(function() {
  var app, connect, emma, emmaConfig, http;

  connect = require('connect');

  http = require('http');

  emma = require('../lib/connect-emma');

  emmaConfig = {
    namespaces: {
      test: {
        urlTemplate: 'http://scoutmob.com/images/$1.$extension',
        cacheExpiration: 24 * 60 * 60,
        processImage: function(image) {
          return image.quality(30);
        }
      }
    }
  };

  app = connect().use(emma(emmaConfig)).use(connect.errorHandler()).listen(3000);

  console.log('Server started on port 3000');

}).call(this);
