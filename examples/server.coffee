connect = require('connect')
http    = require('http')
emma    = require('../lib/connect-emma')

# try http://localhost:3000/test/mobile_widget.jpg
emmaConfig =
  namespaces:
    test:
      urlTemplate: 'http://scoutmob.com/images/$1.$extension'
      cacheExpiration: 24 * 60 * 60 # 24 hours
      processImage: (image) -> image.quality(30)

app = connect()
  .use(emma(emmaConfig))
  .use(connect.errorHandler())
  .listen(3000)

console.log('Server started on port 3000');