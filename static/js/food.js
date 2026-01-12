// 全域變數：紀錄目前讀取到第幾頁
let currentPage = 1;
const ITEMS_PER_PAGE = 20; // 設定一頁顯示 20 筆
let currentUserAllergens = []; // 存使用者的過敏原 (例如 ["乳製品", "堅果"])
let globalAllergenMap = {};    // 存後端傳來的對照表 (例如 {"乳製品": ["奶類"...]})

// --- 0. 初始化設定：從後端抓取過敏原規則 ---
async function fetchAllergenConfig() {
    try {
        const response = await fetch('/api/config/allergens');
        if (response.ok) {
            globalAllergenMap = await response.json();
            console.log("✅ 已載入過敏原規則:", globalAllergenMap);
        } else {
            console.warn("無法載入過敏原規則，使用預設值");
        }
    } catch (error) {
        console.error("過敏原設定載入失敗:", error);
    }
}

// --- 1. 從後端 API 獲取資料 (支援分頁與搜尋) ---
async function getFoods(page = 1) {
    try {
        // 取得目前的搜尋條件
        const searchInput = document.getElementById('searchInput');
        const categoryFilter = document.getElementById('categoryFilter');
        
        const searchText = searchInput ? searchInput.value : '';
        const categoryVal = categoryFilter ? categoryFilter.value : '';

        // 建立 API 網址 (把參數串在後面)
        // 例如：/api/foods?page=1&limit=20&search=雞&category=肉類
        let url = `/api/foods?page=${page}&limit=${ITEMS_PER_PAGE}`;
        
        // 如果有搜尋文字，就加到網址裡
        if (searchText) {
            url += `&search=${encodeURIComponent(searchText)}`;
        }
        // 如果有選分類，也加到網址裡
        if (categoryVal) {
            url += `&category=${encodeURIComponent(categoryVal)}`;
        }

        // 發送請求給 Python
        const response = await fetch(url);
        const data = await response.json();
        
        return data; // 直接回傳後端給的資料 (後端已經篩選好了)
        
    } catch (error) {
        console.error("無法取得食物資料:", error);
        return [];
    }
}

