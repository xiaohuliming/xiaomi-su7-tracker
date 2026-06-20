require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const app = express();
const ss = require('simple-statistics');
const fs = require('fs');
const session = require('express-session');
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const svgCaptcha = require('svg-captcha');

// 禁用控制台日志输出（生产环境）
if (process.env.NODE_ENV === 'production') {
    console.log = function () {}; // 禁用 console.log
    console.warn = function () {}; // 禁用 console.warn
    console.error = function () {}; // 禁用 console.error
}

// 辅助函数定义
function calculateRSquared(actual, predicted) {
    const mean = actual.reduce((sum, val) => sum + val, 0) / actual.length;
    const ssTotal = actual.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0);
    const ssResidual = actual.reduce((sum, val, i) => sum + Math.pow(val - predicted[i], 2), 0);
    return 1 - (ssResidual / ssTotal);
}

// 配置文件上传
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        // 检查文件类型
        if (!file.originalname.match(/\.(xlsx|xls)$/)) {
            return cb(new Error('只能上传 Excel 文件'));
        }
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 限制5MB
    }
});

// 数据库配置
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'su7_tracker'
});

// 启用 JSON 解析
app.use(express.json());

// 移除 CSRF 中间件
// const csrf = require('csrf');
// app.use(csrf({
//     cookie: {
//         httpOnly: false, // 防止客户端 JavaScript 访问
//         secure: false,
//         sameSite: 'strict' // 防止跨站请求
//     }
// }));

// 配置静态文件服务
app.use(express.static('public'));

// 添加会话中间件
app.use(session({
    secret: process.env.SESSION_SECRET || 'change-me-in-env',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }  // 在生产环境中应该设置为 true
}));

// 生成验证码 API
app.get('/api/captcha', (req, res) => {
    const captcha = svgCaptcha.create({
        size: 6, // 验证码字符长度
        ignoreChars: '0o1iIl', // 排除易混淆的字符
        noise: 2, // 干扰线条数量
        color: true, // 是否使用彩色
        background: '#ccf2ff' // 背景色
    });

    // 将验证码文本存储到会话中
    req.session.captcha = captcha.text;

    // 返回验证码图片（SVG 格式）
    res.type('svg');
    res.status(200).send(captcha.data);
});

// 改进错误处理中间件
app.use((err, req, res, next) => {
    if (err.isJoi) {
        // Joi 验证错误
        return res.status(400).json({ error: err.details[0].message });
    }
    console.error('服务器错误:', err);
    res.status(500).json({
        error: '服务器错误',
        details: err.message
    });
});

// 添加路由日志中间件
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    next();
});

// 启用 CORS
// app.use(cors());

// 修改根路由，不再传递 CSRF Token
app.get('/', (req, res) => {
    try {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } catch (error) {
        console.error('Failed to send file:', error);
        res.status(500).send('Internal Server Error');
    }
});

// 修改日期转换函数
function convertDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    try {
        // 处理 "M/D/YY" 格式
        const [month, day, year] = dateStr.split('/');
        // 转换两位数位数
        const fullYear = year.length === 2 ? `20${year}` : year;
        return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    } catch (error) {
        console.error('日期转换错误:', error, '原始日期:', dateStr);
        return null;
    }
}

const loginSchema = Joi.object({
    username: Joi.string().trim().min(3).max(30).required()
        .pattern(/^[a-zA-Z0-9]+$/) // 限制为字母和数字
        .messages({
            'string.empty': '用户名不能为空',
            'string.min': '用户名至少 3 个字符',
            'string.max': '用户名不能超过 30 个字符',
            'string.pattern.base': '用户名只能包含字母和数字'
        }),
    password: Joi.string().min(6).max(50).required()
        .messages({
            'string.empty': '密码不能为空',
            'string.min': '密码至少 6 个字符',
            'string.max': '密码不能超过 50 个字符'
        })
});

// 修改登录 API
app.post('/api/admin/login', async (req, res) => {
    try {
        // 验证输入
        const { username, password } = await loginSchema.validateAsync(req.body);

        // 检查用户名和密码
        if (username === (process.env.ADMIN_USER || 'admin') && password === (process.env.ADMIN_PASSWORD || '')) {
            req.session.isAuthenticated = true;
            res.json({ success: true });
        } else {
            res.status(401).json({ message: '用户名或密码错误' });
        }
    } catch (error) {
        if (error.isJoi) {
            // Joi 验证错误
            return res.status(400).json({ error: error.details[0].message });
        }
        console.error('登录失败:', error);
        res.status(500).json({ error: '登录失败' });
    }
});

// 检查认证状态
app.get('/api/admin/check-auth', (req, res) => {
    if (req.session.isAuthenticated) {
        res.json({ authenticated: true });
    } else {
        res.status(401).json({ message: '未登录' });
    }
});

