from flask import Flask, request, render_template, redirect, url_for, session, jsonify
import mysql.connector
import re
import os
import hashlib
import requests
import shutil
import pandas as pd
import threading
import time
from datetime import datetime, timedelta
from bs4 import BeautifulSoup
from urllib.parse import urljoin
import json
import math 

app = Flask(__name__)
app.secret_key = "brian_secret_key_123456"

# --- 資料庫連線設定 ---
db_config = {
    'user': 'root',
    'password': '',          
    'host': 'localhost',
    'database': 'food_nutrition', 
}

def get_db_connection():
    try:
        conn = mysql.connector.connect(**db_config)
        return conn
    except mysql.connector.Error as err:
        print(f"資料庫連線錯誤: {err}")
        return None

# --- 自動更新相關設定 ---
UPDATE_CONFIG = {
    "TARGET_URL": "https://consumer.fda.gov.tw/Food/TFND.aspx?nodeID=178",
    
    # ★ 修改 1：關鍵字改短，只要包含這些字就抓 (能自動適應 UPDATE3, 2025...)
    "LINK_KEYWORD": "食品營養成分資料庫", 
    
    # ★ 修改 2：本地檔名改為通用名稱，不要寫死年份
    "LOCAL_FILE_PATH": os.path.join("database", "food_nutrition_db.xlsx"),
    
    "TEMP_DIR": "temp_download",
    "CHECK_INTERVAL": 3600
}

# 全域變數：紀錄上次檢查時間與是否正在更新中
last_update_check_time = 0
is_updating = False

