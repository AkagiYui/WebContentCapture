import express from "express"
import bodyParser from "body-parser"
import multer from "multer"
import AdmZip from "adm-zip"
import path from "path"
import fs from "fs"
import { randomUUID } from "crypto"
import { capture } from "./capture.js"

const app = express()
const port = 4000
const upload = multer({ dest: "uploads/" })

const logger = {
  info: (...args) => {
    const timestamp = new Date().toLocaleString()
    console.log(`${timestamp} [INFO]`, ...args)
  },
}

function createDynamicStaticMiddleware() {
  const staticPaths = new Map()
  const staticMiddlewares = new Map()

  const middleware = (req, res, next) => {
    for (const [prefix, staticPath] of staticPaths.entries()) {
      if (req.url.startsWith(prefix)) {
        // 把url中的prefix部分去掉
        req.url = req.url.substring(prefix.length)
        staticMiddlewares.get(prefix)(req, res, next)
        return
      }
    }
    next()
  }

  middleware.add = (prefix, staticPath) => {
    if (staticPaths.has(prefix)) {
      throw new Error(`Static path for prefix ${prefix} already exists`)
    }
    staticPaths.set(prefix, staticPath)
    staticMiddlewares.set(prefix, express.static(staticPath))
    logger.info(`注册静态文件服务：${prefix} -> ${staticPath}`)
  }

  middleware.remove = (prefix) => {
    staticPaths.delete(prefix)
    staticMiddlewares.delete(prefix)
    logger.info(`移除静态文件服务：${prefix}`)
  }

  return middleware
}
const dynamicStatic = createDynamicStaticMiddleware()

app.use(dynamicStatic)
app.use(bodyParser.json())
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`)
  next()
})

app.post(
  "/capture",
  upload.single("file"),
  express.text({ type: ["text/html", "text/plain", "application/xml"] }),
  async (req, res) => {
    let cleanupFunctions = []
    let options = {
      width: req.query.width ? parseInt(req.query.width) || 1280 : 1280,
      height: req.query.height ? parseInt(req.query.height) || 720 : 720,
      selector: req.query.selector || "body",
    }

    if (req.file && req.file.mimetype === "application/zip") {
      // 文件上传

      const zipFilePath = req.file.path
      const tempPath = path.join("extracted", randomUUID())
      fs.rmSync(tempPath, { recursive: true, force: true }) // 删除临时目录

      // 解压ZIP文件
      const zip = new AdmZip(zipFilePath)
      zip.extractAllTo(tempPath, true)

      // 查找index.html文件
      const indexPath = path.join(tempPath, "index.html")
      if (!fs.existsSync(indexPath)) {
        throw new Error("ZIP文件中没有找到index.html")
      }

      // 设置静态文件服务
      const staticPrefix = `/${path.basename(tempPath)}`
      dynamicStatic.add(staticPrefix, tempPath)
      options.url = `http://localhost:${port}${staticPrefix}/index.html`

      // 添加清理函数
      cleanupFunctions.push(() => {
        dynamicStatic.remove(staticPrefix)
        fs.unlinkSync(zipFilePath)
        fs.rmSync(tempPath, { recursive: true, force: true })
      })
    } else if (req.body && typeof req.body === "string" && req.body.trim()) {
      // 通过body传递HTML内容
      const tempPath = path.join("extracted", randomUUID())
      fs.mkdirSync(tempPath, { recursive: true })

      const indexPath = path.join(tempPath, "index.html")
      fs.writeFileSync(indexPath, req.body)

      // 设置静态文件服务
      const staticPrefix = `/${path.basename(tempPath)}`
      dynamicStatic.add(staticPrefix, tempPath)
      options.url = `http://localhost:${port}${staticPrefix}/index.html`

      // 添加清理函数
      cleanupFunctions.push(() => {
        dynamicStatic.remove(staticPrefix)
        try {
          fs.rmSync(tempPath, { recursive: true, force: true })
        } catch (error) {
          logger.info("资源删除失败", error)
        }
      })
    } else if (req.query.url) {
      // 通过URL获取HTML内容
      options.url = req.query.url
    } else {
      res.status(400).send("参数错误")
      return
    }

    try {
      // 调用capture函数
      const buffer = await capture(options)
      res.setHeader("Content-Type", "image/png")
      res.status(200).send(buffer)
    } catch (error) {
      res.status(500).send(error.message)
    } finally {
      // 执行所有清理函数
      setTimeout(() => {
        for (const cleanup of cleanupFunctions) {
          cleanup()
        }
      }, 1000)
    }
  }
)

app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).send("服务器出错了!")
})

app.listen(port, () => {
  logger.info(`正在监听 http://localhost:${port}`)
})
