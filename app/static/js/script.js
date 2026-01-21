// Use relative path for API - works with same-origin requests
const API_URL = '/api';

let dynamicSequence = []; // 动态序列，存储题目ID
let questionMap = new Map(); // 映射：ID -> 题目对象
let currentItem = null;
let fileName = "";
let totalItems = 0; // 总题目数
let masteredItems = 0; // 已掌握的题目数
let isEditMode = false; // 是否处于编辑模式

// 保存进度到localStorage
function saveProgress() {
    if (!fileName) return;
    const progressKey = `progress_${fileName}`;
    const progressData = {
        questionMap: Array.from(questionMap.entries()),
        masteredItems: masteredItems,
        totalItems: totalItems,
        dynamicSequence: dynamicSequence
    };
    try {
        localStorage.setItem(progressKey, JSON.stringify(progressData));
        console.log(`💾 进度已保存: ${fileName}`);
    } catch (e) {
        console.error('❌ 保存进度失败:', e);
    }
}

// 从localStorage加载进度
function loadProgress(fileName) {
    const progressKey = `progress_${fileName}`;
    try {
        const saved = localStorage.getItem(progressKey);
        if (saved) {
            const progressData = JSON.parse(saved);
            console.log(`📂 加载已保存的进度: ${fileName}`);
            return progressData;
        }
    } catch (e) {
        console.error('❌ 加载进度失败:', e);
    }
    return null;
}

// 生成随机间隔（8-12之间）
function getRandomInterval() {
    return Math.floor(Math.random() * 5) + 8; // 8到12之间的随机数
}