# --- 爬蟲與更新邏輯函式 (封裝版) ---
# --- 2. 新增讀取函式 ---
def load_allergen_rules():
    """從 JSON 檔案讀取過敏原設定"""
    # ★ 修改這裡：路徑指向 database 資料夾
    json_path = os.path.join("database", "allergens.json")
    
    try:
        # 如果檔案存在，就讀取
        if os.path.exists(json_path):
            with open(json_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        else:
            print(f"⚠️ 找不到 {json_path}，將使用預設空設定。")
            return {}
    except Exception as e:
        print(f"❌ 讀取過敏原設定失敗: {e}")
        return {}

# 宣告一個全域變數來存規則 (程式啟動時載入)
ALLERGEN_RULES = load_allergen_rules()

def calculate_md5(filepath):
    if not os.path.exists(filepath): return None
    hash_md5 = hashlib.md5()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()

def detect_allergens(food_info):
    detected = []
    if not isinstance(food_info, str): return "None"
    for type_name, keywords in ALLERGEN_RULES.items():
        for k in keywords:
            if k in food_info:
                detected.append(type_name)
                break
    return ",".join(detected) if detected else "None"

def run_update_task():
    """這是要在背景執行的主程式 (智慧篩選版)"""
    global is_updating, last_update_check_time
    
    # 1. 檢查冷卻時間
    current_time = time.time()
    if is_updating:
        print("⏳ 更新程式正在執行中，本次跳過。")
        return
    
    if (current_time - last_update_check_time) < UPDATE_CONFIG["CHECK_INTERVAL"]:
        print("⏳ 距離上次檢查時間過短，本次跳過。")
        return

    print("🚀 開始執行背景更新檢查...")
    is_updating = True
    last_update_check_time = current_time
    
    try:
        # 確保資料夾存在
        db_folder = os.path.dirname(UPDATE_CONFIG["LOCAL_FILE_PATH"])
        if not os.path.exists(db_folder): os.makedirs(db_folder)
        if not os.path.exists(UPDATE_CONFIG["TEMP_DIR"]): os.makedirs(UPDATE_CONFIG["TEMP_DIR"])
            
        temp_path = os.path.join(UPDATE_CONFIG["TEMP_DIR"], "download.xlsx")

        # A. 爬取連結
        print(f"🕷️ 爬取: {UPDATE_CONFIG['TARGET_URL']}")
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        resp = requests.get(UPDATE_CONFIG['TARGET_URL'], headers=headers)
        soup = BeautifulSoup(resp.text, 'html.parser')
        
        target_link = None
        
        # ★★★ 關鍵修改：更嚴格的篩選邏輯 ★★★
        for a in soup.find_all('a', href=True):
            title = a.get('title', '')
            text = a.get_text()
            href = a['href']
            
            # 將標題與連結內容轉成大寫，方便比對
            link_info = (title + text).upper()
            
            # 條件 1: 必須包含核心關鍵字 (例如 "食品營養成分資料庫")
            if UPDATE_CONFIG["LINK_KEYWORD"] in (title + text):
                
                # 條件 2: 必須明確包含 "XLS" 或 "EXCEL" (鎖定 Excel 檔)
                # 條件 3: 絕對不能包含 "PDF" 或 "說明" (排除說明書)
                if ("XLS" in link_info or "EXCEL" in link_info) and \
                   ("PDF" not in link_info) and \
                   ("說明" not in link_info):
                    
                    if "TFND.aspx" not in href: # 排除網頁本身
                        target_link = href
                        if target_link.startswith('//'): 
                            target_link = 'https:' + target_link
                        elif not target_link.startswith('http'): 
                            target_link = urljoin(UPDATE_CONFIG['TARGET_URL'], target_link)
                        
                        print(f"🎯 成功鎖定目標 Excel: {title or text}")
                        break
        
        if not target_link:
            print("❌ 找不到符合的 Excel 下載連結 (已過濾掉 PDF)。")
            return

        # B. 下載檔案
        print(f"⬇️ 下載: {target_link}")
        with requests.get(target_link, stream=True) as r:
            r.raise_for_status()
            with open(temp_path, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)

        # C. 檢查 MD5
        local_md5 = calculate_md5(UPDATE_CONFIG["LOCAL_FILE_PATH"])
        new_md5 = calculate_md5(temp_path)
        
        if local_md5 == new_md5:
            print("✅ 檔案相同，無需更新。")
        else:
            print("⚠️ 發現新版本 (MD5 不同)，開始處理資料庫更新...")
            update_database_from_excel(temp_path, UPDATE_CONFIG["LOCAL_FILE_PATH"])
            
            # 覆蓋舊檔
            shutil.move(temp_path, UPDATE_CONFIG["LOCAL_FILE_PATH"])
            print(f"✅ 更新完成，已儲存至: {UPDATE_CONFIG['LOCAL_FILE_PATH']}")

    except Exception as e:
        print(f"❌ 更新過程發生錯誤: {e}")
    finally:
        # 清理暫存
        if os.path.exists(UPDATE_CONFIG["TEMP_DIR"]):
            shutil.rmtree(UPDATE_CONFIG["TEMP_DIR"])
        is_updating = False
        print("🏁 背景更新工作結束。")

def update_database_from_excel(new_path, old_path):
    # 讀取 Excel
    df_new = pd.read_excel(new_path, header=1) # 假設標題在第2行
    
    # 比對邏輯 (簡單版：只看名稱不存在的)
    if os.path.exists(old_path):
        df_old = pd.read_excel(old_path, header=1)
        existing_names = set(df_old['樣品名稱'].astype(str))
        new_rows = df_new[~df_new['樣品名稱'].astype(str).isin(existing_names)].copy()
    else:
        new_rows = df_new.copy()

    if new_rows.empty:
        print("👌 沒有新的食物項目。")
        return

    print(f"📦 準備寫入 {len(new_rows)} 筆新資料...")
    
    # 欄位對應
    target_columns = {
        '食品分類': 'category', '樣品名稱': 'name', '內容物描述': 'description',
        '修正熱量(kcal)': 'calorie', '粗蛋白(g)': 'protein', '粗脂肪(g)': 'fat',
        '總碳水化合物(g)': 'carb', '膳食纖維(g)': 'dietary_fiber'
    }
    
    # 資料清洗
    available_cols = list(set(target_columns.keys()) & set(new_rows.columns))
    df_upload = new_rows[available_cols].copy()
    df_upload.rename(columns=target_columns, inplace=True)
    
    # 補數值
    for col in ['calorie', 'protein', 'fat', 'carb', 'dietary_fiber']:
        if col in df_upload.columns:
            df_upload[col] = pd.to_numeric(df_upload[col], errors='coerce').fillna(0)
        else:
            df_upload[col] = 0

    # 補字串與其他欄位
    df_upload['category'] = df_upload.get('category', '').fillna('')
    df_upload['description'] = df_upload.get('description', '').fillna('')
    df_upload['unit'] = '100g'
    df_upload['approval_status'] = 1 # 官方資料直接通過
    df_upload['uploader'] = '衛福部更新' # 標記來源
    
    # 偵測過敏原
    df_upload['allergens'] = df_upload.apply(
        lambda row: detect_allergens(str(row['name']) + " " + str(row['description'])), axis=1
    )

    # 寫入 MySQL
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        sql = """
            INSERT INTO food (
                name, category, description, unit, 
                calorie, protein, fat, carb, dietary_fiber, 
                allergens, approval_status, uploader, upload_date
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
        """
        
        # 轉換成 Tuple 列表
        data_to_insert = []
        for _, row in df_upload.iterrows():
            data_to_insert.append((
                row['name'], row['category'], row['description'], row['unit'],
                row['calorie'], row['protein'], row['fat'], row['carb'], row['dietary_fiber'],
                row['allergens'], row['approval_status'], row['uploader']
            ))
            
        cursor.executemany(sql, data_to_insert)
        conn.commit()
        print(f"🎉 資料庫寫入成功，新增 {cursor.rowcount} 筆。")
        
    except Exception as e:
        print(f"❌ DB 寫入錯誤: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()


# --- 頁面路由 ---

@app.route('/')
@app.route('/index.html')
def index():
    if 'user' in session:
        return redirect(url_for('home'))
    return render_template('index.html')

@app.route('/home.html')
def home():
    if 'user' not in session: return redirect(url_for('index'))
    is_admin = session.get('is_admin', False)
    return render_template('home.html', name=session.get('nickname'), is_admin=is_admin)

@app.route('/diary.html')
def diary():
    if 'user' not in session: return redirect(url_for('index'))
    is_admin = session.get('is_admin', False)
    return render_template('diary.html', name=session.get('nickname'), is_admin=is_admin)

@app.route('/profile.html')
def profile():
    if 'user' not in session: return redirect(url_for('index'))
    is_admin = session.get('is_admin', False)
    return render_template('profile.html', name=session.get('nickname'), is_admin=is_admin)

@app.route('/upload.html')
def upload():
    if 'user' not in session: return redirect(url_for('index'))
    is_admin = session.get('is_admin', False)
    return render_template('upload.html', name=session.get('nickname'), is_admin=is_admin)

@app.route('/review.html')
def review():
    if 'user' not in session: return redirect(url_for('index'))
    if not session.get('is_admin'): return "權限不足", 403
    return render_template('review.html', name=session.get('nickname'), is_admin=True)

# --- 功能路由 (API) ---

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    conn = get_db_connection()
    if not conn:
        return jsonify({"success": False, "message": "資料庫連線失敗"})

    try:
        cursor = conn.cursor(dictionary=True)
        sql = "SELECT * FROM user WHERE account = %s AND password = %s"
        cursor.execute(sql, (username, password))
        user = cursor.fetchone()
        
        cursor.close()
        conn.close()

        if user:
            session['user'] = user['account']
            session['nickname'] = user['nickname']
            session['is_admin'] = bool(user['is_admin'])
            session['user_id'] = user['user_id']
            
            # ★★★ 關鍵修改：登入成功後，啟動背景執行緒去檢查更新 ★★★
            # 使用 Thread 讓它在背景跑，才不會卡住使用者的登入畫面
            # daemon=True 表示主程式結束時，這個執行緒也會跟著結束
            update_thread = threading.Thread(target=run_update_task, daemon=True)
            update_thread.start()
            
            return jsonify({
                "success": True, 
                "message": "登入成功",
                "user": user['nickname'],
                "is_admin": bool(user['is_admin'])
            })
        else:
            return jsonify({"success": False, "message": "帳號或密碼錯誤！"})
            
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('index'))

# --- 食物相關 API ---

@app.route('/api/foods')
def get_foods_api():
    conn = get_db_connection()
    if not conn: return jsonify([])

    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 20, type=int)
    search = request.args.get('search', '')
    category = request.args.get('category', '')
    
    offset = (page - 1) * limit

    cursor = conn.cursor(dictionary=True)
    
    query = """
        SELECT 
            food_id as id, name, category, unit, calorie as calories, 
            protein, fat, carb as carbs, dietary_fiber as fiber, 
            allergens, 'approved' as status
        FROM food 
        WHERE approval_status = 1
    """
    params = []

    if search:
        query += " AND name LIKE %s"
        params.append(f'%{search}%')
    
    if category:
        query += " AND category LIKE %s"
        params.append(f'%{category}%')

    query += " ORDER BY food_id DESC LIMIT %s OFFSET %s"
    params.extend([limit, offset])

    cursor.execute(query, tuple(params))
    foods = cursor.fetchall()
    
    cursor.close()
    conn.close()

    for food in foods:
        food['image'] = '/static/assets/default-food.jpg'
        if food['allergens'] and food['allergens'] != 'None':
            food['allergens'] = food['allergens'].split(',')
        else:
            food['allergens'] = []

    return jsonify(foods)

