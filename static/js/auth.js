// 1. 檢查前端登入狀態 (負責門禁與 UI 顯示)
function checkAuth() {
    // 從瀏覽器的暫存區 (LocalStorage) 拿出 'currentUser' 這個欄位的資料
    // 因為存進去時是字串 (String)，所以要用 JSON.parse() 把它還原成物件 (Object)
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    
    // 這裡做兩個檢查：
    // 1. !currentUser: 如果沒有使用者資料 (代表沒登入)
    // 2. !window...includes('index.html'): 且目前網址「不是」在登入頁 (代表想偷看內部頁面)
    if (!currentUser && !window.location.pathname.includes('index.html')) {
        // 兩個條件都成立，代表是偷渡客，強制跳轉回登入頁
        window.location.href = 'index.html';
        // 回傳 null，並結束這個函式
        return null;
    }
    // 如果有登入，或是本來就在登入頁，就回傳使用者資料給呼叫者使用
    return currentUser;
}

// 2. 登入表單處理
// 先檢查這一頁有沒有 id="loginForm" 的元素，如果有才執行 (避免在首頁報錯)
if (document.getElementById('loginForm')) {
    
    // 當使用者按下「送出 (submit)」時執行裡面的函式，幫表單加上「監聽器」。
    document.getElementById('loginForm').addEventListener('submit', function(e) {
        // (A) 非常重要！阻止瀏覽器預設的「重新整理頁面」行為
        // 這樣我們才能用 JavaScript 接手處理資料
        e.preventDefault(); 
        
        // (B) 去 HTML 裡面抓 id="username" 和 "password" 的輸入框，取出裡面的值 (.value)
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        // (C) 【關鍵】使用 fetch 指令，像寄信一樣發送請求給後端的 '/login' 網址
        fetch('/login', {
            method: 'POST', // 指定用 POST 方法 (寄信模式)
            headers: {
                'Content-Type': 'application/json' // 告訴後端：我信封裡裝的是 JSON 格式的資料
            },
            // 把帳號密碼的物件，轉成 JSON 字串 (Stringify) 放入信封，打包給food_app.py
            body: JSON.stringify({ 
                username: username, 
                password: password 
            })
        })
        // (D) 等待後端回信。後端回傳的是一個 Response 物件
        // response.json() 會把回傳的內容解析成 JavaScript 可以用的資料
        .then(response => response.json()) 
        
        // 當解析完成，我們拿到 data (就是 Python 回傳的那個字典)
        .then(data => {
            // (E) 檢查 data 裡面的 success 欄位是 True 還是 False
            if (data.success) {
                // 成功：跳出歡迎視窗
                alert('登入成功！歡迎 ' + data.user);
                
                // (F) 製作一張名片 (userInfo)，存到瀏覽器裡
                // 這是為了讓首頁、個人頁能馬上顯示名字，不用每次都問後端
                const userInfo = {
                    username: username,
                    nickname: data.user, // 後端回傳的暱稱
                    isAdmin: data.is_admin // 簡單判斷是不是管理員
                };
                // 把這張名片轉成字串，存入 localStorage
                localStorage.setItem('currentUser', JSON.stringify(userInfo));
                
                // (G) 成功後，讓瀏覽器跳轉到首頁
                window.location.href = 'home.html';
            } else {
                // 失敗：跳出後端回傳的錯誤訊息 (例如：帳號或密碼錯誤)
                alert(data.message);
            }
        })
        // 如果連線過程出錯 (例如網路斷線、伺服器沒開)，會執行這裡
        .catch(error => {
            console.error('Error:', error); // 在開發者工具印出錯誤細節
            alert('系統發生錯誤，請檢查後端連線'); // 告訴使用者出事了
        });
    });
}

// 3. 登出功能
// 先檢查這一頁有沒有登出按鈕
if (document.getElementById('logoutBtn')) {
    // 監聽點擊事件 (click)
    document.getElementById('logoutBtn').addEventListener('click', function(e) {
        // 阻止 `<a>` 標籤原本的跳轉行為 (雖然這裡我們後面還是會跳轉，但這是好習慣)
        e.preventDefault();
        
        // (H) 把瀏覽器口袋裡的名片撕掉 (清除前端暫存)
        localStorage.removeItem('currentUser');
        
        // (I) 【關鍵】命令瀏覽器前往後端的 '/logout' 網址
        // 這會觸發 Python 的 logout 函式，由後端把 Session (身分證) 銷毀
        window.location.href = '/logout';
    });
}

// 4. UI 控制：如果是管理員，顯示審核連結
// 執行第一部分的 checkAuth，拿到使用者的資料
const currentUser = checkAuth();

// 如果使用者存在 (已登入) 且 isAdmin 為真 (是管理員)
if (currentUser && currentUser.isAdmin) {
    // 找出所有 id="reviewLink" 的元素 (原本在 HTML 裡是用 style="display:none" 藏起來的)
    const reviewLinks = document.querySelectorAll('#reviewLink');
    
    // 把每一個找到的連結，樣式改成 'block' (顯示出來)
    reviewLinks.forEach(link => link.style.display = 'block');
}

// 5. 前端路由守衛：防止一般人偷看審核頁面
// 如果目前網址包含 'review.html' (審核頁)
if (window.location.pathname.includes('review.html')) {
    // 如果 沒登入 或者 登入了但不是管理員
    if (!currentUser || !currentUser.isAdmin) {
        alert('權限不足！'); // 警告
        window.location.href = 'home.html'; // 踢回首頁
    }
}