// 生成较长的随机间隔（15-20之间）
function getLongRandomInterval() {
    return Math.floor(Math.random() * 6) + 15; // 15到20之间的随机数
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
    // 保存当前文件的进度（如果已加载）
    if (fileName) {
        saveProgress();
    }
    if (!fileName) {
        console.error('No file name specified');
        return;
    }
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
    
        // 加载已保存的进度（如果存在）
        const savedProgress = loadProgress(fileName);
        const savedMap = savedProgress ? new Map(savedProgress.questionMap) : new Map();

        // 初始化题目映射和动态序列
        questionMap = new Map();
        dynamicSequence = [];

        data.items.forEach(item => {
            // 检查是否有已保存的状态
            const savedState = savedMap.get(item.id);
            // 创建题目对象，合并已保存的状态
            const questionObj = {
                ...item,
                _reviewCount: savedState?._reviewCount || 0, // 本地复习次数
                _consecutiveCorrect: savedState?._consecutiveCorrect || 0, // 本地连续正确次数
                _learningStep: savedState?._learningStep || 0, // 学习步骤：0=初始，1=第一次不记得后，2=第一次记得后，3=掌握
                _mastered: savedState?._mastered || false, // 本地掌握状态
                _wrongCount: savedState?._wrongCount || 0, // 错误次数
                _correctCount: savedState?._correctCount || 0 // 正确次数
            };

            questionMap.set(item.id, questionObj);
            dynamicSequence.push(item.id); // 所有题目都加入序列
        });

        totalItems = data.items.length;
        // 计算已掌握的题目数
        masteredItems = Array.from(questionMap.values()).filter(q => q._mastered).length;

        // 如果存在保存的dynamicSequence，使用它（但过滤掉不存在的题目ID）
        if (savedProgress && savedProgress.dynamicSequence) {
            const savedSeq = savedProgress.dynamicSequence.filter(id => questionMap.has(id));
            // 如果保存的序列不为空，使用它（可能包含已掌握的题目，这没问题）
            if (savedSeq.length > 0) {
                dynamicSequence = savedSeq;
                console.log(`🔄 使用已保存的复习序列，长度: ${dynamicSequence.length}`);
            }
        } else {
            // 否则随机打乱初始序列
            shuffleArray(dynamicSequence);
        }

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

// 更新笔图标状态
function updatePencilButton() {
    const pencilBtn = document.getElementById('edit-pencil-btn');
    const postAnswerVisible = document.getElementById('post-answer-btns').style.display !== 'none';

    if (postAnswerVisible && currentItem && !isEditMode) {
        pencilBtn.style.display = 'flex';
        pencilBtn.style.opacity = '1';
        pencilBtn.disabled = false;
        pencilBtn.style.cursor = 'pointer';
    } else {
        pencilBtn.style.display = 'flex';
        pencilBtn.style.opacity = '0.3';
        pencilBtn.disabled = true;
        pencilBtn.style.cursor = 'not-allowed';
    }
}

// 进入编辑模式
function enterEditMode() {
    if (!currentItem || isEditMode) return;

    isEditMode = true;

    // 隐藏笔图标，显示编辑工具栏
    document.getElementById('edit-pencil-btn').style.display = 'none';
    document.getElementById('edit-toolbar').style.display = 'flex';

    // 保存原始内容
    const originalQuestion = currentItem.question;
    const originalAnswer = currentItem.answer;

    // 创建编辑界面
    const card = document.getElementById('card');
    const questionElem = document.getElementById('content-q');
    const answerElem = document.getElementById('content-a');

    // 保存原始显示状态
    const wasAnswerVisible = answerElem.style.display !== 'none';

    // 创建编辑表单
    const editForm = document.createElement('div');
    editForm.id = 'edit-form';
    editForm.innerHTML = `
        <div class="edit-field">
            <label class="edit-label">Question:</label>
            <textarea id="edit-question" class="edit-textarea" placeholder="Enter question...">${escapeHtml(originalQuestion)}</textarea>
        </div>
        <div class="edit-field">
            <label class="edit-label">Answer:</label>
            <textarea id="edit-answer" class="edit-textarea" placeholder="Enter answer...">${escapeHtml(originalAnswer)}</textarea>
        </div>
    `;

    // 替换卡片内容
    questionElem.style.display = 'none';
    answerElem.style.display = 'none';
    card.insertBefore(editForm, questionElem);

    // 隐藏复习按钮
    document.getElementById('pre-answer-btns').style.display = 'none';
    document.getElementById('post-answer-btns').style.display = 'none';

    // 焦点到问题输入框
    document.getElementById('edit-question').focus();
}

// 退出编辑模式
function exitEditMode() {
    if (!isEditMode) return;

    isEditMode = false;

    // 显示笔图标，隐藏编辑工具栏
    document.getElementById('edit-pencil-btn').style.display = 'flex';
    document.getElementById('edit-toolbar').style.display = 'none';

    // 移除编辑表单
    const editForm = document.getElementById('edit-form');
    if (editForm) {
        editForm.remove();
    }

    // 恢复问题答案显示
    document.getElementById('content-q').style.display = 'block';
    document.getElementById('content-a').style.display = 'block';

    // 更新笔图标状态
    updatePencilButton();
}

// 保存编辑
async function saveEdit() {
    if (!currentItem || !isEditMode) return;

    const newQuestion = document.getElementById('edit-question').value.trim();
    const newAnswer = document.getElementById('edit-answer').value.trim();

    if (!newQuestion || !newAnswer) {
        alert('Question and answer cannot be empty!');
        return;
    }

    // 如果内容没有变化，直接退出编辑模式
    if (newQuestion === currentItem.question && newAnswer === currentItem.answer) {
        exitEditMode();
        return;
    }

    try {
        // 调用API保存到文件
        const response = await fetch(`${API_URL}/update-item`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                file_name: fileName,
                item_id: currentItem.id,
                new_question: newQuestion,
                new_answer: newAnswer
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to save changes: ${response.status}`);
        }

        const result = await response.json();

        if (result.success) {
            // 更新本地数据
            const oldId = currentItem.id;
            const newId = result.new_id || currentItem.id;

            // 更新题目对象
            currentItem.question = newQuestion;
            currentItem.answer = newAnswer;
            currentItem.id = newId; // ID可能会改变

            // 如果ID改变，更新questionMap
            if (oldId !== newId) {
                questionMap.delete(oldId);
                questionMap.set(newId, currentItem);

                // 更新dynamicSequence中的ID
                const index = dynamicSequence.indexOf(oldId);
                if (index !== -1) {
                    dynamicSequence[index] = newId;
                }
            }

            // 保存进度
            saveProgress();

            // 更新显示
            document.getElementById('content-q').innerText = newQuestion;
            document.getElementById('content-a').innerText = newAnswer;

            // 退出编辑模式
            exitEditMode();

            // 显示答案区域和按钮（保持在查看答案界面）
            document.getElementById('content-a').style.display = 'block';
            document.getElementById('post-answer-btns').style.display = 'block';
            document.getElementById('pre-answer-btns').style.display = 'none';

            // 更新笔图标状态
            updatePencilButton();

            console.log('✅ Item updated successfully');
        } else {
            throw new Error(result.error || 'Unknown error');
        }
    } catch (error) {
        console.error('❌ Failed to save edit:', error);
        alert(`Failed to save changes: ${error.message}`);
    }
}

// 简单的HTML转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showQuestion() {
    // 更新进度：已掌握的题目数/总题目数
    document.getElementById('progress-tag').innerText = `${masteredItems}/${totalItems}`;

    if (dynamicSequence.length === 0) {
        // 显示all done容器，隐藏卡片和按钮
        document.getElementById('card').style.display = 'none';
        document.getElementById('all-done-container').style.display = 'flex';
        document.getElementById('pre-answer-btns').style.display = 'none';
        document.getElementById('post-answer-btns').style.display = 'none';
        currentItem = null;
        return;
    } else {
        // 显示卡片，隐藏all done容器
        document.getElementById('card').style.display = 'flex';
        document.getElementById('all-done-container').style.display = 'none';
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

    // 确保退出编辑模式（如果正在编辑）
    if (isEditMode) {
        exitEditMode();
    }

    // 更新笔图标状态
    updatePencilButton();
}

function showAnswer() {
    if (!currentItem) return;
    document.getElementById('content-a').innerText = currentItem.answer;
    document.getElementById('content-a').style.display = 'block';
    document.getElementById('pre-answer-btns').style.display = 'none';
    document.getElementById('post-answer-btns').style.display = 'block';

    // 更新笔图标状态（显示答案时可用）
    updatePencilButton();
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
        currentItem._correctCount++;

        // 情况1：第一次复习就答对（首次记得）
        if (currentItem._reviewCount === 1) {
            currentItem._mastered = true;
            currentItem._learningStep = 3; // 掌握
            masteredItems++;
            console.log(`✅ 题目首次答对，已掌握: ${currentItem.question.substring(0, 50)}...`);
        }
        // 情况2：处于学习步骤1（第一次不记得后）
        else if (currentItem._learningStep === 1) {
            // 第一次不记得后的记得：间隔15-20
            currentItem._learningStep = 2; // 进入步骤2
            const insertIndex = getLongRandomInterval(); // 15-20
            const actualIndex = Math.min(insertIndex, dynamicSequence.length);
            dynamicSequence.splice(actualIndex, 0, itemId);
            console.log(`🔄 第一次不记得后的记得，间隔${actualIndex}个位置(15-20)后复习: ${currentItem.question.substring(0, 50)}...`);
        }
        // 情况3：处于学习步骤2（第一次记得后）
        else if (currentItem._learningStep === 2) {
            // 第二次记得：掌握
            currentItem._mastered = true;
            currentItem._learningStep = 3; // 掌握
            masteredItems++;
            console.log(`✅ 第二次记得，题目已掌握: ${currentItem.question.substring(0, 50)}...`);
        }
        // 其他情况（理论上不会发生）
        else {
            console.warn(`⚠️ 未知状态：reviewCount=${currentItem._reviewCount}, learningStep=${currentItem._learningStep}`);
        }

    } else if (action === 'forgotten') {
        // 用户表示未掌握
        currentItem._wrongCount++;
        currentItem._consecutiveCorrect = 0;
        currentItem._mastered = false;

        // 无论当前处于什么步骤，不记得都重置到步骤1
        currentItem._learningStep = 1; // 进入步骤1（第一次不记得后）

        // 计算插入位置：当前位置后8-12个位置
        const insertIndex = getRandomInterval();
        const actualIndex = Math.min(insertIndex, dynamicSequence.length);
        dynamicSequence.splice(actualIndex, 0, itemId);

        console.log(`❌ 题目答错，重置到步骤1，间隔${actualIndex}个位置(8-12)后复习: ${currentItem.question.substring(0, 50)}...`);
    }

    // 保存进度
    saveProgress();

    // 显示下一题
    showQuestion();
}

// 跳转到报告页面
function viewReport() {
    if (!fileName) return;
    window.location.href = `/report?file=${encodeURIComponent(fileName)}`;
}

// Initialization
(async () => {
    try {
        // 设置编辑按钮事件监听器
        document.getElementById('edit-pencil-btn').addEventListener('click', () => {
            if (!document.getElementById('edit-pencil-btn').disabled) {
                enterEditMode();
            }
        });
        document.getElementById('cancel-edit-btn').addEventListener('click', exitEditMode);
        document.getElementById('save-edit-btn').addEventListener('click', saveEdit);

        // 添加返回按钮事件
        document.getElementById('back-btn').addEventListener('click', () => {
            window.location.href = '/';
        });

        // 获取URL参数中的文件名
        function getUrlParam(name) {
            const urlParams = new URLSearchParams(window.location.search);
            return urlParams.get(name);
        }
        const urlFile = getUrlParam('file');

        if (!urlFile) {
            document.getElementById('content-q').innerText = 'No knowledge base selected. Please select one from the home page.';
            document.getElementById('progress-tag').innerText = `0/0`;
            return;
        }

        // 验证文件存在
        const res = await fetch(`${API_URL}/files`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        const fileExists = data.files.find(f => f.name === urlFile);

        if (!fileExists) {
            document.getElementById('content-q').innerText = `Knowledge base "${urlFile}" not found.`;
            document.getElementById('progress-tag').innerText = `0/0`;
            return;
        }

        // 加载知识库
        fileName = urlFile;
        await loadLibrary();
    } catch (error) {
        console.error('❌ 初始化失败:', error);
        document.getElementById('progress-tag').innerText = `0/0`;
        document.getElementById('content-q').innerText = `初始化失败。请确保后端服务器正在运行: ${error.message}`;
    }
})();

// ======================================================================
// Report Page Functions
// These functions are used in report.html only
// ======================================================================

// Get filename from URL parameters (report page version)
function getReportUrlParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

// Format text for CSV (escape quotes)
function csvEscape(str) {
    if (str === null || str === undefined) return '';
    str = String(str);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

// Load progress data from localStorage for report
function loadReportData() {
    const fileName = getReportUrlParam('file');
    if (!fileName) {
        document.getElementById('file-name').textContent = 'No file specified';
        showNoData();
        return null;
    }

    document.getElementById('file-name').textContent = fileName;
    const progressKey = `progress_${fileName}`;
    try {
        const saved = localStorage.getItem(progressKey);
        if (!saved) {
            showNoData();
            return null;
        }
        const progressData = JSON.parse(saved);
        return { fileName, progressData };
    } catch (e) {
        console.error('Error loading report data:', e);
        showNoData();
        return null;
    }
}

function showNoData() {
    document.getElementById('no-data').style.display = 'block';
    document.getElementById('report-table').style.display = 'none';
}

// Process and display data in report
function displayReport(data) {
    const { fileName, progressData } = data;
    const questionMap = new Map(progressData.questionMap);
    const items = Array.from(questionMap.values());

    // Sort by wrong count descending, then by correct count ascending
    items.sort((a, b) => {
        if (b._wrongCount !== a._wrongCount) {
            return b._wrongCount - a._wrongCount;
        }
        return a._correctCount - b._correctCount;
    });

    // Update file info
    const totalItems = items.length;
    const masteredItems = items.filter(q => q._mastered).length;
    const totalReviews = items.reduce((sum, q) => sum + q._reviewCount, 0);

    document.getElementById('total-count').textContent = totalItems;
    document.getElementById('mastered-count').textContent = masteredItems;
    document.getElementById('review-sessions').textContent = totalReviews;

    // Populate table
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';

    items.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="id-col">${item.id}</td>
            <td class="question-col">${escapeHtml(item.question)}</td>
            <td class="count-col error-count">${item._wrongCount}</td>
            <td class="count-col correct-count">${item._correctCount}</td>
            <td class="count-col">${item._reviewCount}</td>
            <td class="count-col">${item._mastered ? '✅' : '❌'}</td>
        `;
        tbody.appendChild(row);
    });
}

// Simple HTML escaping
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Export menu functions
function showExportMenu() {
    const modal = document.getElementById('exportModal');
    modal.classList.add('active');
    // Add click outside to close
    modal.addEventListener('click', handleModalClick);
}

function hideExportMenu(event) {
    if (event) {
        event.stopPropagation();
    }
    const modal = document.getElementById('exportModal');
    modal.classList.remove('active');
    modal.removeEventListener('click', handleModalClick);
}

function handleModalClick(event) {
    const modal = document.getElementById('exportModal');
    // If click is on the overlay (not the modal content), close the modal
    if (event.target === modal) {
        hideExportMenu();
    }
}

// Close modal with Escape key
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        const modal = document.getElementById('exportModal');
        if (modal.classList.contains('active')) {
            hideExportMenu();
        }
    }
});

