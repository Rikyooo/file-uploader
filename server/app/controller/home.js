// app/controller/home.js

const Controller = require("egg").Controller;

class HomeController extends Controller {
  async index() {
    this.ctx.body = {
      msg: "Hi, what's up",
    };
  }
}

module.exports = HomeController;