// 退出登录
app.get('/api/admin/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// 添加认证中间件
function requireAuth(req, res, next) {
    console.log('检查认证状态', req.session.isAuthenticated, req.headers.authorization);
    
    if (req.session.isAuthenticated) {
        // 管理员已通过会话认证
        console.log('使用会话认证通过');
        next();
    } else {
        // 检查从localStorage中获取的认证信息
        const token = req.headers.authorization;
        console.log('收到Authorization头:', token);
        const adminToken = process.env.ADMIN_TOKEN || 'admin_token';
        if (token && (token === 'Bearer ' + adminToken || token.includes(adminToken))) {
            console.log('使用token认证通过');
            next();
        } else {
            console.log('认证失败');
            res.status(401).json({ message: '未登录或认证已过期' });
        }
    }
}

// 修改上传相关的API，移除认证
app.post('/api/upload-data', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '没有上传文件' });
        }

        console.log('接收到文件:', req.file.originalname);
        console.log('开始处理文件:', req.file.filename);

        // 读取Excel文件
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet, {
            raw: false
        });

        console.log('Excel数据读取成功，行数:', data.length);
        console.log('第一行数据示例:', data[0]);

        // 获取数据库连接
        const conn = await pool.getConnection();
        let importedCount = 0;

        try {
            await conn.beginTransaction();

            for (const row of data) {
                console.log('处理行数据:', row);

                // 使用正确的字名称获取数据
                const orderDate = row['预约日期'];
                const deliveryDate = row['下线日期'];
                const modelType = row['车型'];
                const exteriorColor = row['外观颜色'];
                const interiorColor = row['内饰颜色'];
                const province = row['地区'];
                const userId = row['ID'];
                const waitingDays = row['等待'];

                // 处理日期
                const formattedOrderDate = convertDate(orderDate);
                const formattedDeliveryDate = convertDate(deliveryDate);

                if (!formattedOrderDate || !formattedDeliveryDate) {
                    console.warn('跳过无效日期的:', row);
                    continue;
                }

                console.log('准备数据:', {
                    orderDate: formattedOrderDate,
                    expectedDeliveryDate: formattedDeliveryDate,
                    province,
                    exteriorColor,
                    interiorColor,
                    userId,
                    waitingDays,
                    model_type: modelType
                });

                await conn.execute(
                    `INSERT INTO delivery_records (
                        order_date, 
                        delivery_date, 
                        province, 
                        exterior_color, 
                        interior_color, 
                        user_id, 
                        waiting_days,
                        model_type,
                        status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        formattedOrderDate,
                        formattedDeliveryDate,
                        province,
                        exteriorColor,
                        interiorColor,
                        userId,
                        parseInt(waitingDays) || null,
                        modelType,
                        'delivered'
                    ]
                );
                importedCount++;
            }

            await conn.commit();
            console.log('数据导入成功，共导入:', importedCount, '条记录');
            res.json({ success: true, importedCount });
        } catch (error) {
            await conn.rollback();
            console.error('数据导入错误:', error);
            console.error('错误堆栈:', error.stack);
            throw error;
        } finally {
            conn.release();
        }

        // 处理完成后删除临时文件
        fs.unlink(req.file.path, (err) => {
            if (err) console.error('删除临时文件失败:', err);
        });
    } catch (error) {
        console.error('导入数据错误:', error);
        // 如果有临时文件，删除它
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('删除临时文件失败:', err);
            });
        }
        res.status(500).json({
            error: '导入数据时发生错误: ' + error.message,
            details: error.stack
        });
    }
});

// 修改上传相关的API，移除认证
app.post('/api/preview-data', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '没有传文件' });
        }

        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet, {
            raw: false,
            dateNF: 'yyyy/mm/dd'
        });

        // 只返回前5行数据用于预览
        res.json({
            success: true,
            preview: data.slice(0, 5)
        });
    } catch (error) {
        console.error('预览数据错误:', error);
        res.status(500).json({ error: '预览数据时发生错误: ' + error.message });
    }
});

// 保持原有的进度计算API
app.post('/api/calculate-progress', async (req, res) => {
    try {
        const { orderDate, province, modelType } = req.body;
        console.log('收到进度计算请求:', { orderDate, province, modelType });

        // 验证输入参数
        if (!orderDate || !province || !modelType) {
            throw new Error('缺少必要参数');
        }

        // 查询历史交付数据
        const [deliveryData] = await pool.query(`
            SELECT 
                DATEDIFF(delivery_date, order_date) as actual_wait_days,
                order_date,
                delivery_date
            FROM delivery_records
            WHERE province = ? 
            AND model_type = ?
            AND status = 'delivered'
            ORDER BY order_date DESC
        `, [province, modelType]);

        console.log('历史交付数据数量:', deliveryData.length);

        if (deliveryData.length > 0) {
            // 首先初始化所有日期相关变量
            const orderDateTime = new Date(orderDate);
            const today = new Date();
            const daysPassed = Math.floor((today - orderDateTime) / (1000 * 60 * 60 * 24));

            // 获取最近30天的交付数据（仅用于显示区间）
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const recentDeliveries = deliveryData.filter(record =>
                new Date(record.delivery_date) >= thirtyDaysAgo
            );

            // 使用全部数据进行线性回归
            const points = deliveryData.map((record, index) => {
                const orderTimestamp = new Date(record.order_date).getTime();
                return [
                    orderTimestamp,
                    record.actual_wait_days
                ];
            });

            // 添加数据量检查
            if (points.length < 5) { // 修正条件
                console.log('数据量不足用全国数据');
                // 查询全国数据
                const [nationalData] = await pool.query(`
                    SELECT 
                        DATEDIFF(delivery_date, order_date) as actual_wait_days,
                        order_date,
                        delivery_date
                    FROM delivery_records
                    WHERE model_type = ?
                    AND status = 'delivered'
                    ORDER BY order_date DESC
                `, [modelType]);

                points.push(...nationalData.map(record => [
                    new Date(record.order_date).getTime(),
                    record.actual_wait_days
                ]));
            }

            // 计算线性回归
            const regression = ss.linearRegression(points);

            // 计算预测值和实际值的差异
            const actualValues = points.map(point => point[1]);
            const predictedValues = points.map(point =>
                regression.m * point[0] + regression.b
            );

            // 计算预测误差
            const errors = actualValues.map((actual, i) => Math.abs(actual - predictedValues[i]));
            const meanError = ss.mean(errors);
            const stdError = ss.standardDeviation(errors);

            // 使用自定义函数算 R 方值
            const rSquared = calculateRSquared(actualValues, predictedValues);

            // 计算趋势可靠性
            const trendReliability = Math.min(
                points.length >= 50 ? 1 : points.length / 50  // 数据量影响（0-1）
            ) * rSquared; // R方值影响（0-1）

            // 计算平均等待天数（移到前面）
            const avgWaitDays = Math.round(
                ss.mean(deliveryData.map(d => d.actual_wait_days))
            );

            // 计算各个权重（都确保在0-1范围内）
            const dataWeight = Math.min(points.length / 30, 1); // 数据量权重
            const errorWeight = 1 - Math.min(meanError / avgWaitDays, 0.8); // 预测准确度
            const trendWeight = trendReliability; // 趋势可靠性

            // 使用回归模型预测等待天数
            const orderTimestamp = orderDateTime.getTime();
            const rawPrediction = regression.m * orderTimestamp + regression.b;

            // 计算预测区间
            const predictionInterval = stdError * 1.96; // 95% 置信区间

            const conservativePrediction = Math.max(
                30,
                Math.round(rawPrediction + predictionInterval)
            );

            // 在计算预计交付日期之前，先计算基于当前进度的预测天数
            const progress = Math.min((daysPassed / avgWaitDays) * 100, 100); // 修正这里
            const progressFixed = parseFloat(progress.toFixed(2));

            // 使用多个预测方法中的最大值作为最终预测
            const finalPrediction = Math.max(
                conservativePrediction,  // 基于回归的预测
                avgWaitDays,            // 历史平均等待时间
                Math.ceil(daysPassed / (progress / 100)) // 修正这里
            );

            const estimatedDeliveryDate = new Date(orderDateTime);
            estimatedDeliveryDate.setDate(estimatedDeliveryDate.getDate() + finalPrediction);

            // 计算预测等待天数（基于预计交付日期）
            const predictedWaitDays = Math.round(
                (estimatedDeliveryDate - orderDateTime) / (1000 * 60 * 60 * 24)
            );

            // 修改置信度计算逻辑
            const confidence = Math.min(
                Math.round(
                    ((dataWeight + errorWeight + trendWeight) / 3) * // 三个权重的平均值
                    100 // 转换为百分比
                ),
                100 // 确保不超过100%
            );

            // 修改置信度计算详情
            const confidenceDetails = {
                dataWeight: Math.round(dataWeight * 100), // 转换为百分比
                errorWeight: Math.round(errorWeight * 100), // 转换为百分比
                trendWeight: Math.round(trendWeight * 100), // 转换为百分比
                dataPoints: points.length || 0 // 数据点数量
            };

            console.log('置信度计算详情:', {
                ...confidenceDetails,
                meanError,
                avgWaitDays,
                rSquared,
                rawWeights: {
                    data: dataWeight,
                    error: errorWeight,
                    trend: trendWeight
                }
            });

            // 如果预测等待天数小于平均等待天数，使用平均等待天数作为基准
            const baseWaitDays = Math.max(predictedWaitDays, avgWaitDays);

            const response = {
                progress: progressFixed,
                estimatedDeliveryDate: estimatedDeliveryDate.toISOString().split('T')[0],
                predictedWaitDays,
                avgWaitDays,
                baseWaitDays,
                confidence,
                predictionDetails: {
                    bestCase: Math.max(30, Math.round(rawPrediction - predictionInterval)),
                    worstCase: Math.round(rawPrediction + predictionInterval),
                    meanError: Math.round(meanError),
                    dataPoints: points.length,
                    rSquared: rSquared.toFixed(3),
                    confidenceDetails
                },
                trend: regression.m < 0 ? '缩短' : '延长',
                recentData: {
                    min: Math.min(...recentDeliveries.map(d => d.actual_wait_days)),
                    max: Math.max(...recentDeliveries.map(d => d.actual_wait_days)),
                    count: recentDeliveries.length,
                    period: `近30天${province}地区`,
                    sampleSize: points.length
                }
            };

            console.log('返回数据:', response);
            res.json(response);
        } else {
            // 在没有本地数据时查询全国数据
            const [avgResult] = await pool.query(`
                SELECT 
                    AVG(waiting_days) as avg_wait,
                    MIN(waiting_days) as min_wait,
                    MAX(waiting_days) as max_wait,
                    COUNT(*) as count
                FROM delivery_records
                WHERE model_type = ?
                AND status = 'delivered'
                AND waiting_days > 0
                AND delivery_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            `, [modelType]);

            const avgWaitDays = Math.round(avgResult[0].avg_wait) || 90; // 如果还是没有数据，才使用默认值
            const today = new Date();
            const orderDateTime = new Date(orderDate);
            const daysPassed = Math.floor((today - orderDateTime) / (1000 * 60 * 60 * 24));

            const progress = Math.min((daysPassed / avgWaitDays) * 100, 100); // 修正这里
            const progressFixed = parseFloat(progress.toFixed(2));

            const estimatedDeliveryDate = new Date(orderDateTime);
            estimatedDeliveryDate.setDate(estimatedDeliveryDate.getDate() + avgWaitDays);

            // 计算预测等待天数
            const predictedWaitDays = Math.round(
                (estimatedDeliveryDate - orderDateTime) / (1000 * 60 * 60 * 24)
            );

            const response = {
                progress: progressFixed,
                estimatedDeliveryDate: estimatedDeliveryDate.toISOString().split('T')[0],
                predictedWaitDays,
                avgWaitDays,
                confidence: 20, // 进一步降低没有本地数据时的置信度
                trend: '未知',
                recentData: {
                    min: avgResult[0].min_wait || avgWaitDays,
                    max: avgResult[0].max_wait || avgWaitDays,
                    count: avgResult[0].count,
                    period: '近30天全国'
                },
                predictionDetails: {
                    dataPoints: 0,
                    confidenceDetails: {
                        reason: '无本地数据'
                    }
                }
            };

            console.log('返回数据（使用全国平均值）:', response);
            res.json(response);
        }
    } catch (error) {
        console.error('计算进度时出错:', error);
        console.error('错误详情:', error.stack);
        res.status(500).json({
            error: '计算进度时出错',
            message: error.message
        });
    }
});


// 添加获取交付数据的API
app.post('/api/delivery-data', async (req, res) => {
    try {
        const { province, model, exteriorColor, interiorColor } = req.body; // 添加外观颜色和内饰颜色
        let query = `
            SELECT 
                order_date,
                delivery_date,
                province,
                model_type,
                exterior_color,
                interior_color,
                waiting_days
            FROM delivery_records
            WHERE status = 'delivered'
        `;
        const params = [];
        
        if (province) {
            query += ` AND province = ?`;
            params.push(province);
        }
        if (model) {
            query += ` AND model_type = ?`;
            params.push(model);
        }
        if (exteriorColor) {
            query += ` AND exterior_color = ?`;
            params.push(exteriorColor);
        }
        if (interiorColor) {
            query += ` AND interior_color = ?`;
            params.push(interiorColor);
        }
        
        query += ` ORDER BY delivery_date DESC LIMIT 100`;
        
        const [records] = await pool.query(query, params);
        
        // 计算统计数据
        const waitingDays = records.map(r => r.waiting_days).filter(d => d != null);
        const statistics = {
            avg: waitingDays.reduce((a, b) => a + b, 0) / waitingDays.length,
            min: Math.min(...waitingDays),
            max: Math.max(...waitingDays)
        };
        
        res.json({ records, statistics });
    } catch (error) {
        console.error('获取交付数据错误:', error);
        res.status(500).json({ error: '获取数据失败' });
    }
});

// 添加获取省份列表的API
app.get('/api/provinces', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT DISTINCT province FROM delivery_records ORDER BY province'
        );
        res.json(rows.map(row => row.province));
    } catch (error) {
        console.error('获取省份列表错误:', error);
        res.status(500).json({ error: '获取省份列表失败' });
    }
});

// 启用代理支持（如果有代理服务器，如 NGINX）
app.set('trust proxy', 1);

//留言限速
const commentLimiter = rateLimit({
    windowMs: 60 * 1000, // 时间窗口：1分钟
    max: 2, // 每个 IP 最多允许 2 次请求
    message: {
        error: '提交频率过高，请稍后再试', // 返回的错误消息
    },
    standardHeaders: true, // 返回速率限制信息到 `RateLimit-*` 的响应头
    legacyHeaders: false, // 禁用 `X-RateLimit-*` 响应头
});


// 添加留言
// 定义 Joi 验证规则
const commentSchema = Joi.object({
    nickname: Joi.string().trim().min(1).max(50).required()
        .pattern(/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/) // 限制为字母、数字、下划线、中文
        .messages({
            'string.empty': '昵称不能为空',
            'string.max': '昵称不能超过 50 个字符',
            'string.pattern.base': '昵称只能包含字母、数字、下划线和中文'
        }),
    content: Joi.string().trim().min(1).max(500).required()
        .messages({
            'string.empty': '留言内容不能为空',
            'string.max': '留言内容不能超过 500 个字符'
        })
});

// 修改 API，添加验证逻辑
app.post('/api/comments', commentLimiter, async (req, res) => {
    try {
        // 验证输入
        const { nickname, content } = await commentSchema.validateAsync(req.body);

        // 安全地插入到数据库
        const [result] = await pool.query(
            'INSERT INTO comments (nickname, content) VALUES (?, ?)',
            [nickname, content]
        );

        res.json({
            success: true,
            message: '留言提交成功，等待审核',
            commentId: result.insertId
        });
    } catch (error) {
        if (error.isJoi) {
            // Joi 验证错误
            return res.status(400).json({ error: error.details[0].message });
        }
        console.error('添加留言失败:', error);
        res.status(500).json({ error: '添加留言失败', details: error.message });
    }
});

// 获取已审核的留言
app.get('/api/comments', async (req, res) => {
    try {
        // 使用参数化查询，避免 SQL 注入
        const [comments] = await pool.query(
            'SELECT id, content, nickname, created_at, status FROM comments WHERE status = ? ORDER BY created_at DESC LIMIT 100',
            ['approved']
        );
        res.json(comments); // 返回过滤后的数据
    } catch (error) {
        console.error('获取留言失败:', error.message); // 日志记录详细信息
        res.status(500).json({ error: '获取留言失败，请稍后再试' }); // 返回通用错误信息
    }
});

// 获取所有留言（包括未审核的，仅管理员可访问）
app.get('/api/admin/comments', requireAuth, async (req, res) => {
    try {
        // 不需要检查req.user.isAdmin，因为requireAuth中间件已确保是管理员
        
        // 使用参数化查询，避免 SQL 注入
        const [comments] = await pool.query(
            'SELECT id, content, nickname, status, created_at FROM comments ORDER BY created_at DESC'
        );

        res.json(comments); // 返回所有留言数据
    } catch (error) {
        console.error('获取留言失败:', error.message);
        res.status(500).json({ error: '获取留言失败，请稍后再试' });
    }
});

// 审核留言
app.post('/api/admin/comments/review', requireAuth, async (req, res) => {
    try {
        const { id, status } = req.body;
        if (!id || !status) {
            return res.status(400).json({ error: '参数不完整' });
        }
        
        await pool.query(
            'UPDATE comments SET status = ? WHERE id = ?',
            [status, id]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('审核留言失败:', error);
        res.status(500).json({ error: '审核留言失败' });
    }
});

// 创建uploads目录（如果不存在）
try {
    if (!fs.existsSync('uploads')) {
        fs.mkdirSync('uploads', { recursive: true });
    }
    // 确保目录有正确的权限
    fs.chmodSync('uploads', 0o755);
} catch (error) {
    console.error('创建上传目录失败:', error);
}

// 用户注册验证模式
const registerSchema = Joi.object({
    username: Joi.string().trim().min(3).max(30).required()
        .pattern(/^[a-zA-Z0-9]+$/)
        .messages({
            'string.empty': '用户名不能为空',
            'string.min': '用户名至少 3 个字符',
            'string.max': '用户名不能超过 30 个字符',
            'string.pattern.base': '用户名只能包含字母和数字'
        }),
    password: Joi.string().min(6).max(50).required()
        .messages({
            'string.empty': '密码不能为空',
            'string.min': '密码至少 6 个字符',
            'string.max': '密码不能超过 50 个字符'
        }),
    email: Joi.string().email().required()
        .messages({
            'string.email': '邮箱格式不正确',
            'string.empty': '邮箱不能为空'
        }),
    phone: Joi.string().allow(''),
    real_name: Joi.string().allow('')
});

// 用户注册API
app.post('/api/register', async (req, res) => {
    try {
        // 验证输入
        const validData = await registerSchema.validateAsync(req.body);
        
        // 检查用户名是否已存在
        const [existingUsers] = await pool.query(
            'SELECT * FROM users WHERE username = ? OR email = ?',
            [validData.username, validData.email]
        );
        
        if (existingUsers.length > 0) {
            return res.status(400).json({ 
                error: '用户名或邮箱已被使用'
            });
        }
        
        // 简单哈希密码 - 在生产环境应使用bcrypt等更安全的方式
        const hashedPassword = require('crypto')
            .createHash('sha256')
            .update(validData.password)
            .digest('hex');
        
        // 插入用户数据
        const [result] = await pool.query(
            `INSERT INTO users 
            (username, password, email, phone, real_name) 
            VALUES (?, ?, ?, ?, ?)`,
            [
                validData.username, 
                hashedPassword, 
                validData.email, 
                validData.phone || null, 
                validData.real_name || null
            ]
        );
        
        // 成功注册
        res.status(201).json({
            success: true,
            userId: result.insertId,
            message: '注册成功！'
        });
        
    } catch (error) {
        console.error('注册失败:', error);
        if (error.isJoi) {
            return res.status(400).json({ error: error.details[0].message });
        }
        res.status(500).json({ error: '注册失败，请稍后再试' });
    }
});

// 用户登录API（前台用户）
app.post('/api/login', async (req, res) => {
    try {
        // 验证输入
        const { username, password } = await loginSchema.validateAsync(req.body);
        
        // 简单哈希密码 - 与注册时相同的方式
        const hashedPassword = require('crypto')
            .createHash('sha256')
            .update(password)
            .digest('hex');
        
        // 查询用户
        const [users] = await pool.query(
            'SELECT * FROM users WHERE username = ? AND password = ?',
            [username, hashedPassword]
        );
        
        if (users.length === 0) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }
        
        const user = users[0];
        
        if (user.status !== 'active') {
            return res.status(403).json({ error: '账户已被禁用' });
        }
        
        // 更新最后登录时间
        await pool.query(
            'UPDATE users SET last_login = NOW() WHERE user_id = ?',
            [user.user_id]
        );
        
        // 设置会话
        req.session.userLoggedIn = true;
        req.session.userId = user.user_id;
        req.session.username = user.username;
        
        // 返回用户信息（不包含密码）
        delete user.password;
        res.json({
            success: true,
            user,
            message: '登录成功！'
        });
        
    } catch (error) {
        console.error('登录失败:', error);
        if (error.isJoi) {
            return res.status(400).json({ error: error.details[0].message });
        }
        res.status(500).json({ error: '登录失败，请稍后再试' });
    }
});

// 用户登出API
app.post('/api/logout', (req, res) => {
    if (req.session.userLoggedIn) {
        req.session.userLoggedIn = false;
        req.session.userId = null;
        req.session.username = null;
    }
    res.json({ success: true, message: '已成功退出登录' });
});

// 检查用户登录状态API
app.get('/api/check-auth', (req, res) => {
    if (req.session.userLoggedIn) {
        res.json({
            authenticated: true,
            userId: req.session.userId,
            username: req.session.username
        });
    } else {
        res.json({ authenticated: false });
    }
});

// 用户中间件 - 验证用户是否登录
function requireUserAuth(req, res, next) {
    if (req.session.userLoggedIn) {
        next();
    } else {
        res.status(401).json({ error: '请先登录' });
    }
}

// 获取商品分类列表
app.get('/api/product-categories', async (req, res) => {
    try {
        const [categories] = await pool.query(
            'SELECT * FROM product_categories ORDER BY sort_order ASC'
        );
        res.json({ categories });
    } catch (error) {
        console.error('获取商品分类失败:', error);
        res.status(500).json({ error: '获取商品分类失败' });
    }
});

// 获取商品列表
app.get('/api/products', async (req, res) => {
    try {
        const { category_id, is_hot, is_new, keyword, page = 1, limit = 10 } = req.query;
        
        let query = 'SELECT p.*, c.name as category_name FROM products p LEFT JOIN product_categories c ON p.category_id = c.category_id WHERE 1=1';
        let queryParams = [];
        
        // 根据分类筛选
        if (category_id) {
            query += ' AND p.category_id = ?';
            queryParams.push(category_id);
        }
        
        // 热销商品
        if (is_hot === 'true') {
            query += ' AND p.is_hot = TRUE';
        }
        
        // 新品
        if (is_new === 'true') {
            query += ' AND p.is_new = TRUE';
        }
        
        // 关键词搜索
        if (keyword) {
            query += ' AND (p.name LIKE ? OR p.description LIKE ?)';
            queryParams.push(`%${keyword}%`);
            queryParams.push(`%${keyword}%`);
        }
        
        // 添加排序
        query += ' ORDER BY p.created_at DESC';
        
        // 分页
        const offset = (page - 1) * limit;
        query += ' LIMIT ? OFFSET ?';
        queryParams.push(parseInt(limit), offset);
        
        // 执行查询
        const [products] = await pool.query(query, queryParams);
        
        // 获取商品总数（用于分页）
        let countQuery = 'SELECT COUNT(*) as total FROM products WHERE 1=1';
        let countParams = [];
        
        // 根据分类筛选
        if (category_id) {
            countQuery += ' AND category_id = ?';
            countParams.push(category_id);
        }
        
        // 热销商品
        if (is_hot === 'true') {
            countQuery += ' AND is_hot = TRUE';
        }
        
        // 新品
        if (is_new === 'true') {
            countQuery += ' AND is_new = TRUE';
        }
        
        // 关键词搜索
        if (keyword) {
            countQuery += ' AND (name LIKE ? OR description LIKE ?)';
            countParams.push(`%${keyword}%`);
            countParams.push(`%${keyword}%`);
        }
        
        const [countResult] = await pool.query(countQuery, countParams);
        const total = countResult[0].total;
        
        res.json({
            products,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('获取商品列表失败:', error);
        res.status(500).json({ error: '获取商品列表失败' });
    }
});

// 获取商品详情
app.get('/api/products/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        
        const [products] = await pool.query(
            `SELECT p.*, c.name as category_name 
             FROM products p 
             LEFT JOIN product_categories c ON p.category_id = c.category_id 
             WHERE p.product_id = ?`,
            [productId]
        );
        
        if (products.length === 0) {
            return res.status(404).json({ error: '商品不存在' });
        }
        
        res.json({ product: products[0] });
    } catch (error) {
        console.error('获取商品详情失败:', error);
        res.status(500).json({ error: '获取商品详情失败' });
    }
});

// 添加商品到购物车
app.post('/api/cart', requireUserAuth, async (req, res) => {
    try {
        const { product_id, quantity = 1 } = req.body;
        const userId = req.session.userId;
        
        // 检查商品是否存在
        const [products] = await pool.query(
            'SELECT * FROM products WHERE product_id = ?',
            [product_id]
        );
        
        if (products.length === 0) {
            return res.status(404).json({ error: '商品不存在' });
        }
        
        // 检查库存
        if (products[0].stock < quantity) {
            return res.status(400).json({ error: '商品库存不足' });
        }
        
        // 检查购物车中是否已有此商品
        const [cartItems] = await pool.query(
            'SELECT * FROM shopping_cart WHERE user_id = ? AND product_id = ?',
            [userId, product_id]
        );
        
        if (cartItems.length > 0) {
            // 更新数量
            await pool.query(
                'UPDATE shopping_cart SET quantity = quantity + ? WHERE user_id = ? AND product_id = ?',
                [quantity, userId, product_id]
            );
        } else {
            // 添加到购物车
            await pool.query(
                'INSERT INTO shopping_cart (user_id, product_id, quantity) VALUES (?, ?, ?)',
                [userId, product_id, quantity]
            );
        }
        
        res.json({ success: true, message: '已添加到购物车' });
    } catch (error) {
        console.error('添加购物车失败:', error);
        res.status(500).json({ error: '添加购物车失败' });
    }
});

// 获取购物车列表
app.get('/api/cart', requireUserAuth, async (req, res) => {
    try {
        const userId = req.session.userId;
        
        const [cartItems] = await pool.query(
            `SELECT c.cart_id, c.product_id, c.quantity, 
                    p.name, p.price, p.image_url, p.stock
             FROM shopping_cart c
             JOIN products p ON c.product_id = p.product_id
             WHERE c.user_id = ?
             ORDER BY c.created_at DESC`,
            [userId]
        );
        
        // 计算总价
        const totalPrice = cartItems.reduce((sum, item) => {
            return sum + (item.price * item.quantity);
        }, 0).toFixed(2);
        
        res.json({
            items: cartItems,
            totalPrice,
            totalItems: cartItems.length
        });
    } catch (error) {
        console.error('获取购物车失败:', error);
        res.status(500).json({ error: '获取购物车失败' });
    }
});

// 更新购物车商品数量
app.put('/api/cart/:cartId', requireUserAuth, async (req, res) => {
    try {
        const { cartId } = req.params;
        const { quantity } = req.body;
        const userId = req.session.userId;
        
        // 验证数量
        if (quantity < 1) {
            return res.status(400).json({ error: '数量必须大于0' });
        }
        
        // 验证所有权
        const [cartItems] = await pool.query(
            'SELECT * FROM shopping_cart WHERE cart_id = ? AND user_id = ?',
            [cartId, userId]
        );
        
        if (cartItems.length === 0) {
            return res.status(404).json({ error: '购物车项不存在' });
        }
        
        // 检查库存
        const [products] = await pool.query(
            'SELECT * FROM products WHERE product_id = ?',
            [cartItems[0].product_id]
        );
        
        if (products[0].stock < quantity) {
            return res.status(400).json({ error: '商品库存不足' });
        }
        
        // 更新数量
        await pool.query(
            'UPDATE shopping_cart SET quantity = ? WHERE cart_id = ?',
            [quantity, cartId]
        );
        
        res.json({ success: true, message: '购物车已更新' });
    } catch (error) {
        console.error('更新购物车失败:', error);
        res.status(500).json({ error: '更新购物车失败' });
    }
});

// 删除购物车商品
app.delete('/api/cart/:cartId', requireUserAuth, async (req, res) => {
    try {
        const { cartId } = req.params;
        const userId = req.session.userId;
        
        // 验证所有权
        const [cartItems] = await pool.query(
            'SELECT * FROM shopping_cart WHERE cart_id = ? AND user_id = ?',
            [cartId, userId]
        );
        
        if (cartItems.length === 0) {
            return res.status(404).json({ error: '购物车项不存在' });
        }
        
        // 删除购物车项
        await pool.query(
            'DELETE FROM shopping_cart WHERE cart_id = ?',
            [cartId]
        );
        
        res.json({ success: true, message: '已从购物车中移除' });
    } catch (error) {
        console.error('删除购物车项失败:', error);
        res.status(500).json({ error: '删除购物车项失败' });
    }
});

// 创建订单
app.post('/api/orders', requireUserAuth, async (req, res) => {
    try {
        const userId = req.session.userId;
        const { shipping_address, contact_phone, contact_name, payment_method } = req.body;
        
        // 验证输入
        if (!shipping_address || !contact_phone || !contact_name) {
            return res.status(400).json({ error: '请填写完整的收货信息' });
        }
        
        // 获取购物车内容
        const [cartItems] = await pool.query(
            `SELECT c.product_id, c.quantity, p.price, p.stock, p.name
             FROM shopping_cart c
             JOIN products p ON c.product_id = p.product_id
             WHERE c.user_id = ?`,
            [userId]
        );
        
        if (cartItems.length === 0) {
            return res.status(400).json({ error: '购物车为空' });
        }
        
        // 检查库存
        for (const item of cartItems) {
            if (item.stock < item.quantity) {
                return res.status(400).json({
                    error: `商品 "${item.name}" 库存不足，当前库存: ${item.stock}`
                });
            }
        }
        
        // 计算总价
        const totalAmount = cartItems.reduce((sum, item) => {
            return sum + (item.price * item.quantity);
        }, 0);
        
        // 生成订单号
        const orderNumber = `ORDER${Date.now()}${Math.floor(Math.random() * 1000)}`;
        
        // 使用事务确保操作的原子性
        const connection = await pool.getConnection();
        await connection.beginTransaction();
        
        try {
            // 创建订单
            const [orderResult] = await connection.query(
                `INSERT INTO orders 
                (user_id, order_number, total_amount, shipping_address, contact_phone, contact_name, payment_method)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [userId, orderNumber, totalAmount, shipping_address, contact_phone, contact_name, payment_method]
            );
            
            const orderId = orderResult.insertId;
            
            // 添加订单项目
            for (const item of cartItems) {
                await connection.query(
                    `INSERT INTO order_items
                    (order_id, product_id, quantity, item_price)
                    VALUES (?, ?, ?, ?)`,
                    [orderId, item.product_id, item.quantity, item.price]
                );
                
                // 减少库存
                await connection.query(
                    'UPDATE products SET stock = stock - ? WHERE product_id = ?',
                    [item.quantity, item.product_id]
                );
            }
            
            // 清空购物车
            await connection.query(
                'DELETE FROM shopping_cart WHERE user_id = ?',
                [userId]
            );
            
            await connection.commit();
            
            res.status(201).json({
                success: true,
                orderId,
                orderNumber,
                message: '订单创建成功'
            });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('创建订单失败:', error);
        res.status(500).json({ error: '创建订单失败' });
    }
});