# 新增 API：取得所有分類
@app.route('/api/categories')
def get_categories_api():
    conn = get_db_connection()
    if not conn: return jsonify([])
    
    cursor = conn.cursor()
    try:
        sql = "SELECT DISTINCT category FROM food WHERE approval_status = 1 AND category != '' ORDER BY category"
        cursor.execute(sql)
        categories = [row[0] for row in cursor.fetchall()]
        cursor.close()
        conn.close()
        return jsonify(categories)
    except Exception as e:
        print(f"取得分類失敗: {e}")
        return jsonify([])

@app.route('/api/foods/add', methods=['POST'])
def add_food_api():
    if 'user' not in session:
        return jsonify({"success": False, "message": "請先登入！"}), 401

    data = request.get_json()
    if not data.get('name') or not data.get('calories'):
        return jsonify({"success": False, "message": "名稱與熱量為必填！"}), 400

    conn = get_db_connection()
    if not conn: return jsonify({"success": False, "message": "連線失敗"})

    try:
        cursor = conn.cursor()
        
        allergens_str = "None"
        if data.get('allergens') and len(data['allergens']) > 0:
            allergens_str = ",".join(data['allergens'])

        uploader_name = session.get('nickname', '未知用戶')
        current_user_id = session.get('user_id')
        is_admin = session.get('is_admin', False)

        status_int = 1 if is_admin else 0
        log_status = 'approved' if is_admin else 'pending'

        sql = """
            INSERT INTO food (
                name, category, unit, 
                calorie, protein, fat, carb, dietary_fiber, 
                allergens, approval_status, description, 
                uploader, user_id
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        
        values = (
            data['name'],
            data['category'],
            data.get('unit', '100g'),
            data['calories'],
            data['protein'],
            data['fat'],
            data['carbs'],
            data['fiber'],
            allergens_str,
            status_int,
            data.get('description', ''),
            uploader_name,
            current_user_id
        )
        
        cursor.execute(sql, values)
        new_food_id = cursor.lastrowid
        
        if current_user_id:
            if is_admin:
                audit_sql = """
                    INSERT INTO auditlog (user_id, food_id, status, submit_time, review_time, admin_id)
                    VALUES (%s, %s, %s, NOW(), NOW(), %s)
                """
                cursor.execute(audit_sql, (current_user_id, new_food_id, log_status, current_user_id))
            else:
                audit_sql = """
                    INSERT INTO auditlog (user_id, food_id, status, submit_time)
                    VALUES (%s, %s, %s, NOW())
                """
                cursor.execute(audit_sql, (current_user_id, new_food_id, log_status))
            
        conn.commit()
        cursor.close()
        conn.close()

        msg = "上傳成功！" if is_admin else "上傳成功，等待審核中！"
        return jsonify({"success": True, "message": msg})

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"success": False, "message": "上傳失敗"})

@app.route('/api/foods/my', methods=['GET'])
def get_my_uploads():
    if 'user' not in session: return jsonify([]), 401
    my_user_id = session.get('user_id')
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    sql = """
            SELECT food_id as id, name, category, calorie as calories, protein, fat, carb as carbs, dietary_fiber as fiber, approval_status, upload_date
            FROM food WHERE user_id = %s ORDER BY upload_date DESC
        """
    cursor.execute(sql, (my_user_id,))
    my_foods = cursor.fetchall()
    cursor.close()
    conn.close()
    for food in my_foods:
        if food['upload_date']: food['date'] = food['upload_date'].strftime('%Y/%m/%d')
        else: food['date'] = '未知日期'
    return jsonify(my_foods)

@app.route('/api/foods/cancel', methods=['POST'])
def cancel_upload_api():
    if 'user' not in session: return jsonify({"success": False, "message": "請先登入"}), 401
    user_id = session.get('user_id')
    data = request.get_json()
    food_id = data.get('food_id')
    if not food_id: return jsonify({"success": False, "message": "缺少食物 ID"}), 400
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        check_sql = "SELECT approval_status FROM food WHERE food_id = %s AND user_id = %s"
        cursor.execute(check_sql, (food_id, user_id))
        food = cursor.fetchone()
        if not food: return jsonify({"success": False, "message": "找不到該紀錄或無權限"}), 404
        if food[0] != 0: return jsonify({"success": False, "message": "只能取消待審核的紀錄"}), 400
        cursor.execute("DELETE FROM auditlog WHERE food_id = %s", (food_id,))
        cursor.execute("DELETE FROM record WHERE food_id = %s", (food_id,))
        cursor.execute("DELETE FROM food WHERE food_id = %s", (food_id,))
        conn.commit()
        return jsonify({"success": True, "message": "已取消上傳"})
    except Exception as e:
        conn.rollback()
        return jsonify({"success": False, "message": "系統錯誤"}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/api/foods/pending')
def get_pending_foods():
    if 'user' not in session or not session.get('is_admin'): return jsonify({"success": False, "message": "權限不足"}), 403
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    sql = """
            SELECT food_id as id, name, category, unit, calorie as calories, protein, fat, carb as carbs, dietary_fiber as fiber, description, allergens, uploader as uploadUser, DATE_FORMAT(upload_date, '%Y-%m-%d') as uploadDate
            FROM food WHERE approval_status = 0
          """
    cursor.execute(sql)
    foods = cursor.fetchall()
    cursor.close()
    conn.close()
    for food in foods:
        food['image'] = '/static/assets/default-food.png'
        if food['allergens'] and food['allergens'] != 'None': food['allergens'] = food['allergens'].split(',')
        else: food['allergens'] = []
    return jsonify(foods)

@app.route('/api/foods/review', methods=['POST'])
def review_food():
    if 'user' not in session or not session.get('is_admin'): return jsonify({"success": False, "message": "權限不足"}), 403
    data = request.get_json()
    food_id = data.get('food_id')
    action = data.get('action') 
    new_status_int = 1 if action == 'approve' else 2
    log_status_str = 'approved' if action == 'approve' else 'rejected'
    admin_id = session.get('user_id')
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE food SET approval_status = %s WHERE food_id = %s", (new_status_int, food_id))
        cursor.execute("UPDATE auditlog SET admin_id = %s, status = %s, review_time = NOW() WHERE food_id = %s AND status = 'pending'", (admin_id, log_status_str, food_id))
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "message": f"已{action}"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})

@app.route('/api/foods/delete_item', methods=['POST'])
def delete_food_item_api():
    if 'user' not in session or not session.get('is_admin'): return jsonify({"success": False, "message": "權限不足"}), 403
    data = request.get_json()
    food_id = data.get('food_id')
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM record WHERE food_id = %s", (food_id,))
        cursor.execute("DELETE FROM auditlog WHERE food_id = %s", (food_id,))
        cursor.execute("DELETE FROM food WHERE food_id = %s", (food_id,))
        conn.commit()
        if cursor.rowcount > 0: return jsonify({"success": True, "message": "已刪除"})
        else: return jsonify({"success": False, "message": "找不到該食物"})
    except Exception as e:
        conn.rollback()
        return jsonify({"success": False, "message": "刪除失敗"}), 500
    finally:
        cursor.close()
        conn.close()

# --- 個人與紀錄相關 API ---

@app.route('/api/user/profile', methods=['GET'])
def get_user_profile():
    if 'user' not in session: return jsonify({"success": False, "message": "請先登入"}), 401
    user_id = session.get('user_id')
    conn = get_db_connection()
    if not conn: return jsonify({"success": False, "message": "連線失敗"}), 500
    cursor = conn.cursor(dictionary=True)
    try:
        sql_user = """
            SELECT account as username, nickname, email, phone, age, gender, height, weight, allergies as allergens, DATE_FORMAT(created_at, '%Y-%m-%d') as join_date 
            FROM user WHERE user_id = %s
        """
        cursor.execute(sql_user, (user_id,))
        user_data = cursor.fetchone()
        if user_data:
            sql_vip = "SELECT end_date FROM vip WHERE user_id = %s AND end_date >= CURDATE() ORDER BY end_date DESC LIMIT 1"
            cursor.execute(sql_vip, (user_id,))
            vip_record = cursor.fetchone()
            if vip_record:
                user_data['is_vip'] = True
                user_data['vip_end_date'] = vip_record['end_date'].strftime('%Y-%m-%d')
            else:
                user_data['is_vip'] = False

            sql_stats = "SELECT status, COUNT(*) as count FROM auditlog WHERE user_id = %s GROUP BY status"
            cursor.execute(sql_stats, (user_id,))
            counts = cursor.fetchall()
            stats_map = {'total': 0, 'approved': 0, 'pending': 0, 'rejected': 0}
            for row in counts:
                status = row['status']
                stats_map['total'] += row['count']
                if status in stats_map: stats_map[status] = row['count']
            user_data['stats'] = stats_map
            if user_data['allergens']: user_data['allergens'] = user_data['allergens'].split(',')
            else: user_data['allergens'] = []
            return jsonify({"success": True, "data": user_data})
        else:
            return jsonify({"success": False, "message": "找不到使用者"}), 404
    except Exception as e:
        return jsonify({"success": False, "message": "查詢錯誤"}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/api/user/profile', methods=['POST'])
def update_user_profile():
    if 'user' not in session: return jsonify({"success": False, "message": "請先登入"}), 401
    user_id = session.get('user_id')
    data = request.get_json()
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        if 'allergens' in data:
            allergens_str = ",".join(data['allergens'])
            sql = "UPDATE user SET allergies = %s WHERE user_id = %s"
            cursor.execute(sql, (allergens_str, user_id))
        elif 'email' in data:
            height_val = data.get('height') if data.get('height') != '' else None
            weight_val = data.get('weight') if data.get('weight') != '' else None
            sql = "UPDATE user SET email=%s, phone=%s, age=%s, gender=%s, height=%s, weight=%s WHERE user_id=%s"
            cursor.execute(sql, (data.get('email'), data.get('phone'), data.get('age'), data.get('gender'), height_val, weight_val, user_id))
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "message": "更新成功"})
    except Exception as e:
        return jsonify({"success": False, "message": f"更新失敗: {str(e)}"})

@app.route('/api/records/add', methods=['POST'])
def add_record_api():
    if 'user' not in session: return jsonify({"success": False, "message": "請先登入"}), 401
    user_id = session.get('user_id')
    data = request.get_json()
    record_time_str = data['date'].replace('T', ' ')
    if not data.get('food_id') or not record_time_str: return jsonify({"success": False, "message": "資料不完整"}), 400
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # 修正：正確讀取 meal_type，而不是固定為 '快速紀錄'
        meal_type = data.get('meal_type', '快速紀錄')
        sql = "INSERT INTO `record` (`user_id`, `food_id`, `record_time`, `meal_type`, `portion`) VALUES (%s, %s, %s, %s, %s)"
        values = (user_id, data['food_id'], record_time_str, meal_type, data.get('portion', 100))
        cursor.execute(sql, values)
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "message": "已加入紀錄"})
    except Exception as e:
        print(f"新增紀錄錯誤: {e}")
        return jsonify({"success": False, "message": "紀錄失敗"})

@app.route('/api/records/daily', methods=['GET'])
def get_daily_records():
    if 'user' not in session: return jsonify({"success": False, "message": "請先登入"}), 401
    user_id = session.get('user_id')
    date_str = request.args.get('date')
    if not date_str: return jsonify({"success": False, "message": "請提供日期"}), 400
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        sql = """
            SELECT r.record_id, r.portion, r.meal_type, r.record_time,
                f.name, f.category, f.unit, f.calorie, f.protein, f.fat, f.carb, f.dietary_fiber, f.allergens, f.food_id
            FROM record r JOIN food f ON r.food_id = f.food_id
            WHERE r.user_id = %s AND DATE(r.record_time) = %s ORDER BY r.record_time ASC
        """
        cursor.execute(sql, (user_id, date_str))
        records = cursor.fetchall()
        cursor.close()
        conn.close()
        summary = {'total_calories': 0, 'total_protein': 0, 'total_fat': 0, 'total_carbs': 0, 'total_fiber': 0}
        processed_records = []
        for record in records:
            unit_str = str(record['unit'])
            match = re.search(r"(\d+(\.\d+)?)", unit_str)
            base_weight = float(match.group(1)) if match else 100.0
            p = record['portion'] / base_weight
            record['total_calories'] = round(record['calorie'] * p, 2)
            record['total_protein'] = round(record['protein'] * p, 2)
            record['total_fat'] = round(record['fat'] * p, 2)
            record['total_carbs'] = round(record['carb'] * p, 2)
            record['total_fiber'] = round(record['dietary_fiber'] * p, 2)
            summary['total_calories'] += record['total_calories']
            summary['total_protein'] += record['total_protein']
            summary['total_fat'] += record['total_fat']
            summary['total_carbs'] += record['total_carbs']
            summary['total_fiber'] += record['total_fiber']
            processed_records.append(record)
        return jsonify({"success": True, "records": processed_records, "summary": summary})
    except Exception as e:
        return jsonify({"success": False, "message": "查詢失敗"}), 500

@app.route('/api/records/delete', methods=['POST'])
def delete_record_api():
    if 'user' not in session: return jsonify({"success": False, "message": "請先登入"}), 401
    user_id = session.get('user_id')
    data = request.get_json()
    record_id = data.get('record_id')
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM record WHERE record_id = %s AND user_id = %s", (record_id, user_id))
        conn.commit()
        if cursor.rowcount > 0: return jsonify({"success": True, "message": "刪除成功"})
        else: return jsonify({"success": False, "message": "刪除失敗"})
    except Exception as e:
        return jsonify({"success": False, "message": "系統錯誤"}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/api/user/vip/upgrade', methods=['POST'])
def upgrade_vip():
    if 'user' not in session: return jsonify({"success": False, "message": "請先登入"}), 401
    user_id = session.get('user_id')
    start_str = datetime.now().strftime('%Y-%m-%d')
    end_str = (datetime.now() + timedelta(days=30)).strftime('%Y-%m-%d')
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO vip (user_id, start_date, end_date) VALUES (%s, %s, %s)", (user_id, start_str, end_str))
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"success": True, "message": "恭喜成為 VIP！"})
    except Exception as e:
        return jsonify({"success": False, "message": "升級失敗"}), 500


# --- 推薦系統核心演算法 ---

# 1. 計算使用者每日營養需求 (Mifflin-St Jeor 公式)
def calculate_daily_needs(user_info):
    # 預設值 (防止資料缺漏)
    weight = user_info.get('weight') or 60
    height = user_info.get('height') or 170
    age = user_info.get('age') or 25
    gender = user_info.get('gender') or '男'
    
    # BMR 計算
    if gender == '男':
        bmr = (10 * weight) + (6.25 * height) - (5 * age) + 5
    else:
        bmr = (10 * weight) + (6.25 * height) - (5 * age) - 161
        
    # TDEE 計算 (預設活動量為輕度活動 1.375)
    tdee = bmr * 1.375
    
    # 營養素分配 (簡單版：碳水50%, 脂肪30%, 蛋白質20%)
    return {
        'calories': int(tdee),
        'protein': int((tdee * 0.2) / 4),  # 1g 蛋白質 = 4 kcal
        'fat': int((tdee * 0.3) / 9),      # 1g 脂肪 = 9 kcal
        'carb': int((tdee * 0.5) / 4),     # 1g 碳水 = 4 kcal
        'fiber': int(tdee / 1000 * 14)     # 每1000卡建議14g纖維
    }

# 2. 取得使用者飲食偏好向量 (分析過去 30 天紀錄)
def get_user_preference_vector(user_id, conn):
    cursor = conn.cursor(dictionary=True)
    # 抓取最近 30 天的飲食紀錄
    sql = """
        SELECT f.protein, f.fat, f.carb, f.dietary_fiber, f.category
        FROM record r
        JOIN food f ON r.food_id = f.food_id
        WHERE r.user_id = %s AND r.record_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    """
    cursor.execute(sql, (user_id,))
    records = cursor.fetchall()
    cursor.close()
    
    if not records:
        return None # 沒有歷史紀錄

    # 計算平均營養比例 (這就是使用者喜歡的口味特徵)
    total_items = len(records) #此使用者30天內紀錄了幾筆資料
    avg_protein = sum(r['protein'] for r in records) / total_items #30天內蛋白質吃的平均
    avg_fat = sum(r['fat'] for r in records) / total_items #30天內脂肪吃的平均
    avg_carb = sum(r['carb'] for r in records) / total_items #30天內碳水吃的平均
    avg_fiber = sum(r['dietary_fiber'] for r in records) / total_items #30天內膳食纖維吃的平均
    
    # 統計喜歡的分類
    categories = {}
    for r in records:
        categories[r['category']] = categories.get(r['category'], 0) + 1
    
    # 回傳：[蛋白質, 脂肪, 碳水, 膳食纖維] 的特徵向量, 以及喜歡的分類
    return {
        'vector': [avg_protein, avg_fat, avg_carb, avg_fiber],
        'fav_categories': categories # 例如 {'肉類': 5, '蔬菜': 2}
    }

# 3. 計算相似度 (餘弦相似度概念的簡化版 - 歐幾里得距離)
# 距離越小代表越相似
def calculate_similarity(food_vector, user_vector):
    # food_vector = [protein, fat, carb]
    dist = math.sqrt(
        (food_vector[0] - user_vector[0])**2 + 
        (food_vector[1] - user_vector[1])**2 + 
        (food_vector[2] - user_vector[2])**2 +
        (food_vector[3] - user_vector[3])**2
    )
    return dist




# --- 新增 API: 食物推薦系統 ---
@app.route('/api/recommendations', methods=['GET'])
def get_recommendations():
    if 'user' not in session:
        return jsonify({"success": False, "message": "請先登入"}), 401
    
    user_id = session.get('user_id')
    date_str = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
    
    # ★ 1. 接收餐數參數 (預設為 1)
    try:
        meal_count = int(request.args.get('meal_count', 1))
        if meal_count < 1: meal_count = 1
    except:
        meal_count = 1

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # --- 0. 準備資料 ---
        # 獲取使用者資料
        cursor.execute("SELECT allergies, age, gender, weight, height FROM user WHERE user_id = %s", (user_id,))
        user_info = cursor.fetchone()
        
        user_allergens = []
        if user_info and user_info['allergies']:
            user_allergens = user_info['allergies'].split(',') # 取得過敏原列表
            
        # 計算精確的營養需求
        recommended = calculate_daily_needs(user_info)
        
        # 計算當日已攝取
        sql_today = """
            SELECT r.portion, f.unit, f.calorie, f.protein, f.fat, f.carb, f.dietary_fiber
            FROM record r JOIN food f ON r.food_id = f.food_id
            WHERE r.user_id = %s AND DATE(r.record_time) = %s
        """
        cursor.execute(sql_today, (user_id, date_str))
        today_records = cursor.fetchall()
        
        consumed = {'calories': 0, 'protein': 0, 'fat': 0, 'carb': 0, 'fiber': 0}
        for record in today_records:
            # 解析份量 (處理 "100g", "1顆" 等單位)
            unit_str = str(record['unit'])
            match = re.search(r"(\d+(\.\d+)?)", unit_str)
            base_weight = float(match.group(1)) if match else 100.0
            p = record['portion'] / base_weight
            
            consumed['calories'] += record['calorie'] * p
            consumed['protein'] += record['protein'] * p
            consumed['fat'] += record['fat'] * p
            consumed['carb'] += record['carb'] * p
            consumed['fiber'] += record['dietary_fiber'] * p
            
        # 計算缺口 (Deficit)
        deficit = {
            'calories': max(0, recommended['calories'] - consumed['calories']),
            'protein': max(0, recommended['protein'] - consumed['protein']),
            'fat': max(0, recommended['fat'] - consumed['fat']),
            'carb': max(0, recommended['carb'] - consumed['carb']),
            'fiber': max(0, recommended['fiber'] - consumed['fiber'])
        }

        # --- 第一階段：候選名單篩選 (Candidate Generation) ---
        
        # 1. 過敏原過濾 (絕對排除)
        allergen_conditions = []
        for allergen in user_allergens:
            allergen_conditions.append(f"allergens NOT LIKE '%{allergen}%'")
        allergen_sql = " AND ".join(allergen_conditions)
        if allergen_sql:
            allergen_sql = " AND " + allergen_sql
            
        # 2. 設定熱量篩選門檻 (Budgeting)
        # 邏輯：
        # - 如果缺口很大 (例如還差 1500 卡)，我們不希望單一食物就塞滿，設定單項上限為 800~1000。
        # - 如果缺口很小 (例如剩 100 卡)，我們必須嚴格過濾，只推薦 < 100 卡的食物。
        #remaining_cals為還需要多少熱量
        remaining_cals = max(0, deficit['calories'])

        # 計算「單餐預算」
        per_meal_budget = remaining_cals / meal_count
        print(per_meal_budget)
        
        if per_meal_budget > 800:
            cal_limit = 1000 # 即使缺口很大，單一食物通常不超過 1000 卡
        elif per_meal_budget < 100:
            cal_limit = 100  # 剩餘不多，嚴格限制
        else:
            cal_limit = per_meal_budget # 剩多少，就只能吃多少以內的
            
        # 防呆：如果已經爆卡了 (per_meal_budget = 0)，還是要推薦一些低卡食物 (例如 < 50卡)
        if cal_limit == 0:
            cal_limit = 50
        print(cal_limit)
        # 3. 從資料庫撈取候選名單
        # 這裡不再用 if-elif 鎖死特定營養素，而是「只要熱量符合」都撈進來
        # 我們把 LIMIT 放大到 100，讓第二階段有更多排序選擇
        sql_candidates = f"""
            SELECT food_id as id, name, category, calorie as calories, 
                   protein, fat, carb as carbs, dietary_fiber as fiber, unit, allergens
            FROM food 
            WHERE approval_status = 1 
              AND calorie <= {cal_limit} 
              {allergen_sql}
            ORDER BY RAND()
            LIMIT 100
        """
        cursor.execute(sql_candidates)
        raw_candidates = cursor.fetchall()

        # ★★★ 新增：Python 二次嚴格過濾 (Double Check) ★★★
        # 這可以防止 SQL 浮點數比對誤差，或是資料庫欄位型態導致的漏網之魚
        candidates = []
        for food in raw_candidates:
            # 確保食物熱量「嚴格小於等於」預算
            # 這裡加一點點微小的浮點數容許值 (0.1)，避免 178.0 被 178.0001 排擠
            if float(food['calories']) <= (cal_limit + 0.1):
                candidates.append(food)
        
        # --- 第二階段：基於內容排序 (Personalized Re-ranking) ---
        
        # 取得使用者的歷史偏好 (特徵向量)
        user_pref = get_user_preference_vector(user_id, conn)
        
        final_recommendations = []
        
        if user_pref and candidates:
            # 如果有歷史紀錄，就進行相似度排序
            user_vec = user_pref['vector'] #使用者喜歡的營養素
            fav_cats = user_pref['fav_categories'] #使用者喜歡的食物類型
            
            for food in candidates: #計算每個食物與使用者飲食習慣的的相似度(使用者喜歡吃的食物)
                # 1. 計算營養成分相似度 (距離越小越好)
                food_vec = [food['protein'], food['fat'], food['carbs'], food['fiber']] # 這裡假設carbs對應DB的carb
                dist = calculate_similarity(food_vec, user_vec)
                
                # 2. 計算分類加權 (如果這分類使用者常吃，距離就減分=排名往前)
                cat_score = fav_cats.get(food['category'], 0) #取得使用者在飲食紀錄中不同食物類型的次數
                # 簡單演算法：每吃過一次該分類，距離權重 -1 (讓它排更前面)
                adjusted_dist = dist - (cat_score * 0.5) #cat_score越高代表此種類吃越多次越需要推給使用者，代表dist越小(跟使用者常吃的越相似)。
                
                food['score'] = adjusted_dist
                final_recommendations.append(food)
                
            # 依照分數排序 (由小到大，距離越近越好)
            final_recommendations.sort(key=lambda x: x['score'])
            
            # 取前 6 名(如果需要限制推薦數量可由這邊更改)
            # final_recommendations = final_recommendations[:6]
        else:
            # 如果是新用戶(沒歷史紀錄)，一樣取前 6 名(如果需要限制推薦數量可由這邊更改)
            # final_recommendations = candidates[:6]
            final_recommendations = candidates
            
        # 補上圖片連結
        for food in final_recommendations:
            food['image'] = '/static/assets/default-food.jpg'

        cursor.close()
        conn.close()
        
        return jsonify({
            "success": True,
            "recommended": recommended,
            "consumed": consumed,
            "deficit": deficit,
            "foods": final_recommendations
        })
        
    except Exception as e:
        print(f"推薦系統錯誤: {e}")
        if 'cursor' in locals(): cursor.close()
        if 'conn' in locals(): conn.close()
        return jsonify({"success": False, "message": str(e)}), 500

# --- 新增 API: 獲取過敏原設定 (給前端用) ---
@app.route('/api/config/allergens', methods=['GET'])
def get_allergen_config():
    # 重新讀取一次確保是與檔案同步的 (或是直接回傳 global 變數也可)
    return jsonify(ALLERGEN_RULES)

# --- ★ 新增：管理員刪除食物 API ---
@app.route('/api/foods/delete', methods=['POST'])
def delete_food_api():
    # 1. 權限檢查
    if 'user' not in session:
        return jsonify({'success': False, 'message': '請先登入'}), 401
    
    if not session.get('is_admin'):
        return jsonify({'success': False, 'message': '權限不足'}), 403

    data = request.get_json()
    food_id = data.get('id')

    if not food_id:
        return jsonify({'success': False, 'message': '缺少食物 ID'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # 2. 刪除相關關聯 (為了避免 Foreign Key 報錯，通常建議先刪紀錄)
        # 視您的資料庫設定而定，如果有設 ON DELETE CASCADE 則這幾行可省略，
        # 但為了安全起見，我們先手動刪除相關紀錄
        cursor.execute("DELETE FROM record WHERE food_id = %s", (food_id,))
        cursor.execute("DELETE FROM auditlog WHERE food_id = %s", (food_id,))
        
        # 3. 刪除本體
        cursor.execute("DELETE FROM food WHERE food_id = %s", (food_id,))
        
        conn.commit()
        return jsonify({'success': True, 'message': '刪除成功'})

    except Exception as e:
        conn.rollback()
        print(f"刪除失敗: {e}")
        return jsonify({'success': False, 'message': '刪除失敗，該食物可能已被引用'}), 500
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    app.run(debug=True)