// 1. 載入待審核列表
async function displayPendingFoods() {
    try {
        const response = await fetch('/api/foods/pending');
        
        if (response.status === 403) {
            alert("權限不足！");
            window.location.href = 'home.html';
            return;
        }

        const pendingFoods = await response.json();
        document.getElementById('pendingTotal').textContent = pendingFoods.length;
        
        const container = document.getElementById('reviewList');
        
        if (pendingFoods.length === 0) {
            container.innerHTML = '<p style="text-align:center;padding:40px;color:#666;">目前沒有待審核的食物 🎉</p>';
            return;
        }
        
		
        container.innerHTML = pendingFoods.map(food => {
            // 處理過敏原顯示
            const allergens = Array.isArray(food.allergens) ? food.allergens.join(', ') : '';
            
            return `
            <div class="review-item">
                <img src="${food.image}" alt="${food.name}" onerror="this.src='https://placehold.co/150x150?text=No+Image'">
                <div class="review-content">
                    <h3>${food.name}</h3>
                    
                    <p><strong>分類:</strong> ${food.category} | <strong>份量:</strong> ${food.unit}</p>
                    <p><strong>熱量:</strong> ${food.calories} 卡</p>
                    
                    <div class="nutrition-info" style="background:#f9f9f9; padding:10px; border-radius:5px; margin:10px 0; font-size:0.9em;">
                        <p><strong>三大營養素:</strong> 
                           蛋白質 ${food.protein}g | 
                           碳水 ${food.carbs}g | 
                           脂肪 ${food.fat}g</p>
                        <p><strong>膳食纖維:</strong> ${food.fiber}g</p>
                    </div>

                    ${allergens ? `<p style="color:#d32f2f;"><strong>⚠️ 過敏原:</strong> ${allergens}</p>` : ''}
                    
                    <p><strong>描述:</strong> ${food.description || '無描述'}</p>
                    
                    <div style="margin-top:10px; padding-top:10px; border-top:1px dashed #ccc; font-size:0.85em; color:#666;">
                        <p>上傳者: ${food.uploadUser}</p>
                        <p>日期: ${food.date}</p>
                    </div>

                    <div class="review-actions">
                        <button class="btn-success" onclick="reviewAction(${food.id}, 'approve')">通過</button>
                        <button class="btn-danger" onclick="reviewAction(${food.id}, 'reject')">拒絕</button>
                    </div>
                </div>
            </div>
        `}).join('');
        
    } catch (error) {
        console.error("載入失敗:", error);
    }
}

// 2. 執行審核動作
async function reviewAction(id, action) {
    const actionText = action === 'approve' ? '通過' : '拒絕';
    if (!confirm(`確定要【${actionText}】此食物嗎？`)) return;

    try {
        const response = await fetch('/api/foods/review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ food_id: id, action: action })
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('操作成功！');
            displayPendingFoods(); // 重新載入列表
        } else {
            alert('失敗：' + result.message);
        }
    } catch (error) {
        console.error(error);
        alert('系統錯誤');
    }
}

// 啟動
displayPendingFoods();