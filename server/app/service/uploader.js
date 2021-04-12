// app/service/upload.js
const path = require("path");
const fse = require("fs-extra");
const Service = require("egg").Service;

class UploadService extends Service {
  async handleMerge(slices, dest, size) {
    const readFile = (file, stream) =>
      new Promise((resolve) => {
        const readStream = fse.createReadStream(file);
        readStream.on("end", () => {
          fse.unlinkSync(file); // delete chunk
          resolve();
        });
        readStream.pipe(stream);
      });
    
    await Promise.all(
      slices.map((slice, index) =>
        readFile(
          slice,
          fse.createWriteStream(dest, {
            start: index * size,
            end: (index + 1) * size,
          })
        )
      )
    );
  }

  async mergeChunks(filePath, hash, size) {
    const chunkPath = path.resolve(this.config.UPLOAD_DIR, hash);
    let chunks = await fse.readdir(chunkPath);
    if (!chunks || chunks.length < 1) throw Error('切片读取失败');

    // sort chunk by name
    chunks.sort((a, b) => a.split("-")[1] - b.split("-")[1]);
    // transfer chunkname to path
    chunks = chunks.map(name => path.resolve(chunkPath, name));
    await this.handleMerge(chunks, filePath, size);
  }
}

module.exports = UploadService;
