var connect = require('connect');
var express = require('express');
var http    = require('http');
var emma    = require('../lib/connect-emma');

var port = process.env.PORT || 8888;
var imageUrlTemplate = 'http://localhost:' + port + '/images/:filename';

var images = emma();
images.process(
    "/test/:filename",
    imageUrlTemplate,
    { cacheExpiration: 24 * 60 * 60 }, // 1 day
    function(image) {
      return image.quality(10);
    });
images.process(
    "/test/:width/:height/:filename",
    imageUrlTemplate,
    function(image, context) {
      return image.resize(context.params.width, context.params.height);
    });

app = connect().
  use(images.buildMiddleware()).
  use('/images', express.static(__dirname + '/images')).
  listen(port);

console.log('Server started on port ' + port);
console.log('See a transformed image here:');
console.log('   http://localhost:' + port + '/test/lighthouse.jpg');
console.log('   http://localhost:' + port + '/test/320/320/lighthouse.jpg');
console.log('See the original image here: http://localhost:' + port + '/images/lighthouse.jpg');

