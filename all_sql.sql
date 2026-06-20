-- 创建数据库
CREATE DATABASE IF NOT EXISTS su7_tracker DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE su7_tracker;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(30) NOT NULL UNIQUE,
    password VARCHAR(64) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    phone VARCHAR(20),
    real_name VARCHAR(50),
    status ENUM('active', 'inactive', 'banned') DEFAULT 'active',
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    UNIQUE INDEX idx_username (username),
    UNIQUE INDEX idx_email (email)
);

-- 用户积分表
CREATE TABLE IF NOT EXISTS user_points (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    points INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- 积分历史记录表
CREATE TABLE IF NOT EXISTS point_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    points_change INT NOT NULL,
    reason VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- 交付记录表
CREATE TABLE IF NOT EXISTS delivery_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_date DATE NOT NULL,
    delivery_date DATE NOT NULL,
    province VARCHAR(50) NOT NULL,
    model_type VARCHAR(50) NOT NULL,
    exterior_color VARCHAR(50) NOT NULL,
    interior_color VARCHAR(50) NOT NULL,
    user_id VARCHAR(50),
    waiting_days INT,
    status ENUM('pending', 'delivered', 'cancelled') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_order_date (order_date),
    INDEX idx_delivery_date (delivery_date),
    INDEX idx_province (province),
    INDEX idx_model_type (model_type)
);

-- 用户上传数据表
CREATE TABLE IF NOT EXISTS user_delivery_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    order_date DATE NOT NULL,
    delivery_date DATE NOT NULL,
    model VARCHAR(50) NOT NULL,
    exterior_color VARCHAR(50) NOT NULL,
    interior_color VARCHAR(50) NOT NULL,
    province VARCHAR(50) NOT NULL,
    order_id VARCHAR(50) NOT NULL,
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- 留言表
CREATE TABLE IF NOT EXISTS comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nickname VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status)
);

-- 商品分类表
CREATE TABLE IF NOT EXISTS product_categories (
    category_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 商品表
CREATE TABLE IF NOT EXISTS products (
    product_id INT AUTO_INCREMENT PRIMARY KEY,
    category_id INT NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    stock INT NOT NULL DEFAULT 0,
    image_url VARCHAR(255),
    is_hot BOOLEAN DEFAULT FALSE,
    is_new BOOLEAN DEFAULT FALSE,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES product_categories(category_id),
    INDEX idx_category (category_id),
    INDEX idx_status (status)
);

-- 购物车表
CREATE TABLE IF NOT EXISTS shopping_cart (
    cart_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (product_id) REFERENCES products(product_id),
    UNIQUE KEY unique_user_product (user_id, product_id)
);

-- 订单表
CREATE TABLE IF NOT EXISTS orders (
    order_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    order_number VARCHAR(50) NOT NULL UNIQUE,
    total_amount DECIMAL(10,2) NOT NULL,
    shipping_address TEXT NOT NULL,
    contact_phone VARCHAR(20) NOT NULL,
    contact_name VARCHAR(50) NOT NULL,
    order_status ENUM('pending', 'paid', 'shipped', 'delivered', 'cancelled') DEFAULT 'pending',
    payment_method VARCHAR(50),
    payment_status ENUM('unpaid', 'paid', 'refunded') DEFAULT 'unpaid',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    INDEX idx_order_number (order_number),
    INDEX idx_order_status (order_status)
);

-- 订单项目表
CREATE TABLE IF NOT EXISTS order_items (
    item_id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    item_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id),
    FOREIGN KEY (product_id) REFERENCES products(product_id)
);

-- 初始化商品分类数据
INSERT INTO product_categories (name, description, sort_order) VALUES
('车身配件', '包括车身外观、内饰等相关配件', 1),
('电子产品', '车载电子设备和配件', 2),
('清洁用品', '车辆清洁和保养用品', 3),
('安全用品', '行车安全相关产品', 4),
('精品周边', 'SU7品牌周边商品', 5);

-- 初始化示例商品数据
INSERT INTO products (category_id, name, description, price, stock, is_hot, is_new) VALUES
(1, 'SU7车身贴膜', '高品质TPU材质，自动修复划痕', 299.00, 100, true, true),
(1, '车门防踢膜', '透明防刮保护膜，有效保护车门', 99.00, 200, false, true),
(2, 'SU7专用行车记录仪', '2K高清录像，停车监控', 599.00, 50, true, false),
(3, 'SU7专用清洁套装', '包含洗车液、毛巾、掸子等', 199.00, 150, true, true),
(4, '智能胎压监测', '实时监测胎压和温度', 399.00, 80, false, true),
(5, 'SU7限量版模型', '1:18比例精致车模', 999.00, 30, true, true);

-- 创建管理员账户（密码：qwe123），如果不存在
INSERT IGNORE INTO users (username, password, email, status, is_admin) VALUES
('xhlm', '0e8d40eee647e8a3b7e8b15d4e3166d9ce662f3fe1f60d77669b37f0c4c75d8e', 'admin@su7tracker.com', 'active', TRUE);

-- MySQL 5.7不支持IF NOT EXISTS，使用更兼容的方式添加字段
ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;

-- 将用户xhlm设置为管理员
UPDATE users SET is_admin = TRUE WHERE username = 'xhlm';
