-- 用户表
CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(30) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    phone VARCHAR(20),
    real_name VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    status ENUM('active', 'inactive', 'banned') DEFAULT 'active'
);

-- 商品分类表
CREATE TABLE IF NOT EXISTS product_categories (
    category_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    description TEXT,
    icon VARCHAR(200),
    sort_order INT DEFAULT 0
);

-- 商品表
CREATE TABLE IF NOT EXISTS products (
    product_id INT AUTO_INCREMENT PRIMARY KEY,
    category_id INT,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    original_price DECIMAL(10, 2),
    stock INT DEFAULT 0,
    image_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
    status ENUM('available', 'out_of_stock', 'discontinued') DEFAULT 'available',
    is_hot BOOLEAN DEFAULT FALSE,
    is_new BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (category_id) REFERENCES product_categories(category_id)
);

-- 购物车表
CREATE TABLE IF NOT EXISTS shopping_cart (
    cart_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (product_id) REFERENCES products(product_id),
    UNIQUE KEY (user_id, product_id)
);

-- 订单表
CREATE TABLE IF NOT EXISTS orders (
    order_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    order_number VARCHAR(50) NOT NULL UNIQUE,
    total_amount DECIMAL(10, 2) NOT NULL,
    order_status ENUM('pending', 'paid', 'shipped', 'delivered', 'cancelled') DEFAULT 'pending',
    payment_method VARCHAR(50),
    shipping_address TEXT,
    contact_phone VARCHAR(20),
    contact_name VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- 订单详情表
CREATE TABLE IF NOT EXISTS order_items (
    item_id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    item_price DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id),
    FOREIGN KEY (product_id) REFERENCES products(product_id)
);

-- 向商品分类表插入初始数据
INSERT INTO product_categories (name, description, sort_order) VALUES 
('小米车品', '小米SU7原厂车品周边', 1),
('车身饰品', '车标、车贴、车身配件等', 2),
('车内用品', '车内挂饰、香水、座椅套等', 3),
('车载电子', '行车记录仪、车载充电器等', 4),
('车模模型', '小米SU7车模及收藏品', 5);

-- 向商品表插入初始数据
INSERT INTO products (category_id, name, description, price, original_price, stock, image_url, is_hot, is_new) VALUES
(1, '小米SU7车标贴', '官方授权SU7车标贴纸，防水耐用', 29.9, 39.9, 100, '/images/products/car-logo.jpg', TRUE, TRUE),
(1, '小米SU7车钥匙扣', '金属质感车钥匙扣，官方授权SU7标志', 59.9, 79.9, 50, '/images/products/keychain.jpg', TRUE, FALSE),
(2, 'SU7车身保护膜', '高清透明车身保护膜，防刮耐磨', 299.9, 399.9, 30, '/images/products/protection-film.jpg', FALSE, TRUE),
(3, 'SU7专用座椅套', '专为SU7设计的座椅套，舒适透气', 599.9, 699.9, 20, '/images/products/seat-cover.jpg', FALSE, FALSE),
(4, '小米车载充电器', '120W快充，支持多设备同时充电', 199.9, 249.9, 80, '/images/products/car-charger.jpg', TRUE, TRUE),
(5, '小米SU7 1:18车模', '高精度1:18比例SU7模型，收藏级品质', 799.9, 999.9, 10, '/images/products/car-model.jpg', TRUE, TRUE); 