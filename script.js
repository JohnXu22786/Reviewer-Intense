const hostname = window.location.hostname || 'localhost';
const API_URL = `http://${hostname}:1200/api`;

let dynamicSequence = []; // 动态序列，存储题目ID
let questionMap = new Map(); // 映射：ID -> 题目对象
let currentItem = null;
let fileName = "";
let totalItems = 0; // 总题目数
let masteredItems = 0; // 已掌握的题目数

// 生成随机间隔（8-12之间）
function getRandomInterval() {
    return Math.floor(Math.random() * 5) + 8; // 8到12之间的随机数
}

document.addEventListener('keydown', (e) => {
    const preAnswerVisible = document.getElementById('pre-answer-btns').style.display !== 'none';
    const postAnswerVisible = document.getElementById('post-answer-btns').style.display !== 'none';
    const key = e.key.toLowerCase();

    if ((key === ' ' || e.code === 'Space') && preAnswerVisible) {
        e.preventDefault();
        showAnswer();
    }
    else if (key === 'f' && postAnswerVisible) {
        e.preventDefault();
        handleAction('forgotten');
    }
    else if (key === 'j' && postAnswerVisible) {
        e.preventDefault();
        handleAction('recognized');
    }
});

async function loadLibrary() {
    fileName = document.getElementById('file-selector').value;
    if (!fileName) return;
    console.log(`📖 Loading library: ${fileName}`);

    try {
        const res = await fetch(`${API_URL}/load`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ file_name: fileName })
        });
    
        if (!res.ok) {
            let errorDetail = `HTTP Error ${res.status}`;
            try {
                const data = await res.json();
                if (data.error) {
                    errorDetail = data.error;
                }
            } catch (e) {}
            throw new Error(errorDetail);
        }
      
        const data = await res.json();
    
        // 初始化题目映射和动态序列
        questionMap = new Map();
        dynamicSequence = [];
        
        data.items.forEach(item => {
            // 创建题目对象，添加本地状态
            const questionObj = {
                ...item,
                _reviewCount: 0, // 本地复习次数
                _consecutiveCorrect: 0, // 本地连续正确次数
                _mastered: false // 本地掌握状态
            };
            
            questionMap.set(item.id, questionObj);
            dynamicSequence.push(item.id); // 所有题目都加入序列
        });
      
        totalItems = data.items.length;
        masteredItems = 0;
        
        // 随机打乱初始序列
        shuffleArray(dynamicSequence);
        
        currentItem = null;
        showQuestion();
    
    } catch (error) {
        console.error('❌ Load failed:', error);
        document.getElementById('content-q').innerText = `Load failed: ${error.message}`;
        document.getElementById('progress-tag').innerText = `0/0`;
    }
}

// Fisher-Yates洗牌算法
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function showQuestion() {
    // 更新进度：已掌握的题目数/总题目数
    document.getElementById('progress-tag').innerText = `${masteredItems}/${totalItems}`;

    if (dynamicSequence.length === 0) {
        document.getElementById('content-q').innerText = "🎉 所有题目已掌握！";
        document.getElementById('content-a').style.display = 'none';
        document.getElementById('pre-answer-btns').style.display = 'none';
        document.getElementById('post-answer-btns').style.display = 'none';
        currentItem = null;
        return;
    }

    // 从动态序列头部取出当前题目
    const currentId = dynamicSequence[0];
    currentItem = questionMap.get(currentId);

    if (!currentItem) {
        // 如果映射中没有找到题目，从序列中移除并尝试下一个
        dynamicSequence.shift();
        showQuestion();
        return;
    }

    document.getElementById('content-q').innerText = currentItem.question;
    document.getElementById('content-a').style.display = 'none';
    document.getElementById('pre-answer-btns').style.display = 'block';
    document.getElementById('post-answer-btns').style.display = 'none';
}

function showAnswer() {
    if (!currentItem) return;
    document.getElementById('content-a').innerText = currentItem.answer;
    document.getElementById('content-a').style.display = 'block';
    document.getElementById('pre-answer-btns').style.display = 'none';
    document.getElementById('post-answer-btns').style.display = 'block';
}

function handleAction(action) {
    if (!currentItem) return;
  
    const itemId = currentItem.id;
    
    // 从动态序列中移除当前题目
    dynamicSequence.shift();
    
    // 更新本地状态
    currentItem._reviewCount++;
    
    if (action === 'recognized') {
        // 用户表示掌握
        currentItem._consecutiveCorrect++;
        
        // v3.0.0逻辑：第一次复习就答对，或者连续答对2次
        if (currentItem._reviewCount === 1 || currentItem._consecutiveCorrect >= 2) {
            currentItem._mastered = true;
            masteredItems++;
            // 如果掌握，就从序列中完全移除
            console.log(`✅ 题目已掌握: ${currentItem.question.substring(0, 50)}...`);
        } else {
            // 尚未完全掌握，但这次答对了，插入到序列末尾
            dynamicSequence.push(itemId);
            console.log(`🔄 题目答对但未完全掌握，放入末尾: ${currentItem.question.substring(0, 50)}...`);
        }
        
    } else if (action === 'forgotten') {
        // 用户表示未掌握
        currentItem._consecutiveCorrect = 0;
        currentItem._mastered = false;
        
        // 计算插入位置：当前位置后8-12个位置
        const insertIndex = getRandomInterval();
        
        // 确保插入位置不超过序列长度
        const actualIndex = Math.min(insertIndex, dynamicSequence.length);
        
        // 将题目插入到计算出的位置
        dynamicSequence.splice(actualIndex, 0, itemId);
        console.log(`❌ 题目答错，间隔${actualIndex}个位置后复习: ${currentItem.question.substring(0, 50)}...`);
    }

    // 显示下一题
    showQuestion();
}

// Initialization
(async () => {
    try {
        const res = await fetch(`${API_URL}/files`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
        const data = await res.json();
        const sel = document.getElementById('file-selector');
    
        if (data.files.length === 0) {
            sel.add(new Option('未找到知识库文件 (.json)', ''));
            document.getElementById('content-q').innerText = '⚠️ 未找到知识库文件 (.json)';
            document.getElementById('progress-tag').innerText = `0/0`;
        } else {
            data.files.forEach(file => {
                const option = new Option(file.name, file.name);
                sel.add(option);
            });
        
            sel.onchange = loadLibrary;
            if (data.files[0].name) {
                await loadLibrary();
            }
        }
    } catch (error) {
        console.error('❌ 初始化失败:', error);
        document.getElementById('progress-tag').innerText = `0/0`;
        document.getElementById('content-q').innerText = `初始化失败。请确保后端服务器正在运行: ${error.message}`;
    }
})();
