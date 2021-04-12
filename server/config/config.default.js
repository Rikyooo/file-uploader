// config/config.default.js
const path = require('path')
module.exports = _ => {
  const config = {
    keys: 'rikyoxxx@Anonymous!',
    // middleware: ['cors'],
    multipart: {
      mode: 'file',
      whitelist: () => true
    },
    security: {
      csrf: {
        enable: false
      },
    },
    UPLOAD_DIR: path.resolve(__dirname, "..", "app/public")
  };
  return config;
};