// --- 2. 顯示食物卡片 (加入管理員刪除按鈕) ---
function displayFoods(foods, containerId, append = false) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // 取得當前使用者身分
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const isAdmin = currentUser && currentUser.isAdmin; // 判斷是否為管理員

    // 過敏原對照表
    const allergenMap = {
        '乳製品': ['奶類', '牛奶', '羊奶'],
        '堅果':   ['堅果類', '花生', '芝麻', '核桃', '腰果'],
        '海鮮':   ['魚類', '甲殼類', '魚貝類', '蝦', '蟹'],
        '麩質':   ['麩質穀物', '麵粉', '小麥'],
        '蛋':     ['蛋類', '雞蛋', '鴨蛋'],
        '大豆':   ['大豆', '黃豆', '黑豆']
    };

    const safeUserAllergens = Array.isArray(currentUserAllergens) ? currentUserAllergens : [];

    const html = foods.map(food => {
        const foodAllergens = Array.isArray(food.allergens) ? food.allergens : [];
        
        // 過敏原檢查邏輯
        let hasAllergen = false;
        for (const userAllergen of safeUserAllergens) {
            if (foodAllergens.includes(userAllergen)) { hasAllergen = true; break; }
            const keywords = allergenMap[userAllergen];
            if (keywords && keywords.some(k => foodAllergens.includes(k))) { hasAllergen = true; break; }
        }

        const allergenWarning = hasAllergen 
            ? '<span style="color:white; background:#dc3545; font-size:0.8em; margin-left:5px; padding:2px 6px; border-radius:4px;">⚠️ 過敏!</span>' 
            : '';
        
        const borderStyle = hasAllergen ? 'border: 2px solid #dc3545;' : '';

        let unit = food.unit || '100g';
        if (/^\d+(\.\d+)?$/.test(unit)) unit += 'g';

        // ★★★ 關鍵：如果是管理員，顯示刪除按鈕 ★★★
        const deleteButton = isAdmin 
            ? `<button onclick="deleteFoodItem(${food.id})" 
                       style="position:absolute; top:10px; right:10px; background:#dc3545; color:white; border:none; border-radius:4px; padding:4px 8px; cursor:pointer; font-size:0.8em; z-index:10;">
                 刪除
               </button>` 
            : '';

        const imgSrc = food.image || '';

        return `
        <div class="food-card" style="${borderStyle}; position: relative;">
            ${deleteButton} <img src="${food.image}" alt="${food.name}" onerror="this.src='https://placehold.co/250x200?text=No+Image'">
            
            <div class="food-card-content">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <h3 style="margin:0; padding-right: 40px;">${food.name}</h3> ${allergenWarning}
                </div>
                
                <div class="nutrition-info" style="margin-top:10px;">
                    <p><strong>份量:</strong> ${unit}</p>
                    <p><strong>熱量:</strong> ${food.calories} 卡</p>
                    <p style="color:#666; font-size:0.9em; line-height: 1.6;">
                       蛋白質:${food.protein} | 脂肪:${food.fat} <br>
                       碳水:${food.carbs} | 膳食纖維:${food.fiber}
                    </p>
                </div>
                
                ${foodAllergens.length > 0 ? `
                    <div class="allergen-tags" style="margin-top:8px;">
                        ${foodAllergens.map(a => `<span class="allergen-tag" style="font-size:0.8em; background:#eee; padding:2px 5px; border-radius:3px; color:#555;">${a}</span>`).join(' ')}
                    </div>
                ` : ''}

                <div style="margin-top: 15px; padding-top: 10px; border-top: 1px dashed #ccc;">
                    <div style="display: flex; gap: 5px; margin-bottom: 5px;">
                        <input type="date" id="date-${food.id}" style="font-size: 0.8em; padding: 4px; width: 65%;">
                        <input type="number" id="portion-${food.id}" placeholder="公克" value="" min="0.1" step="0.1" style="font-size: 0.8em; padding: 4px; width: 30%;">
                    </div>
                    <button class="btn-primary" style="width: 100%; padding: 5px; font-size: 0.9em;" onclick="addToDiary(${food.id})">加入紀錄</button>
                </div>
            </div>
        </div>
        `;
    }).join('');

    if (append) {
        container.innerHTML += html;
    } else {
        container.innerHTML = html;
    }
}

// --- ★ 新增函式：刪除食物 (與後端溝通) ---
async function deleteFoodItem(foodId) {
    if (!confirm("⚠️ 警告：確定要刪除這項食物嗎？\n\n這將會一併刪除所有使用者關於此食物的飲食紀錄！此動作無法復原。")) {
        return;
    }

    try {
        const response = await fetch('/api/foods/delete_item', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ food_id: foodId })
        });

        const result = await response.json();

        if (result.success) {
            alert("刪除成功！");
            // 重新載入目前頁面
            window.location.reload();
        } else {
            alert("刪除失敗：" + result.message);
        }
    } catch (error) {
        console.error(error);
        alert("系統發生錯誤");
    }
}

