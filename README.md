Emma - Connect middleware for transforming images on the fly
============================================================

Emma is a connect middleware that will proxy images from an origin server while allowing you to manipulate that image along the way.  It is useful if you don't want to have to create all the different permutations of an image when it is originally uploaded to server, and instead you want to generate it dynamically, letting your CDN handle the storage.

Emma uses the gm package, which is a node.js library for GraphicsMagick.  Read more about what it can do here: http://aheckmann.github.com/gm/

Take a look at the example to see what it can do: https://github.com/Scoutmob/connect-emma/blob/master/examples/server.coffee
