# 飲食營養管理系統 —— 您的好棒棒營養師

> **國立高雄科技大學 資訊工程系 網路資料庫程式設計專題**
> 一個結合 **自動化爬蟲** 與 **個人化推薦演算法** 的智慧飲食管理平台，解決市面 App 缺乏台灣在地食物數據與資料更新緩慢的痛點。

---

## 專案簡介

現代人外食比例高，常面臨熱量超標與營養不均的問題。然而，現有解決方案多使用國外資料庫，難以對應台灣在地小吃（如滷肉飯、鹽酥雞）。本系統整合 **衛福部食品營養成分資料庫 (TFND)**，透過後端自動化維護機制與混合式推薦演算法，為使用者提供精準、即時且安全的飲食建議。

---

## 核心功能

### 1. 自動化資料維護

* **多執行緒爬蟲**：後端開啟 Background Thread 定期爬取衛福部官網。
* **MD5 差異更新**：下載 Excel 檔後計算雜湊值 (Hash)，僅在檔案變動時進行 ETL (Extract-Transform-Load) 更新，大幅降低伺服器負載。

### 2. 混合式推薦引擎

採用 **漏斗式篩選** 機制：

1. **硬體過濾**：
* **安全性**：SQL 層級直接排除使用者過敏原 (e.g., `NOT LIKE '%蝦%'`)。
* **預算控制**：嚴格篩選熱量低於「單餐剩餘預算」的食物。


2. **軟體排序**：
* **偏好分析**：利用 **歐幾里得距離 (Euclidean Distance)** 計算食物營養素與使用者歷史偏好的相似度。



### 3.前端營養快照

* 解決推薦模式下「目標浮動」的 UX 問題。
* 進入推薦模式時，系統鎖定當下的「已攝取量」作為分母，新增食物僅累加於 Session 變數，提供穩定的進度條回饋。

### 4.完善的審核與權限機制

* **社群共創**：允許使用者上傳新食物（預設狀態為 `pending`）。
* **管理員後台**：提供審核介面，管理員可批准 (`approved`) 或駁回 (`rejected`) 上傳，並具備直接刪除食物的權限。
* **安全性**：實作 Session 驗證防止越權存取，並使用參數化查詢防禦 SQL Injection。

---

## 系統架構

本系統採用 **前後端分離 (Client-Server)** 架構設計。

* **Frontend**: HTML5, CSS3 (Custom Design), JavaScript (Vanilla)
* **Backend**: Python Flask (RESTful API & Template Rendering)
* **Database**: MySQL 8.0 (Relational Data)
* **External**: 衛福部 TFND 資料庫 (Excel Source)

---

## 技術堆疊 (Tech Stack)

| 類別 | 技術 / 工具 | 說明 |
| --- | --- | --- |
| **後端** | Python 3.10+, Flask | 核心邏輯、API 路由、多執行緒管理 |
| **資料庫** | MySQL 8.0, SQLAlchemy | 資料儲存、正規化設計 |
| **前端** | HTML5, CSS3, JavaScript | RWD 介面、AJAX 資料串接、DOM 操作 |
| **資料處理** | Pandas, OpenPyXL | Excel 資料清洗與正規化 |
| **設計工具** | Figma | UI/UX 原型設計 |

---

## 安裝與執行

### 前置需求

* Python 3.8+
* MySQL Server

### 步驟


1. **建立虛擬環境 (建議)**
```bash
python -m venv venv
# Windows
venv\Scripts\activate
# Mac/Linux
source venv/bin/activate
```


2. **安裝依賴套件**
```bash
pip install -r requirements.txt
```


3. **設定資料庫**
* 在 MySQL 中建立資料庫 `food_nutrition`。
* 匯入專案提供的 `food_nutrition.sql` 檔案以建立資料表結構。
* 修改 `app.py` 或設定檔中的資料庫連線資訊 (`DB_USER`, `DB_PASSWORD`)。


4. **啟動伺服器**
```bash
python app.py
```


伺服器預設運行於 `http://127.0.0.1:5000`。

---

## 資料庫設計

系統包含以下核心實體：

* **User**: 使用者帳號、BMR 身體數值、過敏原設定。
* **Food**: 食物營養資訊、審核狀態 (`approval_status`)。
* **Record**: 飲食紀錄流水帳 (多對多關聯)。
* **AuditLog**: 管理員審核歷程紀錄。
* **VIP**: 進階會員資格與期限。

---

## 開發團隊

| 學號 | 姓名 | 負責項目 |
| --- | --- | --- |
| **C112151111** | **王凱弘** | 系統架構設計、爬蟲與自動化模組、資料庫設計、推薦演算法 |
| **C112151103** | **徐博凱** | 後端 API 開發、SQL 邏輯優化、分頁與搜尋功能實作 |
| **C112151160** | **王偉丞** | 前端頁面整合、JavaScript 邏輯串接、CSS 樣式優化 |
| **C112151131** | **莊翔宇** | UI/UX 設計、Figma 原型製作、使用者體驗優化 |

---

## 聲明

本系統為學術專題研究作品，食物營養數據來源為[衛生福利部食品藥物管理署](https://consumer.fda.gov.tw/Food/TFND.aspx)。系統提供的健康建議僅供參考，如有特殊疾病或飲食限制，請諮詢專業醫師或營養師。