// --- 3. 首頁 (home.html) 的控制邏輯 ---
if (window.location.pathname.includes('home.html')) {
    (async function initHome() {
        console.log("初始化首頁...");

        // 1. 先抓過敏原規則 (Config)
        await fetchAllergenConfig();

        // 2. 再抓使用者資料 (Profile) 為了拿到使用者的過敏原設定
        try {
            const res = await fetch('/api/user/profile');
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.data.allergens) {
                    currentUserAllergens = data.data.allergens;
                    console.log("已載入使用者過敏原:", currentUserAllergens);
                }
            }
        } catch (e) {
            console.log("尚未登入或無法取得過敏原資訊");
        }
        
        // 建立「載入更多」按鈕
        const loadMoreBtn = document.createElement('button');
        loadMoreBtn.innerText = "載入更多資料...";
        loadMoreBtn.className = "btn-primary"; // 套用原本 CSS 的樣式
        loadMoreBtn.style.margin = "20px auto";
        loadMoreBtn.style.display = "block";
        loadMoreBtn.style.maxWidth = "200px";
        
        // 綁定按鈕點擊事件 (載入下一頁)
        loadMoreBtn.onclick = async function() {
            currentPage++; // 頁數 +1
            const nextFoods = await getFoods(currentPage);
            
            if (nextFoods.length === 0) {
                alert("已經沒有更多資料了！");
                loadMoreBtn.style.display = 'none'; // 沒資料就藏起來
                return;
            }
            // 使用 true (附加模式)
            displayFoods(nextFoods, 'foodGrid', true); 
        };
        
        // 把按鈕加到網頁內容的最下面
        document.querySelector('.container').appendChild(loadMoreBtn);

        // 剛進來時：載入第 1 頁
        const firstPageFoods = await getFoods(1);
        displayFoods(firstPageFoods, 'foodGrid');

        // 搜尋與分類的處理函式
        async function handleSearch() {
            // 只要一搜尋，就重置回第 1 頁
            currentPage = 1;
            loadMoreBtn.style.display = 'block'; // 重新顯示按鈕
            
            // 這次呼叫會自動帶入搜尋框的文字
            const foods = await getFoods(1);
            
            // 使用 false (覆蓋模式)，把舊資料清掉顯示搜尋結果
            displayFoods(foods, 'foodGrid', false);
        }

        // 監聽輸入框和下拉選單
        document.getElementById('searchInput').addEventListener('input', handleSearch);
        document.getElementById('categoryFilter').addEventListener('change', handleSearch);
    })();
}

