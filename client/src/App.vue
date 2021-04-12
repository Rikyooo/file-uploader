<template>
  <div class="app">
    <div class="wrapper" ref="drag" id="drag">
      <div id="uploader">
        <input type="file" name="file" @change="handleFileChange" />
        <div id="filename" v-if="filename != ''">{{ filename }}</div>
      </div>
    </div>
    <div class="wrapper">
      文件准备
      <el-progress
        :text-inside="true"
        :stroke-width="20"
        :percentage="hashProgress"
      ></el-progress>
    </div>
    <div class="wrapper">
      上传进度
      <el-progress
        :text-inside="true"
        :stroke-width="20"
        :percentage="progress"
      ></el-progress>
    </div>
    <div class="btn-wrapper">
      <!-- retry -->
      <el-button
        type="warning"
        v-if="status == STATUS.error"
        @click="handleResume"
      >
        重试
      </el-button>
      <!-- pause -->
      <el-button v-else-if="status == STATUS.uploading" @click="handlePause">
        暂停
      </el-button>
      <!-- resume -->
      <el-button v-else-if="status == STATUS.pause" @click="handleResume">
        恢复
      </el-button>
      <!-- upload -->
      <el-button type="primary" v-else @click="handleUpload">
        上&nbsp;传
      </el-button>
    </div>
    <div class="chunk-wrapper clearfix" :style="{ width: chunkContainerWidth }">
      <div class="chunk" v-for="chunk in chunks" :key="chunk.name">
        <div
          :class="[
            chunk.status == STATUS.uploading
              ? 'uploading'
              : chunk.status == STATUS.error
              ? 'error'
              : 'success',
          ]"
          :style="{ height: chunk.progress + '%' }"
        ></div>
      </div>
    </div>
  </div>
</template>

