// app/router.js
module.exports = app => {
  const { router, controller } = app;
  router.get('/index', controller.home.index);
  router.post('/upload', controller.uploader.upload);
  router.post('/merge', controller.uploader.merge);
  router.post('/check', controller.uploader.check);
};