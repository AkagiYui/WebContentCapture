# 网页转图工具

用于将网页内容进行截图并在响应体中返回。

## 使用方法

### 安装依赖

```bash
pnpm i
```

### 启动服务

```bash
pnpm serve
```

### 请求接口

一共有三种请求方式。如果请求体包含 zip 压缩包，则优先使用压缩包中的内容，否则使用请求体中的内容，最后使用 URL 提供的链接。

#### 使用目标网页的 URL

```bash
curl -X POST http://localhost:4000/capture?url=https://www.baidu.com
```

#### 使用请求体传输 HTML 内容

```bash
curl -X POST http://localhost:4000/capture -H "Content-Type: text/plain" -d "<html><body><h1>Hello, World!</h1></body></html>"
```

#### 使用 zip 压缩包

压缩包根目录下应包含 `index.html` 文件。

```bash
curl -X POST http://localhost:4000/capture -F "file=@/path/to/your/zip/file.zip"
```

### 响应

PNG 图片数据。

### 更多参数

- `selector`: 选择器，用于指定截图的区域，默认为 `body`。
- `width`: 视口宽度，默认为 1280。
- `height`: 视口高度，默认为 720。
- `url`: 目标网页的 URL。
