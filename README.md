# 小米 SU7 交付进度追踪 · Xiaomi SU7 Delivery Tracker

一个基于众包数据的小米 SU7 交付周期预测与追踪系统。用户上传自己的下单与交付信息，系统据此做统计建模，给出某省份 + 车型组合的预计交付时间、进度和趋势。附带一个简单的车品商城与留言板。

A crowdsourced delivery-time prediction system for the Xiaomi SU7. Users submit their order and delivery records, and the system runs statistical modeling to estimate the expected wait time, progress, and trend for a given province and model. Comes with a small accessories shop and a message board.

> 作者 / Author: [@F0Xy](https://github.com/xiaohuliming) · 数据来源 / Data: 车主社区众包 / crowdsourced from the owner community

## ✨ 功能 · Features

- **交付预测**：按省份 + 车型，基于历史交付数据做线性回归与统计估计，输出预计交付日期、进度、置信度与趋势
- **数据看板**：平均 / 最短 / 最长等待天数、各省份交付情况、交付时间变化趋势
- **众包上传**：用户上传 Excel 交付记录，后台审核入库
- **车品商城 + 留言板**：商品展示、购物车、留言

## 🛠 技术栈 · Tech Stack

Node.js · Express · MySQL (mysql2) · express-session · Multer · SheetJS (xlsx) · simple-statistics · 原生 HTML/CSS/JS 前端

## 🚀 本地运行 · Getting Started

```bash
# 1. 安装依赖
npm install

# 2. SheetJS 的 xlsx 已从 npm 源下架，需从官方 CDN 单独安装
npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz

# 3. 配置环境变量
cp .env.example .env   # 然后编辑 .env 填入数据库密码等

# 4. 初始化数据库（建库 + 建表 + 种子数据）
mysql -uroot -p < all_sql.sql

# 5. 可选：导入交付数据
mysql -uroot -p su7_tracker < recovered_delivery_records.sql

# 6. 启动
node server.js
# 打开 http://localhost:3000
```

数据重建脚本 `rebuild_from_uploads.py` 可把 `uploads/` 里的 Excel 重新汇总成 `delivery_records` 的导入 SQL。

## 🔐 安全 · Security

- 所有密钥通过环境变量注入，仓库内不含任何真实凭据，见 `.env.example`
- 部署前请务必：修改数据库密码、`SESSION_SECRET`、以及默认管理员账号密码

## 📊 数据说明 · Data

`uploads/` 与 `recovered_delivery_records.sql` 为车主社区众包的交付记录，仅含昵称、地区、车型配置与日期，不含手机号、真实姓名等隐私信息。