// 获取用户订单列表
app.get('/api/orders', requireUserAuth, async (req, res) => {
    try {
        const userId = req.session.userId;
        const { page = 1, limit = 10 } = req.query;
        
        const offset = (page - 1) * limit;
        
        const [orders] = await pool.query(
            `SELECT * FROM orders 
             WHERE user_id = ? 
             ORDER BY created_at DESC
             LIMIT ? OFFSET ?`,
            [userId, parseInt(limit), offset]
        );
        
        // 获取订单总数（用于分页）
        const [countResult] = await pool.query(
            'SELECT COUNT(*) as total FROM orders WHERE user_id = ?',
            [userId]
        );
        
        const total = countResult[0].total;
        
        res.json({
            orders,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('获取订单列表失败:', error);
        res.status(500).json({ error: '获取订单列表失败' });
    }
});

// 获取订单详情
app.get('/api/orders/:orderId', requireUserAuth, async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.session.userId;
        
        // 获取订单信息
        const [orders] = await pool.query(
            'SELECT * FROM orders WHERE order_id = ? AND user_id = ?',
            [orderId, userId]
        );
        
        if (orders.length === 0) {
            return res.status(404).json({ error: '订单不存在' });
        }
        
        // 获取订单项
        const [orderItems] = await pool.query(
            `SELECT oi.*, p.name, p.image_url
             FROM order_items oi
             JOIN products p ON oi.product_id = p.product_id
             WHERE oi.order_id = ?`,
            [orderId]
        );
        
        res.json({
            order: orders[0],
            items: orderItems
        });
    } catch (error) {
        console.error('获取订单详情失败:', error);
        res.status(500).json({ error: '获取订单详情失败' });
    }
});