// Export functions
function exportHtml(event) {
    if (event) {
        event.stopPropagation();
    }
    const data = loadReportData();
    if (!data) return;

    const { progressData, fileName } = data;
    const questionMap = new Map(progressData.questionMap);
    const items = Array.from(questionMap.values());

    // Sort by wrong count descending
    items.sort((a, b) => b._wrongCount - a._wrongCount);

    // Calculate statistics
    const totalItems = items.length;
    const masteredItems = items.filter(q => q._mastered).length;
    const totalReviews = items.reduce((sum, q) => sum + q._reviewCount, 0);

    // Generate HTML content
    let htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Review Report - ${fileName}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .report-header {
            background: linear-gradient(135deg, #bb86fc, #7e57c2);
            color: white;
            padding: 30px;
            border-radius: 12px;
            margin-bottom: 30px;
            text-align: center;
        }
        .report-header h1 {
            margin: 0 0 10px 0;
            font-size: 2.2em;
        }
        .report-header .subtitle {
            font-size: 1.1em;
            opacity: 0.9;
        }
        .stats-container {
            display: flex;
            justify-content: center;
            gap: 30px;
            flex-wrap: wrap;
            margin-bottom: 30px;
        }
        .stat-card {
            background: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            text-align: center;
            min-width: 150px;
        }
        .stat-value {
            font-size: 2em;
            font-weight: bold;
            color: #7e57c2;
            margin-bottom: 5px;
        }
        .stat-label {
            color: #666;
            font-size: 0.9em;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        th, td {
            padding: 15px;
            text-align: left;
            border-bottom: 1px solid #e0e0e0;
        }
        th {
            background: linear-gradient(135deg, #bb86fc, #7e57c2);
            color: white;
            font-weight: 600;
        }
        tr:hover {
            background-color: rgba(187, 134, 252, 0.05);
        }
        .error-count {
            color: #d95e39;
            font-weight: bold;
        }
        .correct-count {
            color: #20897c;
            font-weight: bold;
        }
        .mastered-yes {
            color: #20897c;
            font-weight: bold;
        }
        .mastered-no {
            color: #d95e39;
            font-weight: bold;
        }
        .footer {
            text-align: center;
            margin-top: 40px;
            color: #888;
            font-size: 0.9em;
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
        }
        @media print {
            body {
                background: white;
                padding: 0;
            }
            .report-header {
                background: #7e57c2 !important;
                -webkit-print-color-adjust: exact;
            }
            th {
                background: #7e57c2 !important;
                -webkit-print-color-adjust: exact;
            }
        }
    </style>
</head>
<body>
    <div class="report-header">
        <h1>📊 Review Report</h1>
        <div class="subtitle">${fileName} | Generated on ${new Date().toLocaleString()}</div>
    </div>

    <div class="stats-container">
        <div class="stat-card">
            <div class="stat-value">${totalItems}</div>
            <div class="stat-label">Total Questions</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${masteredItems}</div>
            <div class="stat-label">Mastered</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${totalReviews}</div>
            <div class="stat-label">Review Sessions</div>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th>ID</th>
                <th>Question</th>
                <th>Wrong Count</th>
                <th>Correct Count</th>
                <th>Review Count</th>
                <th>Mastered</th>
            </tr>
        </thead>
        <tbody>
`;

    // Add table rows
    items.forEach(item => {
        const question = escapeHtml(item.question);
        htmlContent += `
            <tr>
                <td>${item.id}</td>
                <td>${question}</td>
                <td class="error-count">${item._wrongCount}</td>
                <td class="correct-count">${item._correctCount}</td>
                <td>${item._reviewCount}</td>
                <td class="${item._mastered ? 'mastered-yes' : 'mastered-no'}">${item._mastered ? '✅ Yes' : '❌ No'}</td>
            </tr>`;
    });

    htmlContent += `
        </tbody>
    </table>

    <div class="footer">
        Generated by Reviewer Intense • ${new Date().toLocaleString()}
    </div>
</body>
</html>`;

    // Create and download the file
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `review_report_${fileName.replace('.json', '')}_${new Date().getTime()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Close the export menu after selection
    hideExportMenu();
}

function exportTxt(event) {
    if (event) {
        event.stopPropagation();
    }
    const data = loadReportData();
    if (!data) return;

    const { progressData } = data;
    const questionMap = new Map(progressData.questionMap);
    const items = Array.from(questionMap.values());

    // Sort by wrong count descending
    items.sort((a, b) => b._wrongCount - a._wrongCount);

    let txtContent = `Review Report - ${data.fileName}\n`;
    txtContent += `Generated on ${new Date().toLocaleString()}\n`;
    txtContent += '='.repeat(50) + '\n\n';

    items.forEach((item, index) => {
        txtContent += `[${index + 1}] ID: ${item.id}\n`;
        txtContent += `Question: ${item.question}\n`;
        txtContent += `Wrong: ${item._wrongCount} | Correct: ${item._correctCount} | Reviews: ${item._reviewCount} | Mastered: ${item._mastered ? 'Yes' : 'No'}\n`;
        txtContent += '-'.repeat(40) + '\n';
    });

    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `review_report_${data.fileName.replace('.json', '')}_${new Date().getTime()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Close the export menu after selection
    hideExportMenu();
}

function exportCsv(event) {
    if (event) {
        event.stopPropagation();
    }
    const data = loadReportData();
    if (!data) return;

    const { progressData } = data;
    const questionMap = new Map(progressData.questionMap);
    const items = Array.from(questionMap.values());

    // Sort by wrong count descending
    items.sort((a, b) => b._wrongCount - a._wrongCount);

    let csvContent = 'ID,Question,Wrong Count,Correct Count,Review Count,Mastered\n';
    items.forEach(item => {
        csvContent += `${csvEscape(item.id)},${csvEscape(item.question)},${item._wrongCount},${item._correctCount},${item._reviewCount},${item._mastered ? 'Yes' : 'No'}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `review_report_${data.fileName.replace('.json', '')}_${new Date().getTime()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Close the export menu after selection
    hideExportMenu();
}

function goBack() {
    const fileName = getReportUrlParam('file');
    if (fileName) {
        window.location.href = `/review?file=${encodeURIComponent(fileName)}`;
    } else {
        window.location.href = '/';
    }
}
