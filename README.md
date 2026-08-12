# 食刻營養｜智慧飲食營養管理與推薦系統

> **讓每一餐，都更接近你的目標。**
>
> 整合可信登入、飲食紀錄、自動營養目標、個人化食物推薦與官方食品資料的公開營養管理網站。

[前往正式網站](https://shike-nutrition.gpt-sub-team.chatgpt.site) · [查看 GitHub 專案](https://github.com/xixa3333/nutrition-app) · [查看資料更新狀態](https://github.com/xixa3333/nutrition-app/actions/workflows/update-food-database.yml)

---

## 專案簡介

食刻營養協助使用者搜尋食物、記錄每日攝取，並依年齡、性別、身高、體重、活動量及增肌／維持／減脂目標，自動計算每日熱量與三大營養素需求。

系統以衛生福利部食品藥物管理署的[食品營養成分資料庫（TFND）](https://consumer.fda.gov.tw/Food/TFND.aspx?nodeID=178)為主要營養資料來源，另參考國民健康署的[健康飲食標準與六大類食物代換份量](https://www.hpa.gov.tw/Pages/Detail.aspx?nodeid=543&pid=8382&sid=717)，提供更符合日常使用情境的「一份」重量。

---

## 核心功能

### 1. 可信登入與權限管理

- 使用平台提供的可信登入身分，不接受瀏覽器自行宣告的使用者代碼。
- 後端統一執行身分驗證與權限檢查。
- 區分一般使用者與管理者；管理權限由伺服器端白名單決定。
- 管理者可審核投稿、同步資料，以及永久刪除探索食物與相關紀錄。

### 2. 自動營養目標

- 依 Mifflin–St Jeor 公式估算基礎代謝率。
- 依久坐、輕度、中度、高度與非常高活動量調整每日消耗。
- 依減脂、維持、增肌目標自動計算每日熱量。
- 同步計算蛋白質、脂肪、碳水化合物與膳食纖維目標，不由使用者手動輸入熱量。

### 3. 飲食日記與個人化推薦

- 記錄早餐、午餐、晚餐及點心的食物與實際重量。
- 根據當日攝取缺口、近 30 日飲食偏好、類別偏好及過敏原推薦食物。
- 以 07:00、12:00、18:00 作為三餐參考時間，判斷下一餐或點心推薦。
- 使用者可指定推薦類別，並修改推薦重量與餐別後加入日記。
- 探索食物固定每頁 36 筆，支援搜尋、分類與換頁。

### 4. 一份重量與營養換算

- 每項食物提供預設「一份」重量，例如蛋餅預設為 60 公克。
- 有官方代換依據的品項，優先採用國民健康署參考份量。
- 無單品官方份量時會明確標示為常用估算，使用者仍可自行調整。
- 顯示的熱量與營養素會依一份重量同步換算。

### 5. 食品資料自動更新

- [GitHub Actions](https://github.com/xixa3333/nutrition-app/actions/workflows/update-food-database.yml) 每日自動檢查 FDA Excel 資料。
- Python ETL 將原始資料清理、正規化並輸出至 [`public-site/data/foods.json`](public-site/data/foods.json)。
- 只有來源內容雜湊改變時才提交更新，避免無意義版本紀錄。
- FDA 服務暫時無法連線時，保留最後一份已驗證資料，不會清空正式資料庫。
- 正式網站背景程序會定期檢查資料雜湊，並將新版資料增量同步至 D1。

---

## 系統架構

專案採前後端分離、低耦合與可擴展模組設計：

- **Frontend**：HTML5、CSS3、Vanilla JavaScript；拆分共用 API／狀態與功能模組。
- **Backend**：TypeScript Cloudflare Worker；營養計算、份量、餐期、推薦、驗證、身分與隱私各自獨立。
- **Database**：Cloudflare D1（SQLite），保存使用者、食物、飲食紀錄與同步狀態。
- **ETL**：Python、Pandas、OpenPyXL、Requests、Beautiful Soup。
- **Hosting**：OpenAI Sites，提供公開網站、可信登入與執行環境。

```text
FDA Excel
   ↓ GitHub Actions / Python ETL
public-site/data/foods.json
   ↓ 背景雜湊檢查與增量同步
Cloudflare D1
   ↕ TypeScript Worker API
瀏覽器前端
```

---

## 技術棧

| 類別 | 技術／工具 | 用途 |
| --- | --- | --- |
| 前端 | HTML5、CSS3、Vanilla JavaScript | RWD 介面、食物探索、日記與設定 |
| 後端 | TypeScript、Cloudflare Worker | REST API、授權、營養與推薦邏輯 |
| 資料庫 | Cloudflare D1、SQLite | 使用者、食物、紀錄與同步狀態 |
| 資料工程 | Python 3.12、Pandas、OpenPyXL | Excel 下載、清理與正規化 |
| 自動化 | GitHub Actions | 每日資料更新、測試與自動提交 |
| 測試 | Vitest、unittest、V8 Coverage | 單元、整合、邊緣、白盒與資安測試 |
| 部署 | OpenAI Sites | 正式網站、可信登入與持久化資源 |

---

## 專案目錄

```text
food_project/
├─ public-site/
│  ├─ server/              # 後端領域與安全模組
│  ├─ static/              # 前端頁面、樣式與功能模組
│  ├─ worker/              # Worker API 與 D1 存取
│  ├─ data/foods.json      # 正規化食品資料
│  ├─ drizzle/             # 資料庫遷移
│  └─ tests/               # TypeScript 測試
├─ scripts/
│  └─ update_food_database.py
├─ tests/                  # Python ETL 測試
├─ database/               # 原始 Excel、過敏原規則與舊版 SQL
├─ requirements.txt
└─ .github/workflows/
   └─ update-food-database.yml
```

---

## 本機開發與測試

### 網站

```bash
cd public-site
npm install
npm run build
npm test
npm run test:coverage
```

### 食品資料正規化

```bash
python -m pip install -r requirements.txt
python -m unittest discover -s tests -p "test_*.py"
python scripts/update_food_database.py
```

如需嘗試下載 FDA 最新資料：

```bash
python scripts/update_food_database.py --download
```

---

## 資安與個資隱私

- 僅接受託管平台注入的可信身分標頭。
- 管理者角色由後端白名單計算，前端無法自行提升權限。
- SQL 全面使用參數綁定，降低注入風險。
- 個人資料 API 採欄位白名單，不回傳內部代碼及管理旗標。
- 伺服器錯誤對外遮蔽，避免洩漏 SQL、堆疊與內部實作資訊。
- API 回應包含禁止快取、內容類型保護、Referrer Policy 與 CSP。
- 過敏原屬使用者輔助篩選資訊，不能取代醫師或營養師建議。

---

## 團隊成員

| 學號 | 主要工作 |
| --- | --- |
| C112151111 | 系統架構、資料庫、資料正規化與推薦系統 |
| C112151103 | 後端 API、SQL、資料處理與功能開發 |
| C112151160 | 前端互動、JavaScript 與 CSS 視覺設計 |
| C112151131 | UI／UX、Figma 與介面規劃 |

---

## 相關連結

- [正式網站｜食刻營養](https://shike-nutrition.gpt-sub-team.chatgpt.site)
- [GitHub Repository](https://github.com/xixa3333/nutrition-app)
- [食品資料自動更新紀錄](https://github.com/xixa3333/nutrition-app/actions/workflows/update-food-database.yml)
- [衛生福利部食品藥物管理署｜食品營養成分資料庫](https://consumer.fda.gov.tw/Food/TFND.aspx?nodeID=178)
- [衛生福利部國民健康署｜健康飲食標準](https://www.hpa.gov.tw/Pages/Detail.aspx?nodeid=543&pid=8382&sid=717)

---

## 聲明

本專案為課程專題與營養管理輔助工具。網站提供的熱量、營養目標、份量與推薦僅供一般健康管理參考，不能取代醫師、營養師或其他醫療專業人員的診斷與建議。