// 取消订单（仅限待付款状态）
app.post('/api/orders/:orderId/cancel', requireUserAuth, async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.session.userId;
        
        // 获取订单信息
        const [orders] = await pool.query(
            'SELECT * FROM orders WHERE order_id = ? AND user_id = ?',
            [orderId, userId]
        );
        
        if (orders.length === 0) {
            return res.status(404).json({ error: '订单不存在' });
        }
        
        const order = orders[0];
        
        // 只允许取消待付款的订单
        if (order.order_status !== 'pending') {
            return res.status(400).json({ error: '只能取消待付款的订单' });
        }
        
        // 使用事务确保操作的原子性
        const connection = await pool.getConnection();
        await connection.beginTransaction();
        
        try {
            // 更新订单状态
            await connection.query(
                'UPDATE orders SET order_status = "cancelled" WHERE order_id = ?',
                [orderId]
            );
            
            // 恢复库存
            const [orderItems] = await connection.query(
                'SELECT product_id, quantity FROM order_items WHERE order_id = ?',
                [orderId]
            );
            
            for (const item of orderItems) {
                await connection.query(
                    'UPDATE products SET stock = stock + ? WHERE product_id = ?',
                    [item.quantity, item.product_id]
                );
            }
            
            await connection.commit();
            
            res.json({
                success: true,
                message: '订单已取消'
            });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('取消订单失败:', error);
        res.status(500).json({ error: '取消订单失败' });
    }
});

