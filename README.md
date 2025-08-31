# hexo-generator-image-sitemap

为Hexo生成图片站点地图（Image Sitemap）。从渲染后的HTML中提取`<img>`（含`srcset`首个候选），输出`image:image`扩展。

## 安装

```bash
npm i -D hexo-generator-image-sitemap
```

## 需求

- Hexo ≥ 6.x
- Node.js ≥ 16

## 配置

在站点`_config.yml`：

```yaml
image_sitemap:
  # posts | pages | both
  target: posts
  # 输出文件名（相对 public/）
  name: sitemap-image.xml
  # 是否包含草稿
  include_drafts: false
  # 是否把文章资产目录全部图片纳入（即使正文未引用）
  include_assets_all: false
  # 每个 <url> 的图片上限（Google 上限 1000）
  max_images_per_url: 1000
  # 去掉 ?query / #hash
  strip_query: true
  # Front-Matter 封面字段
  cover_fields: ["cover", "image", "thumbnail", "banner"]
```

## 许可证

MIT
