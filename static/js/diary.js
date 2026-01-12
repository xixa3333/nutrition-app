// 1. 頁面載入時的初始化
document.addEventListener('DOMContentLoaded', function() {
    const today = new Date();
    // 處理時區問題
    const offset = today.getTimezoneOffset();
    const todayLocal = new Date(today.getTime() - (offset*60*1000));
    const todayStr = todayLocal.toISOString().split('T')[0];
    
    const dateInput = document.getElementById('diaryDate');
    if (dateInput) {
        dateInput.value = todayStr;
        loadDiaryRecords(todayStr);
    }
});

// 2. 載入並顯示特定日期的紀錄
async function loadDiaryRecords(date) {
    if (!date) return;
    
    try {
        const recordsList = document.getElementById('recordsList');
        const summaryDate = document.getElementById('summaryDate');
        
        if(recordsList) recordsList.innerHTML = '<p style="text-align:center;">載入中...</p>';
        if(summaryDate) summaryDate.textContent = `(${date})`;
        
        const response = await fetch(`/api/records/daily?date=${date}`);
        const result = await response.json();
        
        if (!result.success) {
            if(recordsList) recordsList.innerHTML = `<p style="color:red;text-align:center;">${result.message || '載入失敗'}</p>`;
            return;
        }

        const records = result.records;
        const summary = result.summary;

        // A. 顯示總計
        if (document.getElementById('totalCalories')) {
            document.getElementById('totalCalories').textContent = Math.round(summary.total_calories);
            document.getElementById('totalProtein').textContent = Math.round(summary.total_protein);
            document.getElementById('totalFat').textContent = Math.round(summary.total_fat);
            document.getElementById('totalCarbs').textContent = Math.round(summary.total_carbs);
            document.getElementById('totalFiber').textContent = Math.round(summary.total_fiber);
        }
        
        // B. 顯示詳細紀錄列表 (★ 新增刪除按鈕)
        if (recordsList) {
            if (records.length === 0) {
                recordsList.innerHTML = '<p style="text-align:center; padding: 20px;">今天還沒有新增任何紀錄喔！<br><a href="home.html">快去首頁新增食物吧！</a></p>';
                return;
            }
            
            recordsList.innerHTML = records.map(record => `
                <div class="record-card" style="position: relative;">
                    <button onclick="deleteRecord(${record.record_id})" 
                            style="position: absolute; top: 10px; right: 10px; background: #ff4d4d; color: white; border: none; border-radius: 4px; padding: 5px 10px; cursor: pointer; font-size: 0.8em;">
                        刪除
                    </button>

                    <div class="record-header">
                        <h4>${record.name} <span style="font-size:0.8em; color:#666;">(${record.meal_type})</span></h4>
                    </div>
                    <div class="record-body">
                        <p>份量: <strong>${record.portion}</strong> g</p>
                        <p style="font-size: 0.9em; color: #555; margin-top: 5px;">
                            熱量: ${record.total_calories}卡 | 蛋白質: ${record.total_protein}g | 碳水: ${record.total_carbs}g | 脂肪: ${record.total_fat}g | 膳食纖維: ${record.total_fiber}g
                        </p>
                    </div>
                </div>
            `).join('');
        }

    } catch (error) {
        console.error("載入失敗:", error);
        const list = document.getElementById('recordsList');
        if(list) list.innerHTML = '<p style="color:red;text-align:center;">連線錯誤。</p>';
    }
}

// 3. 點擊「查看當日紀錄」
function loadDiaryByDate() {
    const date = document.getElementById('diaryDate').value;
    loadDiaryRecords(date);
}

// ★ 4. 新增：刪除紀錄函式
async function deleteRecord(recordId) {
    if (!confirm("確定要刪除這筆紀錄嗎？此動作無法復原。")) {
        return;
    }

    try {
        const response = await fetch('/api/records/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ record_id: recordId })
        });
        
        const result = await response.json();
        
        if (result.success) {
            // 刪除成功後，重新載入當天的紀錄
            const date = document.getElementById('diaryDate').value;
            loadDiaryRecords(date);
        } else {
            alert("刪除失敗：" + result.message);
        }
    } catch (error) {
        console.error("刪除錯誤:", error);
        alert("系統發生錯誤");
    }
}