// 获取用户信息
app.get('/api/user/profile', requireUserAuth, async (req, res) => {
    try {
        const userId = req.session.userId;
        
        const [users] = await pool.query(
            'SELECT user_id, username, email, phone, real_name, created_at, last_login, status FROM users WHERE user_id = ?',
            [userId]
        );
        
        if (users.length === 0) {
            return res.status(404).json({ error: '用户不存在' });
        }
        
        res.json({ user: users[0] });
    } catch (error) {
        console.error('获取用户信息失败:', error);
        res.status(500).json({ error: '获取用户信息失败' });
    }
});

// 更新用户信息
app.put('/api/user/profile', requireUserAuth, async (req, res) => {
    try {
        const userId = req.session.userId;
        const { phone, real_name } = req.body;
        
        await pool.query(
            'UPDATE users SET phone = ?, real_name = ? WHERE user_id = ?',
            [phone, real_name, userId]
        );
        
        res.json({
            success: true,
            message: '个人信息已更新'
        });
    } catch (error) {
        console.error('更新用户信息失败:', error);
        res.status(500).json({ error: '更新用户信息失败' });
    }
});

// 用户上传数据预览
app.post('/api/user/preview-data', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '请选择文件' });
        }

        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet, { header: 0 });

        // 删除临时文件
        fs.unlinkSync(req.file.path);

        res.json({ preview: data.slice(0, 5) });
    } catch (error) {
        console.error('预览数据失败:', error);
        res.status(500).json({ error: '预览数据失败' });
    }
});