// --- 4. 上傳頁面 (upload.html) 的邏輯 ---
if (window.location.pathname.includes('upload.html')) {
    
    //處理圖片預覽 (讓使用者選圖後馬上看到)
    document.getElementById('foodImage').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                document.getElementById('imagePreview').innerHTML = 
                    `<img src="${e.target.result}" alt="預覽" style="max-width: 200px; margin-top: 10px; border-radius: 8px;">`;
            };
            reader.readAsDataURL(file);
        }
    });

    //監聽表單送出
    document.getElementById('uploadForm').addEventListener('submit', function(e) {
        e.preventDefault(); // 阻止預設跳頁
        
        // (A) 收集過敏原勾選項目
        const checkedAllergens = Array.from(document.querySelectorAll('input[name="allergen"]:checked'))
                                      .map(cb => cb.value);

        // (B) 打包資料
        const formData = {
            name: document.getElementById('foodName').value,
            category: document.getElementById('foodCategory').value,
			unit: document.getElementById('foodUnit').value || '100g',
            // 轉成數字 (Float 或 Int)
            calories: parseFloat(document.getElementById('foodCalories').value) || 0,
            protein: parseFloat(document.getElementById('foodProtein').value) || 0,
            carbs: parseFloat(document.getElementById('foodCarbs').value) || 0,
			fat: parseFloat(document.getElementById('foodFat').value) || 0,			
            fiber: parseFloat(document.getElementById('foodFiber').value) || 0,
            allergens: checkedAllergens,
            description: document.getElementById('foodDescription').value
        };

        // (C) 發送給後端
        fetch('/api/foods/add', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert('🎉 上傳成功！');
                window.location.href = 'home.html'; // 成功後跳轉回首頁
            } else {
                alert('❌ 失敗：' + data.message);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('系統發生錯誤');
        });
    });
    
    //載入我的上傳紀錄
    async function loadMyUploads() {
        try {
            // 1. 呼叫後端 API
            const response = await fetch('/api/foods/my');
            
            // 如果沒登入或權限錯誤
            if (response.status === 401) return;

            const myFoods = await response.json();
            const container = document.getElementById('myUploads'); // 對應 HTML 的容器
            
            // 2. 如果沒資料
            if (myFoods.length === 0) {
                container.innerHTML = '<p style="text-align:center; color:#666; padding:20px; grid-column:1/-1;">您還沒有上傳過任何食物喔！</p>';
                return;
            }
            
            // 3. 產生卡片 HTML
            container.innerHTML = myFoods.map(food => {
                let statusBadge = '';
                let actionBtn = ''; // ★ 按鈕區塊

                if (food.approval_status === 0) {
                    statusBadge = '<span class="badge badge-pending" style="background:orange;">待審核</span>';
                    // ★ 如果是待審核，顯示取消按鈕
                    actionBtn = `
                        <button onclick="cancelUpload(${food.id})" 
                                style="margin-left:auto; background:#ff4d4d; color:white; border:none; border-radius:4px; padding:4px 8px; cursor:pointer; font-size:0.8em;">
                            取消上傳
                        </button>
                    `;
                } else if (food.approval_status === 1) {
                    statusBadge = '<span class="badge badge-approved" style="background:green;">已通過</span>';
                } else if (food.approval_status === 2) {
                    statusBadge = '<span class="badge badge-rejected" style="background:red;">已拒絕</span>';
                }
                
                return `
                <div class="food-card" style="height:auto; min-height: 100px;">
                    <div class="food-card-content">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <h3 style="margin:0;">${food.name}</h3>
                            ${statusBadge}
                        </div>
                        
                        <p style="color:#666; font-size:0.9em; margin: 5px 0;">
                            上傳日期: ${food.date} | ${food.category} | <strong>${food.calories} 卡</strong>
                        </p>
                        
                        <p style="color:#888; font-size:0.85em; margin: 3px 0;">
                            蛋白質: ${food.protein}g | 碳水: ${food.carbs}g | 脂肪: ${food.fat}g | 膳食纖維: ${food.fiber}g
                        </p>

                        <div style="display:flex; margin-top:8px;">
                            ${actionBtn}
                        </div>
                    </div>
                </div>
                `;
            }).join('');
            
        } catch (error) {
            console.error("載入紀錄失敗:", error);
        }
    }

    // --- ★ 新增函式：取消上傳 ---
    window.cancelUpload = async function(foodId) {
        if (!confirm("確定要取消這筆待審核的上傳嗎？")) return;

        try {
            const response = await fetch('/api/foods/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ food_id: foodId })
            });
            
            const result = await response.json();
            
            if (result.success) {
                alert("已取消上傳！");
                loadMyUploads(); // 重新載入列表
            } else {
                alert("失敗：" + result.message);
            }
        } catch (error) {
            console.error(error);
            alert("系統錯誤");
        }
    };
    
    // 4. 網頁一進來就執行載入
    loadMyUploads();
}