<script>
import sparkMd5 from "spark-md5";
const CHUNK_SIZE = 1 * 1024 * 1024; // 1M
const FILE_SIZE_LIMIT = 50 * 1024 * 1024; //50M
const IMG_WIDTH_LIMIT = 1024;
const IMG_HEIGHT_LIMIT = 1024;
const STATUS = {
  wait: "wait",
  pause: "pause",
  calculating: "calculating",
  uploading: "uploading",
  error: "error",
  done: "done"
};
export default {
  name: "uploader",
  data() {
    return {
      chunks: [],
      file: null,
      filename: "",
      hash: null,
      requestList: [],
      status: STATUS.wait,
      STATUS,
      progress: 0,
      hashProgress: 0,
      cancelToken: null
    };
  },
  mounted() {
    this.cancelToken = this.$axios.CancelToken.source();
    this.bindDragEvent("drag");
  },
  watch: {
    uploadProgress(n) {
      n > this.progress && (this.progress = n);
    }
  },
  computed: {
    uploadProgress() {
      if (!this.file || !this.chunks.length) return 0;
      const loaded = this.chunks
        .filter(item => item.progress > 0)
        .map(item => item.file.size * item.progress)
        .reduce((acc, cur) => acc + cur, 0);
      return parseInt(loaded / this.file.size);
    },
    chunkContainerWidth() {
      const width = Math.ceil(Math.sqrt(this.chunks.length)) * 20;
      return width < 200 ? "200px" : width > 1024 ? "100%" : width + "px";
    }
  },
  methods: {
    /***************************file-type validator*******************/
    // trans blob to hex string
    async blobToString(blob) {
      // binary -> ascii -> hex string
      return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = function() {
          const ret = reader.result
            .split("")
            .map(v => v.charCodeAt())
            .map(v => v.toString(16).toUpperCase())
            .map(v => v.padStart(2, "0"))
            .join(" ");
          resolve(ret);
        };
        reader.readAsBinaryString(blob);
      });
    },
    // get width & height of image
    async getImageRect(file, offset, reverse) {
      let width = await this.blobToString(file.slice(...offset.w));
      let height = await this.blobToString(file.slice(...offset.h));
      if (reverse) {
        // some type could be reversed, such as GIF
        width = [width.slice(3, 5), width.slice(0, 2)].join("");
        height = [height.slice(3, 5), height.slice(0, 2)].join("");
      }
      const w = parseInt(width, 16),
        h = parseInt(height, 16);
      return { w, h };
    },
    async isGIF(file) {
      const ret = await this.blobToString(file.slice(0, 6));
      // 'GIF89a' || 'GIF87a'
      if (ret !== "47 49 46 38 39 61" && ret !== "47 49 46 38 37 61")
        return false;
      // console.log("文件是GIF");
      const offset = { w: [6, 8], h: [8, 10] };
      const { w, h } = await this.getImageRect(file, offset, true);
      // console.log("GIF的宽高:", w, h);
      if (w > IMG_WIDTH_LIMIT || h > IMG_HEIGHT_LIMIT) {
        this.$message.error(
          "GIF图片像素比不得超过" + IMG_WIDTH_LIMIT + "x" + IMG_HEIGHT_LIMIT
        );
        return false;
      }
      return true;
    },
    async isPNG(file) {
      const ret = await this.blobToString(file.slice(0, 8));
      if (ret !== "89 50 4E 47 0D 0A 1A 0A") return false;
      const offset = { w: [18, 20], h: [22, 24] };
      const { w, h } = await this.getImageRect(file, offset);
      if (w > IMG_WIDTH_LIMIT || h > IMG_HEIGHT_LIMIT) {
        this.$message.error(
          "PNG图片像素比不得超过" + IMG_WIDTH_LIMIT + "x" + IMG_HEIGHT_LIMIT
        );
        return false;
      }
      return true;
    },
    async isJPG(file) {
      const start = await this.blobToString(file.slice(0, 2));
      const tail = await this.blobToString(file.slice(-2));
      if (!(start === "FF D8" && tail === "FF D9")) return false;
      const offset = { w: [163, 165], h: [165, 167] };
      const { w, h } = await this.getImageRect(file, offset);
      if (w > IMG_WIDTH_LIMIT || h > IMG_HEIGHT_LIMIT) {
        this.$message.error(
          "JPG图片像素比不得超过" + IMG_WIDTH_LIMIT + "x" + IMG_HEIGHT_LIMIT
        );
        return false;
      }
      return true;
    },
    isImage(file) {
      return this.isGIF(file) || this.isPNG(file) || this.isJPG(file);
    },
    validateFile(file) {
      if (file.size > FILE_SIZE_LIMIT) {
        this.$message.error("请选择小于50M的文件");
        return false;
      }
      if (!this.isImage(file)) {
        this.$message.error("请选择正确的图片格式");
        return false;
      }
      return true;
    },
    /****************************************************************/

    /*****************************event handler**********************/
    resetUploader() {
      this.hashProgress = 0;
      this.progress = 0;
      this.chunks = [];
      this.status = STATUS.wait;
    },
    bindDragEvent(name, cb) {
      const dom = this.$refs[name];
      dom.addEventListener("dragover", e => {
        dom.style.borderColor = "red";
        e.preventDefault();
      });
      dom.addEventListener("dragleave", e => {
        dom.style.borderColor = "#eee";
        e.preventDefault();
      });
      dom.addEventListener(
        "drop",
        e => {
          dom.style.borderColor = "#eee";
          const files = e.dataTransfer.files;
          const file = files[0]; // ignore other file
          if (!file) return;
          //if (!validateFile(file)) return;
          this.file = file;
          this.filename = file.name;
          this.resetUploader();
          cb && cb();
          e.preventDefault();
        },
        false
      );
    },
    handleFileChange(e) {
      const [file] = e.target.files;
      if (!file) return;
      //if (!validateFile(file)) return;
      this.file = file;
      this.filename = "";
      this.resetUploader();
    },
    async handleUpload() {
      // @TODO Slow-Start
      if (this.status != STATUS.wait) return;
      const file = this.file;
      if (!file) {
        this.$message.info("请先选择文件");
        return;
      }
      this.status = STATUS.calculating;
      const fileExt = this.getFileExt(file.name);
      const chunks = this.createFileChunk(file);
      const hash = await this.calculateHash(chunks);
      this.hash = hash;

      // check if the file has been uploaded
      const { uploaded, uploadedList } = await this.$axios.post("/check", {
        ext: fileExt,
        hash
      });

      if (uploaded) {
        this.status = STATUS.done;
        return this.$message.success("上传成功[秒传]");
      }
      // modify chunks list
      this.chunks = chunks.map((chunk, index) => {
        const chunkname = hash + "-" + index;
        return {
          index,
          hash: hash,
          name: chunkname,
          ext: fileExt,
          file: chunk.file,
          size: chunk.file.size,
          progress: uploadedList.indexOf(chunkname) > -1 ? 100 : 0
        };
      });

      await this.uploadChunks(uploadedList);
    },
    async handleResume() {
      if (this.status !== STATUS.pause && this.status !== STATUS.error) return;
      this.status = STATUS.uploading;
      const fileExt = this.getFileExt(this.file.name);
      // check which file has been uploaded
      const { uploadedList } = await this.$axios.post("/check", {
        ext: fileExt,
        hash: this.hash
      });
      await this.uploadChunks(uploadedList);
    },
    handlePause() {
      this.status = STATUS.pause;
      this.cancelToken.cancel("用户暂停请求");
    },
    /****************************************************************/

    /*************************file controller**********************/
    // slice file(blob) to chunks
    createFileChunk(file, size = CHUNK_SIZE) {
      const chunks = [];
      let cur = 0;
      while (cur < file.size) {
        chunks.push({
          index: cur,
          file: file.slice(cur, cur + size),
          status: STATUS.wait
        });
        cur += size;
      }
      return chunks;
    },
    // get file's extension
    getFileExt(filename) {
      return filename.split(".").pop();
    },
    /****************************************************************/

    /*************************hash controller**********************/
    // hash sample & 'requestIdleCallback' api
    async calculateHash(chunks) {
      return new Promise(resolve => {
        const spark = new sparkMd5.ArrayBuffer();
        let cnt = 0;
        const hash = async file => {
          return new Promise(resolve => {
            const reader = new FileReader();
            reader.readAsArrayBuffer(file);
            reader.onload = e => {
              spark.append(e.target.result);
              resolve();
            };
          });
        };
        const loop = async t => {
          // there is free time in current frame
          while (cnt < chunks.length && t.timeRemaining() > 1) {
            hash(chunks[cnt].file).then(() => {
              if (cnt >= chunks.length) {
                // done;
                this.hashProgress = 100;
                setTimeout(() => {
                  resolve(spark.end());
                }, 100);
              } else {
                //calculating
                this.hashProgress = parseInt((cnt / chunks.length) * 100);
                cnt += 3; // skip by 3
              }
            });
          }

          // await next idle frame
          window.requestIdleCallback(loop);
        };
        //request idle frame
        window.requestIdleCallback(loop);
      });
    },
    /****************************************************************/

    /***************************request api**************************/
    async uploadChunks(uploadedList = []) {
      const chunks = this.chunks;
      // package chunks to requests
      const requestList = chunks
        .filter(chunk => uploadedList.indexOf(chunk.name) == -1)
        .map(({ index, name, ext, hash, file }) => {
          const form = new FormData();
          form.append("chunkname", name);
          form.append("ext", ext);
          form.append("hash", hash);
          form.append("file", file);
          return { form, index, error: 0 };
        });
      // send requests
      this.sendRequest([...requestList])
        .then(async state => {
          state == STATUS.done && (await this.mergeRequest());
        })
        .catch(() => {
          this.$message.error("上传失败，请稍后重试");
        });
    },
    // limit concurrency & retry times
    async sendRequest(requests, max = 4, retry = 3) {
      this.status = STATUS.uploading;
      console.log('-----------------start upload-----------------');
      return new Promise((resolve, reject) => {
        const len = requests.length;
        let counter = 0;
        const send = async () => {
          while (this.status == STATUS.uploading && counter < len && max > 0) {
            max--;
            // const i = requests.findIndex(
            //   v => v.status == STATUS.wait || v.status == STATUS.error
            // );
            // const request = requests[i];
            const request = requests.shift();
            if (!request) continue;
            const { form, index } = request;
            this.chunks[index].status = STATUS.uploading;
            console.log(this.chunks[index].index, 'upload');
            // post chunk
            this.$axios
              .post("/upload", form, {
                cancelToken: this.cancelToken.token,
                onUploadProgress: progress => {
                  this.chunks[index].progress = parseInt(
                    (progress.loaded / progress.total) * 100
                  );
                }
              })
              .then(() => {
                this.chunks[index].status = STATUS.done;
                console.log(this.chunks[index].index, 'success');
                max++;
                (++counter === len && resolve(STATUS.done)) || send();
              })
              // if error, retry
              .catch(e => {
                max++;
                // request has been canceled
                if (this.$axios.isCancel(e)) {
                  console.log(this.chunks[index].index, 'cancel');
                  this.chunks[index].status = STATUS.pause;
                  this.status = STATUS.pause;
                  this.cancelToken = this.$axios.CancelToken.source();
                  resolve(STATUS.pause);
                  return;
                }
                // there is some error ocurred
                console.log(this.chunks[index].index, 'error');
                this.chunks[index].status = STATUS.error;
                // this.chunks[index].progress = 0;
                if (++request.error > retry) {
                  console.log(this.chunks[index].index, 'stop all');
                  this.status = STATUS.error;
                  reject();
                }
                // resend request
                requests.unshift(request);
                send();
              });
          }
        };

        // // analog delay
        // setTimeout(() => {
        //   send();
        // }, Math.random() * 2000);

        send();
      });
    },
    // request server to merge chunks
    async mergeRequest() {
      this.$axios
        .post("/merge", {
          ext: this.getFileExt(this.file.name),
          size: CHUNK_SIZE,
          hash: this.hash
        })
        .then(() => {
          this.status = STATUS.done;
          this.$message.success("上传成功");
        })
        .catch(e => {
          this.$message.error("上传失败，请稍后重试");
        });
    }
    /****************************************************************/
  }
};
</script>

<style lang="stylus">
.wrapper
  margin 10px 50px
#drag
  height 100px
  border 2px dashed #eee
  line-height 100px
  text-align center
  vertical-align middle
#uploader
  position relative
  height 100%
  >input
    position absolute
    top 35%
    left 45%
#filename
  position absolute
  top 35%
  left calc(45% + 74px)
  width 180px
  line-height 23px
  height 23px
  font-size 14px
  background white
  text-align left
  text-overflow ellipsis
  overflow hidden
  white-space nowrap
.btn-wrapper
  text-align center
  margin 20px 50px 0 50px
img
  width 50px
.chunk-wrapper
  width 220px
  margin 20px auto
  overflow hidden
.chunk
  width 20px
  height 20px
  border-radius 3px
  overflow hidden
  font-size 12px
  line-height 20px
  text-align center
  border 1px solid #fff
  background #eee
  float left
  >.success
    background #67C23A
  >.uploading
    background #409EFF
  >.error
    background #F56C6C
.clearfix:after
  content ''
  clear both
  display block
</style>