// 用户上传数据
app.post('/api/user/upload-data', upload.single('file'), async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: '请先登录' });
        }

        if (!req.file) {
            return res.status(400).json({ error: '请选择文件' });
        }

        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet, { header: 0 });

        // 验证数据格式
        const isValidFormat = data.every(row => {
            return row['0'] && row['1'] && row['2'] && row['3'] && 
                   row['4'] && row['5'] && row['6'];
        });

        if (!isValidFormat) {
            return res.status(400).json({ error: '数据格式不正确' });
        }

        // 插入数据到用户上传表
        const values = data.map(row => [
            req.session.userId,
            row['0'], // 预单日期
            row['1'], // 统计日期
            row['2'], // 车型
            row['3'], // 外观
            row['4'], // 内饰
            row['5'], // 省份
            row['6']  // 订单ID
        ]);

        const sql = `INSERT INTO user_delivery_records 
                    (user_id, order_date, delivery_date, model, exterior_color, 
                     interior_color, province, order_id) 
                    VALUES ?`;

        await pool.query(sql, [values]);

        // 删除临时文件
        fs.unlinkSync(req.file.path);

        res.json({ message: '数据上传成功，等待审核' });
    } catch (error) {
        console.error('上传数据失败:', error);
        res.status(500).json({ error: '上传数据失败' });
    }
});

