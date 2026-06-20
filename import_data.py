import os
import pandas as pd
import mysql.connector
from datetime import datetime

# 数据库连接配置
db_config = {
    'host': 'localhost',
    'user': 'root',
    'password': os.environ.get('DB_PASSWORD', ''),
    'database': 'su7_tracker'
}

def convert_date(date_str):
    """转换日期格式 MM/DD 到 2024-MM-DD"""
    if not isinstance(date_str, str):
        return None
    month, day = date_str.split('/')
    return f'2024-{month.zfill(2)}-{day.zfill(2)}'

# 读取Excel文件（如果数据是Excel格式）
# 如果是CSV文件，使用 pd.read_csv()
df = pd.read_excel('su7_data.xlsx')  # 替换为您的文件名

# 连接数据库
conn = mysql.connector.connect(**db_config)
cursor = conn.cursor()

# 准备插入语句
insert_query = """
INSERT INTO delivery_records (
    order_date, 
    expected_delivery_date, 
    province, 
    exterior_color, 
    interior_color, 
    user_id, 
    waiting_days,
    status
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
"""

# 遍历数据并插入
for _, row in df.iterrows():
    try:
        order_date = convert_date(row['预单日期'])
        delivery_date = convert_date(row['统计日期'])
        
        # 计算等待天数
        if order_date and delivery_date:
            order_date_obj = datetime.strptime(order_date, '%Y-%m-%d')
            delivery_date_obj = datetime.strptime(delivery_date, '%Y-%m-%d')
            waiting_days = (delivery_date_obj - order_date_obj).days
        else:
            waiting_days = None

        data = (
            order_date,
            delivery_date,
            row['IP或交付地区'],
            row['外观'],
            row['内饰'],
            row['ID'],
            waiting_days,
            'pending'  # 默认状态
        )
        
        cursor.execute(insert_query, data)
        
    except Exception as e:
        print(f"Error inserting row: {row}")
        print(f"Error message: {str(e)}")
        continue

# 提交事务并关闭连接
conn.commit()
cursor.close()
conn.close()

print("数据导入完成！") 