// --- 5. 個人帳戶頁面 (profile.html) 的邏輯 ---
if (window.location.pathname.includes('profile.html')) {
    
    // 定義載入資料的函式
    async function loadProfile() {
        try {
            // 1. 跟後端拿資料
            const response = await fetch('/api/user/profile'); //預設為'GET'取得資料會對應到food_app中的網址後去對應'GET'
            const result = await response.json();
            
            if (result.success) {
                const data = result.data;
                
				//填入加入時間
				if (document.getElementById('joinDate')) {
                    document.getElementById('joinDate').textContent = data.join_date || '未知';
                }
				
                //填入表單 (Basic Info)
                document.getElementById('userEmail').value = data.email || '';
                document.getElementById('userPhone').value = data.phone || '';
                document.getElementById('userAge').value = data.age || '';
                document.getElementById('userGender').value = data.gender || '';
				// 新增部分：
                if(document.getElementById('userHeight')) 
                    document.getElementById('userHeight').value = data.height || '';
                if(document.getElementById('userWeight')) 
                    document.getElementById('userWeight').value = data.weight || '';

                // ★★★ 新增：VIP 狀態處理 ★★★
                const vipBadge = document.getElementById('vipStatus');
                const upgradeBtn = document.getElementById('upgradeVipBtn');
                
                if (data.is_vip) {
                    // 如果是 VIP
                    if (vipBadge) {
                        vipBadge.textContent = `👑 VIP 會員 (到期日: ${data.vip_end_date})`;
                        vipBadge.style.display = 'inline-block';
                        vipBadge.style.background = 'linear-gradient(135deg, #FFD700, #FFA500)'; // 金色背景
                    }
                    // 隱藏升級按鈕
                    if (upgradeBtn) upgradeBtn.style.display = 'none';
                } else {
                    // 如果不是 VIP
                    if (vipBadge) {
                        vipBadge.textContent = '一般會員';
                        vipBadge.classList.add('standard'); // 加回灰底樣式
                    }
                    // 顯示升級按鈕
                    if (upgradeBtn) upgradeBtn.style.display = 'block';
                }
                // ★★★ 結束 VIP 處理 ★★★

				// 檢查後端有沒有傳 stats 過來
                if (data.stats) {
                    // 更新 HTML 上的數字
                    if (document.getElementById('uploadCount')) 
                        document.getElementById('uploadCount').textContent = data.stats.total;
                        
                    if (document.getElementById('approvedCount')) 
                        document.getElementById('approvedCount').textContent = data.stats.approved;
                        
                    if (document.getElementById('pendingCount')) 
                        document.getElementById('pendingCount').textContent = data.stats.pending;
                }
				
                
                // 填入過敏原勾選框
                // 先把所有勾勾取消
                document.querySelectorAll('input[name="userAllergen"]').forEach(cb => cb.checked = false);
                
                // 再把資料庫有的勾起來
                if (data.allergens) {
                    data.allergens.forEach(allergen => {
                        // 找到對應 value 的 checkbox 並打勾
                        const checkbox = document.querySelector(`input[name="userAllergen"][value="${allergen}"]`);
                        if (checkbox) checkbox.checked = true;
                    });
                }
            }
			
        } catch (error) {
            console.error("載入失敗:", error);
        }
    }
	
	// --- 監聽：VIP升級按鈕 ---
	document.getElementById('upgradeVipBtn')?.addEventListener('click', async function() {
        // 1. 跳出確認視窗
        if (!confirm("確定要升級為 VIP 會員嗎？(期限 30 天)")) {
            return;
        }

        try {
            // 2. 呼叫後端 API
            const response = await fetch('/api/user/vip/upgrade', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const result = await response.json();

            // 3. 成功後顯示訊息並重新載入
            if (result.success) {
                alert(result.message); // 跳出 "恭喜！您已成功成為 VIP..."
                location.reload();     // 重新整理網頁，讓介面更新狀態
            } else {
                alert("❌ " + result.message);
            }
        } catch (error) {
            console.error(error);
            alert("系統錯誤，請稍後再試");
        }
    });
	
    // --- 監聽：儲存基本資料 ---
    document.getElementById('profileForm')?.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const profileData = {
            email: document.getElementById('userEmail').value,
            phone: document.getElementById('userPhone').value,
            age: document.getElementById('userAge').value,
            gender: document.getElementById('userGender').value,
            // ★ 新增：傳送身高體重
            height: document.getElementById('userHeight').value,
            weight: document.getElementById('userWeight').value
        };
        
        updateProfile(profileData);
    });

    // --- 監聽：儲存過敏原 ---
    document.getElementById('allergenForm')?.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const checkedAllergens = Array.from(document.querySelectorAll('input[name="userAllergen"]:checked'))
                                      .map(cb => cb.value);
        
        updateProfile({ allergens: checkedAllergens });
    });

    // --- 共用的更新函式 ---
    async function updateProfile(dataToSend) {
        try {
            const response = await fetch('/api/user/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataToSend)
            });
            const result = await response.json();
            
            if (result.success) {
                alert('🎉 資料已更新！');
            } else {
                alert('❌ 更新失敗：' + result.message);
            }
        } catch (error) {
            alert('系統錯誤');
        }
    }

    // 進來頁面就先執行一次載入
    loadProfile();
}

