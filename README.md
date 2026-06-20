# 小米 SU7 交付追踪 · Xiaomi SU7 Delivery Tracker

![Node.js](https://img.shields.io/badge/Node.js-%3E%3D12-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?style=flat-square&logo=express&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?style=flat-square&logo=mysql&logoColor=white)

[简体中文](#简体中文) · [English](#english)

---

## 简体中文

基于车主社区众包数据的小米 SU7 交付周期预测与追踪系统。用户提交下单与交付信息，系统按省份与车型聚合历史样本进行统计建模，给出预计交付时间、进度、置信度与趋势。

### 概述

该项目最初为应对小米 SU7 交付周期信息不透明而搭建。车主以匿名昵称上传自己的下单日期、下线日期、车型与配置、所在地区，平台汇总后对外提供按地区与车型的交付预测与数据看板，并附带车品商城与留言板等社区功能。

### 功能特性

- 交付预测：按省份与车型，基于历史交付样本估计等待天数、预计交付日期、完成进度与置信度
- 数据看板：平均 / 最短 / 最长等待天数、各省份交付分布、交付时间变化趋势
- 众包数据：用户通过 Excel 上传交付记录，经管理员审核后入库
- 社区功能：留言板、用户注册登录、积分
- 车品商城：商品分类、商品详情、购物车、订单

### 预测方法

1. 按 `(province, model_type, status = 'delivered')` 筛选历史交付记录
2. 以下单日期为自变量、实际等待天数为因变量，使用 `simple-statistics` 做线性回归，刻画交付时间的变化趋势
3. 当某地区样本量不足时，回退至全国同车型样本
4. 综合样本量、拟合误差与趋势三项加权，输出预测置信度
5. 结合近 30 天交付窗口给出当前进度估计

### 技术栈

| 层 | 选型 |
| --- | --- |
| 运行时 | Node.js (>= 12) |
| 框架 | Express 4 |
| 数据库 | MySQL 8 (mysql2/promise) |
| 会话与安全 | express-session, express-rate-limit, svg-captcha, Joi |
| 文件与数据 | Multer, SheetJS (xlsx), simple-statistics |
| 前端 | 原生 HTML / CSS / JavaScript |

### 项目结构

```
xiaomi-su7-tracker/
├── server.js                      # Express 服务与全部 API
├── public/                        # 前端静态资源
│   ├── index.html                 # 交付预测主页
│   ├── shop.html / cart.html      # 商城与购物车
│   ├── login.html / register.html # 登录与注册
│   └── admin/                     # 管理后台
├── all_sql.sql                    # 建库 + 建表 + 种子数据
├── schema.sql / sql/init.sql      # 表结构定义
├── recovered_delivery_records.sql # 交付数据
├── rebuild_from_uploads.py        # 从 uploads 重建交付数据
├── import_data.py                 # 早期单文件导入脚本
├── uploads/                       # 众包上传的 Excel
├── ER.pdf                         # 数据库 ER 图
└── .env.example                   # 环境变量样例
```

### 快速开始

环境要求：Node.js >= 12、MySQL 8。

```bash
# 1. 安装依赖
npm install

# 2. SheetJS 的 xlsx 已从公共 npm 源下架，需从官方 CDN 单独安装
npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz

# 3. 配置环境变量
cp .env.example .env        # 编辑 .env 填入数据库密码、管理员凭据等

# 4. 初始化数据库
mysql -u root -p < all_sql.sql

# 5. 可选：导入交付数据
mysql -u root -p su7_tracker < recovered_delivery_records.sql

# 6. 启动服务
node server.js              # 默认监听 http://localhost:3000
```

`rebuild_from_uploads.py` 可将 `uploads/` 下的 Excel 重新汇总为 `delivery_records` 的导入 SQL。

### 环境变量

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `DB_HOST` | MySQL 主机 | `localhost` |
| `DB_USER` | MySQL 用户 | `root` |
| `DB_PASSWORD` | MySQL 密码 | 空 |
| `DB_NAME` | 数据库名 | `su7_tracker` |
| `SESSION_SECRET` | 会话加密密钥 | 占位值 |
| `ADMIN_USER` | 管理员用户名 | `admin` |
| `ADMIN_PASSWORD` | 管理员密码 | 空 |
| `ADMIN_TOKEN` | 管理后台 API token | `admin_token` |

### API 接口

交付与数据

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/provinces` | 可选省份列表 |
| POST | `/api/calculate-progress` | 计算交付进度与预测 |
| POST | `/api/delivery-data` | 交付数据看板查询 |
| POST | `/api/preview-data` | 预览待导入数据 |
| POST | `/api/upload-data` | 上传交付数据 |

用户与认证

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/register` `/api/login` `/api/logout` | 注册 / 登录 / 登出 |
| GET | `/api/check-auth` | 登录态检查 |
| GET | `/api/captcha` | 图形验证码 |
| GET / PUT | `/api/user/profile` | 用户资料 |
| POST | `/api/user/upload-data` | 用户提交交付数据 |
| GET | `/api/user/points` | 用户积分 |

商城

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/product-categories` `/api/products` | 分类与商品 |
| GET / POST / PUT / DELETE | `/api/cart` | 购物车 |
| GET / POST | `/api/orders` | 订单 |

管理后台

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/admin/login` | 管理员登录 |
| GET | `/api/admin/user-data` | 待审核的用户数据 |
| POST | `/api/admin/review-user-data` | 审核用户数据 |
| GET / POST | `/api/admin/comments` | 留言审核 |

### 安全

- 所有凭据通过环境变量注入，仓库不含真实密钥，参见 `.env.example`
- 部署前请修改 `SESSION_SECRET`、数据库密码与默认管理员凭据
- 已启用请求频率限制、图形验证码与 Joi 输入校验

### 数据说明

`uploads/` 与 `recovered_delivery_records.sql` 为车主社区众包的交付记录，仅包含昵称、地区、车型配置与日期，不含手机号、真实姓名等个人隐私信息。预测结果基于历史样本估计，仅供参考，不代表官方交付承诺。

### 许可

本项目用于学习与个人作品展示。如需复用，请先联系作者。

---

## English

A crowdsourced delivery-time prediction and tracking system for the Xiaomi SU7. Users submit order and delivery records; the system aggregates historical samples by province and model to estimate the expected delivery window, progress, confidence, and trend.

### Overview

The project was originally built to address the lack of transparency around Xiaomi SU7 delivery times. Owners upload their order date, production-completion date, model and configuration, and region under an anonymous nickname. The platform aggregates these records and offers delivery predictions and dashboards by region and model, alongside community features such as an accessories shop and a message board.

### Features

- Delivery prediction: estimates wait days, expected delivery date, progress, and confidence by province and model from historical samples
- Dashboard: average / minimum / maximum wait days, per-province distribution, and delivery-time trend
- Crowdsourced data: users upload delivery records via Excel, ingested after admin review
- Community: message board, user registration and login, points
- Accessories shop: categories, product detail, cart, and orders

### Methodology

1. Filter historical records by `(province, model_type, status = 'delivered')`
2. Run a linear regression with `simple-statistics`, using order date as the predictor and actual wait days as the response, to capture the delivery-time trend
3. Fall back to nationwide samples of the same model when a region has too few records
4. Weight sample size, fit error, and trend to produce a prediction confidence
5. Combine a recent 30-day delivery window to estimate current progress

### Tech Stack

| Layer | Choice |
| --- | --- |
| Runtime | Node.js (>= 12) |
| Framework | Express 4 |
| Database | MySQL 8 (mysql2/promise) |
| Session & security | express-session, express-rate-limit, svg-captcha, Joi |
| Files & data | Multer, SheetJS (xlsx), simple-statistics |
| Frontend | Vanilla HTML / CSS / JavaScript |

### Project Structure

```
xiaomi-su7-tracker/
├── server.js                      # Express server and all APIs
├── public/                        # Frontend static assets
│   ├── index.html                 # Delivery prediction homepage
│   ├── shop.html / cart.html      # Shop and cart
│   ├── login.html / register.html # Login and registration
│   └── admin/                     # Admin console
├── all_sql.sql                    # Database, tables, and seed data
├── schema.sql / sql/init.sql      # Table definitions
├── recovered_delivery_records.sql # Delivery data
├── rebuild_from_uploads.py        # Rebuild delivery data from uploads
├── import_data.py                 # Early single-file import script
├── uploads/                       # Crowdsourced Excel uploads
├── ER.pdf                         # Database ER diagram
└── .env.example                   # Environment variable template
```

### Getting Started

Requirements: Node.js >= 12 and MySQL 8.

```bash
# 1. Install dependencies
npm install

# 2. SheetJS xlsx has been removed from the public npm registry; install from the official CDN
npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz

# 3. Configure environment variables
cp .env.example .env        # edit .env with your DB password, admin credentials, etc.

# 4. Initialize the database
mysql -u root -p < all_sql.sql

# 5. Optional: import delivery data
mysql -u root -p su7_tracker < recovered_delivery_records.sql

# 6. Start the server
node server.js              # listens on http://localhost:3000 by default
```

`rebuild_from_uploads.py` rebuilds the Excel files under `uploads/` into import SQL for `delivery_records`.

### Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `DB_HOST` | MySQL host | `localhost` |
| `DB_USER` | MySQL user | `root` |
| `DB_PASSWORD` | MySQL password | empty |
| `DB_NAME` | Database name | `su7_tracker` |
| `SESSION_SECRET` | Session secret | placeholder |
| `ADMIN_USER` | Admin username | `admin` |
| `ADMIN_PASSWORD` | Admin password | empty |
| `ADMIN_TOKEN` | Admin API token | `admin_token` |

### API Endpoints

Delivery & Data

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/provinces` | Available provinces |
| POST | `/api/calculate-progress` | Compute delivery progress and prediction |
| POST | `/api/delivery-data` | Dashboard data query |
| POST | `/api/preview-data` | Preview data before import |
| POST | `/api/upload-data` | Upload delivery data |

Users & Auth

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/register` `/api/login` `/api/logout` | Register / login / logout |
| GET | `/api/check-auth` | Auth status check |
| GET | `/api/captcha` | Image captcha |
| GET / PUT | `/api/user/profile` | User profile |
| POST | `/api/user/upload-data` | Submit delivery data |
| GET | `/api/user/points` | User points |

Shop

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/product-categories` `/api/products` | Categories and products |
| GET / POST / PUT / DELETE | `/api/cart` | Shopping cart |
| GET / POST | `/api/orders` | Orders |

Admin

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/admin/login` | Admin login |
| GET | `/api/admin/user-data` | Pending user submissions |
| POST | `/api/admin/review-user-data` | Review user submissions |
| GET / POST | `/api/admin/comments` | Comment moderation |

### Security

- All credentials are injected via environment variables; the repository contains no real secrets. See `.env.example`
- Before deploying, change `SESSION_SECRET`, the database password, and the default admin credentials
- Rate limiting, image captcha, and Joi input validation are enabled

### Data & Disclaimer

`uploads/` and `recovered_delivery_records.sql` contain crowdsourced delivery records from the owner community. They include only nicknames, regions, model configurations, and dates, with no phone numbers, real names, or other personal information. Predictions are estimates based on historical samples and do not represent official delivery commitments.

### License

For learning and personal portfolio use. Please contact the author before reusing.
