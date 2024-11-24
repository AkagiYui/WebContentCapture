import playwright from "playwright"
import { cpus } from "os"

const logger = {
  info: (...args) => {
    const timestamp = new Date().toLocaleString();
    console.log(`${timestamp} [INFO]`, ...args);
  },
}

class ContextPool {
  constructor(maxBrowsers = 1, maxContextsPerBrowser = 5) {
    this.pool = []
    this.maxBrowsers = maxBrowsers
    this.maxContextsPerBrowser = maxContextsPerBrowser
  }

  async getContext() {
    // 找一个有空闲context的浏览器
    for (const b of this.pool) {
      if (b.contexts.length < this.maxContextsPerBrowser) {
        const context = await b.browser.newContext()
        b.contexts.push(context)
        return context
      }
    }

    // 如果没有空闲context，但是还有空闲浏览器，创建一个新的context
    if (this.pool.length < this.maxBrowsers) {
      const browser = await playwright.chromium.launch({ headless: true })
      const context = await browser.newContext()
      this.pool.push({ browser, contexts: [context] })
      return context
    }

    // 如果没有空闲context，也没有空闲浏览器，等待有空闲context的浏览器
    return new Promise((resolve) => {
      logger.info(`等待浏览器空闲`)
      const checkAvailability = setInterval(async () => {
        for (const b of this.pool) {
          if (b.contexts.length < this.maxContextsPerBrowser) {
            logger.info(`浏览器已空闲`)
            clearInterval(checkAvailability)
            const context = await b.browser.newContext()
            b.contexts.push(context)
            resolve(context)
          }
        }
      }, 100)
    })
  }

  async releaseContext(context) {
    const browser = context.browser()
    for (const b of this.pool) {
      if (b.browser === browser) {
        const index = b.contexts.indexOf(context)
        if (index > -1) {
          b.contexts.splice(index, 1) // 从池中移除
          await context.close()
        }
        break
      }
    }
  }

  async closeAll() {
    for (const b of this.pool) {
      await b.browser.close()
    }
    this.pool = []
  }
}

const pool = new ContextPool(1, cpus().length)

export const capture = async (options) => {
  if (!options.url) {
    throw new Error("url不能为空")
  }

  const context = await pool.getContext()
  const page = await context.newPage()
  await page.setViewportSize({
    width: options.width || 1280,
    height: options.height || 720,
  })

  try {
    await page.goto(options.url)

    // 滚动到底部
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0
        const distance = 100
        const maxScrollHeight = 100000 // 最大滚动高度

        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight
          window.scrollBy(0, distance)
          totalHeight += distance

          if (totalHeight >= scrollHeight || totalHeight >= maxScrollHeight) {
            clearInterval(timer)
            resolve()
          }
        }, 100)
      })
    })
    // console.log("滚动完成")

    const element = await page.$(options.selector || "body")
    if (element) {
      return await element.screenshot({
        path: "screenshot.png",
      })
    }
  } finally {
    await page.close()
    await pool.releaseContext(context)
  }
}

// 在应用退出时关闭所有浏览器
process.on("exit", async () => {
  await pool.closeAll()
})