// --- 快速加入飲食紀錄函式 ---
async function addToDiary(foodId) {  //function displayFoods(foods, containerId, append = false)在函式中的return會用到
    // 1. 抓取對應 ID 的輸入框資料
    const dateInput = document.getElementById(`date-${foodId}`);
    const portionInput = document.getElementById(`portion-${foodId}`);
    
    const dateVal = dateInput.value;
    const portionVal = portionInput.value;

    // 2. 檢查有沒有填
    if (!dateVal) {
        alert("請選擇日期時間！");
        return;
    }
    if (!portionVal || portionVal <= 0) {
        alert("請輸入正確份量！");
        return;
    }

    try {
        // 3. 發送給後端
        const response = await fetch('/api/records/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                food_id: foodId,
                date: dateVal,
                portion: parseFloat(portionVal)
            })
        });

        const result = await response.json();
        
        if (result.success) {
            alert(`🎉 ${result.message}`);
            // (選用) 成功後重置輸入框
            // portionInput.value = 1;
        } else {
            alert('❌ 失敗：' + result.message);
        }
    } catch (error) {
        console.error(error);
        alert('系統錯誤，請稍後再試');
    }
}


// 1. 頁面載入時的初始化
document.addEventListener('DOMContentLoaded', function() {
    const today = new Date();
    const dateInput = document.getElementById('diaryDate');
    
    // 預設日期為今天，並自動載入今日紀錄
    const todayStr = today.toISOString().substring(0, 10); // YYYY-MM-DD
    dateInput.value = todayStr;
    
    loadDiaryRecords(todayStr);
});

// 2. 載入並顯示特定日期的紀錄 (核心功能)
async function loadDiaryRecords(date) {
    if (!date) return;
    
    try {
        const summaryContainer = document.getElementById('diarySummaryValues');
        const recordsList = document.getElementById('recordsList');
        const summaryDate = document.getElementById('summaryDate');
        
        // 顯示載入中
        recordsList.innerHTML = '<p style="text-align:center;">載入中...</p>';
        summaryDate.textContent = `(${date})`;
        
        // 呼叫後端 API
        const response = await fetch(`/api/records/daily?date=${date}`);
        const result = await response.json();
        
        if (!result.success) {
            recordsList.innerHTML = `<p style="color:red;text-align:center;">${result.message || '載入失敗'}</p>`;
            return;
        }

        const records = result.records;
        const summary = result.summary;

        // --- A. 顯示總計 (熱量、蛋白質等) ---
        // 這是您要求的總計顯示
        summaryContainer.innerHTML = `
            <p>熱量: <strong>${summary.total_calories.toFixed(1)}</strong> 卡</p>
            <p>蛋白質: <strong>${summary.total_protein.toFixed(1)}</strong>g</p>
            <p>脂肪: <strong>${summary.total_fat.toFixed(1)}</strong>g</p>
            <p>碳水化合物: <strong>${summary.total_carbs.toFixed(1)}</strong>g</p>
            <p>膳食纖維: <strong>${summary.total_fiber.toFixed(1)}</strong>g</p>
        `;
        
        // --- B. 顯示詳細紀錄列表 ---
        if (records.length === 0) {
            recordsList.innerHTML = '<p style="text-align:center;">今天還沒有新增任何紀錄喔！</p>';
            return;
        }
        
        recordsList.innerHTML = records.map(record => `
            <div class="record-card">
                <div class="record-header">
                    <h4>${record.name} (${record.meal_type})</h4>
                    <span class="record-time">${record.record_time}</span>
                </div>
                <p>份量: <strong>${record.portion}</strong> 份 (${record.unit})</p>
                <p style="font-size: 0.9em; margin-top: 5px;">
                    總熱量: ${record.total_calories.toFixed(1)} 卡 | 
                    蛋白質: ${record.total_protein.toFixed(1)}g
                </p>
            </div>
        `).join('');

    } catch (error) {
        console.error("載入紀錄時發生錯誤:", error);
        document.getElementById('recordsList').innerHTML = '<p style="color:red;text-align:center;">網路連線錯誤或伺服器未啟動。</p>';
    }
}

// 3. 點擊「查看當日紀錄」按鈕時觸發
function loadDiaryByDate() {
    const date = document.getElementById('diaryDate').value;
    loadDiaryRecords(date);
}