// 获取用户上传的数据（仅管理员可访问）
app.get('/api/admin/user-data', requireAuth, async (req, res) => {
    try {
        // 从数据库获取所有用户上传的数据
        const [records] = await pool.query(
            'SELECT * FROM user_delivery_records ORDER BY created_at DESC'
        );
        
        res.json(records);
    } catch (error) {
        console.error('获取用户数据失败:', error);
        res.status(500).json({ error: '获取用户数据失败' });
    }
});

// 审核用户上传的数据
app.post('/api/admin/review-user-data', requireAuth, async (req, res) => {
    try {
        const { recordId, status } = req.body;
        if (!recordId || !status || !['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ error: '参数不正确' });
        }
        
        // 更新用户数据状态
        await pool.query(
            'UPDATE user_delivery_records SET status = ? WHERE id = ?',
            [status, recordId]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('审核用户数据失败:', error);
        res.status(500).json({ error: '审核用户数据失败' });
    }
});

// 获取用户积分
app.get('/api/user/points', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: '请先登录' });
        }

        const [points] = await pool.query(
            'SELECT points FROM user_points WHERE user_id = ?',
            [req.session.userId]
        );

        res.json({ points: points.length > 0 ? points[0].points : 0 });
    } catch (error) {
        console.error('获取积分失败:', error);
        res.status(500).json({ error: '获取积分失败' });
    }
});

app.listen(3000, () => {
    console.log('服务器运行端口3000');
}); 