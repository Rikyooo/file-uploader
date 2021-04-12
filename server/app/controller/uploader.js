// app/controller/upload.js
const path = require("path");
const fse = require("fs-extra");

const Controller = require("egg").Controller;

class UploadController extends Controller {
  async getUploadedList (name) {
    const chunkPath = path.resolve(this.config.UPLOAD_DIR, name);
    return fse.existsSync(chunkPath)
      ? (await fse.readdir(chunkPath)).filter((name) => name[0] !== ".") // filter hidden files
      : [];
  }

  async check () {
    const { ext, hash } = this.ctx.request.body;
    const filePath = path.resolve(this.config.UPLOAD_DIR, `${hash}.${ext}`);
    let uploaded = false;
    let uploadedList = [];
    // check if the file is existed
    if (fse.existsSync(filePath)) {
      uploaded = true;
    } else {
      uploadedList = await this.getUploadedList(hash);
    }

    this.ctx.body = {
      code: 0,
      uploaded,
      uploadedList,
    };
  }

  async upload () {
    // server errors randomly
    // if (Math.random() < 0.5) {
    //   return (ctx.status = 500);
    // }

    const { ctx } = this;
    const file = ctx.request.files[0];
    const { chunkname, ext, hash } = ctx.request.body;
    const filename = `${hash}.${ext}`;
    const filePath = path.resolve(this.config.UPLOAD_DIR, filename);
    const chunkPath = path.resolve(this.config.UPLOAD_DIR, hash);

    // the file has been uploaded
    if (fse.existsSync(filePath)) {
      ctx.body = {
        code: 1,
        msg: "文件已存在",
        url: `/public/${filename}`,
      };
      return;
    }

    // check if public dir is existed
    if (!fse.existsSync(this.config.UPLOAD_DIR)) {
      console.log('[PROGRESS] making public dir');
      await fse.mkdirs(this.config.UPLOAD_DIR);
    }

    if (fse.existsSync(`${chunkPath}/${chunkname}`)) {
      ctx.body = {
        code: 1,
        msg: "切片已存在",
        url: `/public/${chunkPath}/${chunkname}`,
      };
      return;
    }

    console.log(`
    <<<<   ${file.filepath}
    >>>>   ${chunkPath}/${chunkname}
    `);
    try {
      await fse.move(file.filepath, `${chunkPath}/${chunkname}`)
      console.log('success!')
      ctx.body = {
        code: 0,
        msg: "上传成功",
        url: `/public/${filename}`,
      };
    } catch (e) {
      console.log(e);
      ctx.body = {
        code: -1,
        msg: "上传失败",
      };
    }
  }

  async merge () {
    const { ext, size, hash } = this.ctx.request.body;
    const filePath = path.resolve(this.config.UPLOAD_DIR, `${hash}.${ext}`);
    try {
      await this.ctx.service.uploader.mergeChunks(filePath, hash, size);
      this.ctx.body = {
        code: 0,
        msg: "合并成功",
      };
    } catch (e) {
      console.log(e);
      this.ctx.body = {
        code: -1,
        msg: "合并失败",
      };
    }
  }
}

module.exports = UploadController;
