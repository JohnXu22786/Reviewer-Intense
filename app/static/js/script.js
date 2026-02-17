// Use relative path for API - works with same-origin requests
const API_URL = '/api';

// Frontend state (minimal - only what's needed for UI)
let currentItem = null;
let fileName = "";
let totalItems = 0;
let masteredItems = 0;
let remainingItems = 0;
let isEditMode = false;

// Keyboard shortcuts
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

// Load knowledge base and review state from server
async function loadLibrary() {
    if (!fileName) {
        console.error('No file name specified');
        return;
    }
    console.log(`📖 Loading library: ${fileName}`);

    try {
        // First, load the knowledge base data
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
        totalItems = data.items.length;

        // Now get review state from server
        await getReviewState();

    } catch (error) {
        console.error('❌ Load failed:', error);
        document.getElementById('content-q').innerText = `Load failed: ${error.message}`;
        document.getElementById('progress-tag').innerText = `0/0`;
    }
}

// Get current review state from server
async function getReviewState() {
    if (!fileName) return;

    try {
        const res = await fetch(`${API_URL}/review/state?file=${encodeURIComponent(fileName)}`);

        if (!res.ok) {
            throw new Error(`HTTP Error ${res.status}`);
        }

        const data = await res.json();

        if (data.success) {
            // Update UI state
            currentItem = data.next_item;
            masteredItems = data.total_mastered || 0;
            remainingItems = data.remaining_items || 0;
            totalItems = data.total_items || totalItems;

            // Update progress display
            document.getElementById('progress-tag').innerText = `${masteredItems}/${totalItems}`;

            if (currentItem) {
                // Show current question
                document.getElementById('content-q').innerText = currentItem.question;
                document.getElementById('content-a').style.display = 'none';
                document.getElementById('pre-answer-btns').style.display = 'block';
                document.getElementById('post-answer-btns').style.display = 'none';

                // Hide all-done container, show card
                document.getElementById('card').style.display = 'flex';
                document.getElementById('all-done-container').style.display = 'none';
            } else {
                // No more items to review
                showAllDone();
            }

            // Update pencil button state
            updatePencilButton();
        } else {
            throw new Error(data.error || 'Failed to get review state');
        }
    } catch (error) {
        console.error('❌ Failed to get review state:', error);
        // Fallback: try to show first question from knowledge base
        showFallbackQuestion();
    }
}

// Handle review action (recognized or forgotten)
async function handleAction(action) {
    if (!currentItem || !fileName) return;

    try {
        const res = await fetch(`${API_URL}/review/action`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                file: fileName,
                item_id: currentItem.id,
                action: action
            })
        });

        if (!res.ok) {
            throw new Error(`HTTP Error ${res.status}`);
        }

        const data = await res.json();

        if (data.success) {
            // Update local state from response
            currentItem = data.next_item;
            masteredItems = data.total_mastered || 0;
            remainingItems = data.remaining_items || 0;
            totalItems = data.total_items || totalItems;

            // Update progress display
            document.getElementById('progress-tag').innerText = `${masteredItems}/${totalItems}`;

            if (currentItem) {
                // Show next question
                document.getElementById('content-q').innerText = currentItem.question;
                document.getElementById('content-a').style.display = 'none';
                document.getElementById('pre-answer-btns').style.display = 'block';
                document.getElementById('post-answer-btns').style.display = 'none';

                // Hide all-done container, show card
                document.getElementById('card').style.display = 'flex';
                document.getElementById('all-done-container').style.display = 'none';
            } else {
                // No more items to review
                showAllDone();
            }

            // Update pencil button state
            updatePencilButton();

            console.log(`✅ Action "${action}" processed successfully`);
        } else {
            throw new Error(data.error || 'Failed to process action');
        }
    } catch (error) {
        console.error(`❌ Failed to handle action "${action}":`, error);
        alert(`操作失败: ${error.message}`);
    }
}

// Show all done screen
function showAllDone() {
    document.getElementById('card').style.display = 'none';
    document.getElementById('all-done-container').style.display = 'flex';
    document.getElementById('pre-answer-btns').style.display = 'none';
    document.getElementById('post-answer-btns').style.display = 'none';
    currentItem = null;
}

// Fallback: show first question from knowledge base (if server fails)
async function showFallbackQuestion() {
    try {
        // Try to load knowledge base directly
        const res = await fetch(`${API_URL}/load`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ file_name: fileName })
        });

        if (res.ok) {
            const data = await res.json();
            if (data.items && data.items.length > 0) {
                currentItem = data.items[0];
                document.getElementById('content-q').innerText = currentItem.question;
                document.getElementById('content-a').style.display = 'none';
                document.getElementById('pre-answer-btns').style.display = 'block';
                document.getElementById('post-answer-btns').style.display = 'none';
                document.getElementById('card').style.display = 'flex';
                document.getElementById('all-done-container').style.display = 'none';

                console.log('⚠️ Using fallback mode (no server state)');
            }
        }
    } catch (error) {
        console.error('❌ Fallback also failed:', error);
    }
}

// ============================================================================
// UI Functions (mostly unchanged from original)
// ============================================================================

// Update pencil button state
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

// Enter edit mode
function enterEditMode() {
    if (!currentItem || isEditMode) return;

    isEditMode = true;

    // Hide pencil icon, show edit toolbar
    document.getElementById('edit-pencil-btn').style.display = 'none';
    document.getElementById('edit-toolbar').style.display = 'flex';

    // Save original content
    const originalQuestion = currentItem.question;
    const originalAnswer = currentItem.answer;

    // Create edit interface
    const card = document.getElementById('card');
    const questionElem = document.getElementById('content-q');
    const answerElem = document.getElementById('content-a');

    // Save original display state
    const wasAnswerVisible = answerElem.style.display !== 'none';

    // Create edit form
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

    // Replace card content
    questionElem.style.display = 'none';
    answerElem.style.display = 'none';
    card.insertBefore(editForm, questionElem);

    // Hide review buttons
    document.getElementById('pre-answer-btns').style.display = 'none';
    document.getElementById('post-answer-btns').style.display = 'none';

    // Focus to question input
    document.getElementById('edit-question').focus();
}

// Exit edit mode
function exitEditMode() {
    if (!isEditMode) return;

    isEditMode = false;

    // Show pencil icon, hide edit toolbar
    document.getElementById('edit-pencil-btn').style.display = 'flex';
    document.getElementById('edit-toolbar').style.display = 'none';

    // Remove edit form
    const editForm = document.getElementById('edit-form');
    if (editForm) {
        editForm.remove();
    }

    // Restore question/answer display
    document.getElementById('content-q').style.display = 'block';
    document.getElementById('content-a').style.display = 'block';

    // Update pencil button state
    updatePencilButton();
}

// Save edit
async function saveEdit() {
    if (!currentItem || !isEditMode) return;

    const newQuestion = document.getElementById('edit-question').value.trim();
    const newAnswer = document.getElementById('edit-answer').value.trim();

    if (!newQuestion || !newAnswer) {
        alert('Question and answer cannot be empty!');
        return;
    }

    // If content unchanged, just exit edit mode
    if (newQuestion === currentItem.question && newAnswer === currentItem.answer) {
        exitEditMode();
        return;
    }

    try {
        // Call API to save to file
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
            // Update local data
            currentItem.question = newQuestion;
            currentItem.answer = newAnswer;

            // If ID changed (shouldn't happen with new API)
            if (result.new_id && result.new_id !== currentItem.id) {
                currentItem.id = result.new_id;
            }

            // Update display
            document.getElementById('content-q').innerText = newQuestion;
            document.getElementById('content-a').innerText = newAnswer;

            // Exit edit mode
            exitEditMode();

            // Show answer area and buttons (stay in answer view)
            document.getElementById('content-a').style.display = 'block';
            document.getElementById('post-answer-btns').style.display = 'block';
            document.getElementById('pre-answer-btns').style.display = 'none';

            // Update pencil button state
            updatePencilButton();

            console.log('✅ Item updated successfully');
        } else {
            throw new Error(result.error || 'Unknown error');
        }
    } catch (error) {
        console.error('❌ Failed to save edit:', error);
        alert(`保存失败: ${error.message}`);
    }
}

// Show answer
function showAnswer() {
    if (!currentItem) return;
    document.getElementById('content-a').innerText = currentItem.answer;
    document.getElementById('content-a').style.display = 'block';
    document.getElementById('pre-answer-btns').style.display = 'none';
    document.getElementById('post-answer-btns').style.display = 'block';

    // Update pencil button state (available when answer shown)
    updatePencilButton();
}

// Simple HTML escape
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Go to report page
function viewReport() {
    if (!fileName) return;
    window.location.href = `/report?file=${encodeURIComponent(fileName)}`;
}

// ============================================================================
// Initialization
// ============================================================================

(async () => {
    try {
        // Set up edit button event listeners
        document.getElementById('edit-pencil-btn').addEventListener('click', () => {
            if (!document.getElementById('edit-pencil-btn').disabled) {
                enterEditMode();
            }
        });
        document.getElementById('cancel-edit-btn').addEventListener('click', exitEditMode);
        document.getElementById('save-edit-btn').addEventListener('click', saveEdit);

        // Add back button event
        document.getElementById('back-btn').addEventListener('click', () => {
            window.location.href = '/';
        });

        // Get filename from URL parameters
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

        // Verify file exists
        const res = await fetch(`${API_URL}/files`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        const fileExists = data.files.find(f => f.name === urlFile);

        if (!fileExists) {
            document.getElementById('content-q').innerText = `Knowledge base "${urlFile}" not found.`;
            document.getElementById('progress-tag').innerText = `0/0`;
            return;
        }

        // Load knowledge base
        fileName = urlFile;
        await loadLibrary();
    } catch (error) {
        console.error('❌ Initialization failed:', error);
        document.getElementById('progress-tag').innerText = `0/0`;
        document.getElementById('content-q').innerText = `初始化失败。请确保后端服务器正在运行: ${error.message}`;
    }
})();

// ==================== Report and Export Functions ====================

// Get URL parameter for report page
function getReportUrlParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

// Load report data from server API (replaces localStorage)
async function loadReportData() {
    const fileName = getReportUrlParam('file');
    if (!fileName) {
        document.getElementById('file-name').textContent = 'No file specified';
        showNoData();
        return null;
    }

    document.getElementById('file-name').textContent = fileName;

    try {
        const res = await fetch(`${API_URL}/review/export-data?file=${encodeURIComponent(fileName)}`);

        if (!res.ok) {
            throw new Error(`HTTP Error ${res.status}`);
        }

        const data = await res.json();

        if (data.success) {
            return {
                fileName,
                progressData: data.data  // Contains questionMap, masteredItems, totalItems, dynamicSequence
            };
        } else {
            throw new Error(data.error || 'Failed to load export data');
        }
    } catch (e) {
        console.error('Error loading report data:', e);
        showNoData();
        return null;
    }
}

function showNoData() {
    const noDataEl = document.getElementById('no-data');
    const tableEl = document.getElementById('report-table');
    if (noDataEl) noDataEl.style.display = 'block';
    if (tableEl) tableEl.style.display = 'none';
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
    const totalItems = progressData.totalItems || items.length;
    const masteredItems = progressData.masteredItems || items.filter(q => q._mastered).length;
    const totalReviews = items.reduce((sum, q) => sum + q._reviewCount, 0);

    const totalCountEl = document.getElementById('total-count');
    const masteredCountEl = document.getElementById('mastered-count');
    const reviewSessionsEl = document.getElementById('review-sessions');

    if (totalCountEl) totalCountEl.textContent = totalItems;
    if (masteredCountEl) masteredCountEl.textContent = masteredItems;
    if (reviewSessionsEl) reviewSessionsEl.textContent = totalReviews;

    // Populate table
    const tbody = document.getElementById('table-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    items.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="id-col">${item.id}</td>
            <td class="question-col">${escapeHtml(item.question)}</td>
            <td class="count-col error-count">${item._wrongCount}</td>
            <td class="count-col correct-count">${item._correctCount}</td>
            <td class="count-col">${item._reviewCount}</td>
            <td class="count-col">${item._mastered ? '[OK]' : '[NO]'}</td>
        `;
        tbody.appendChild(row);
    });
}

// Simple HTML escaping
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// CSV escaping for export
function csvEscape(text) {
    if (text === null || text === undefined) return '';
    const stringText = String(text);
    if (stringText.includes(',') || stringText.includes('"') || stringText.includes('\n') || stringText.includes('\r')) {
        return '"' + stringText.replace(/"/g, '""') + '"';
    }
    return stringText;
}

// Export menu functions
function showExportMenu() {
    const modal = document.getElementById('exportModal');
    if (modal) {
        modal.classList.add('active');
        // Add click outside to close
        modal.addEventListener('click', handleModalClick);
    }
}

function hideExportMenu(event) {
    if (event) {
        event.stopPropagation();
    }
    const modal = document.getElementById('exportModal');
    if (modal) {
        modal.classList.remove('active');
        modal.removeEventListener('click', handleModalClick);
    }
}

function handleModalClick(event) {
    const modal = document.getElementById('exportModal');
    // If click is on the overlay (not the modal content), close the modal
    if (modal && event.target === modal) {
        hideExportMenu();
    }
}

// Close modal with Escape key
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        const modal = document.getElementById('exportModal');
        if (modal && modal.classList.contains('active')) {
            hideExportMenu();
        }
    }
});

// Go back to home page
function goBack() {
    window.location.href = '/';
}

// Export functions
async function exportHtml(event) {
    if (event) {
        event.stopPropagation();
    }
    const data = await loadReportData();
    if (!data) return;

    const { progressData, fileName } = data;
    const questionMap = new Map(progressData.questionMap);
    const items = Array.from(questionMap.values());

    // Sort by wrong count descending
    items.sort((a, b) => b._wrongCount - a._wrongCount);

    // Calculate statistics
    const totalItems = progressData.totalItems || items.length;
    const masteredItems = progressData.masteredItems || items.filter(q => q._mastered).length;
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
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding: 20px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #2c3e50;
            margin-bottom: 10px;
        }
        .stats {
            display: flex;
            justify-content: center;
            gap: 30px;
            margin-top: 20px;
            flex-wrap: wrap;
        }
        .stat-box {
            background: #f8f9fa;
            padding: 15px 25px;
            border-radius: 8px;
            border-left: 4px solid #3498db;
        }
        .stat-value {
            font-size: 24px;
            font-weight: bold;
            color: #2c3e50;
        }
        .stat-label {
            font-size: 14px;
            color: #7f8c8d;
            margin-top: 5px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            margin-top: 20px;
        }
        th {
            background: #2c3e50;
            color: white;
            padding: 15px;
            text-align: left;
            font-weight: 600;
        }
        td {
            padding: 12px 15px;
            border-bottom: 1px solid #eee;
        }
        tr:hover {
            background: #f8f9fa;
        }
        .error-count {
            color: #e74c3c;
            font-weight: bold;
        }
        .correct-count {
            color: #27ae60;
            font-weight: bold;
        }
        .mastered-yes {
            color: #27ae60;
            font-weight: bold;
        }
        .mastered-no {
            color: #e74c3c;
            font-weight: bold;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            color: #7f8c8d;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📊 Review Report - ${fileName}</h1>
        <div class="stats">
            <div class="stat-box">
                <div class="stat-value">${totalItems}</div>
                <div class="stat-label">Total Questions</div>
            </div>
            <div class="stat-box">
                <div class="stat-value">${masteredItems}</div>
                <div class="stat-label">Mastered Questions</div>
            </div>
            <div class="stat-box">
                <div class="stat-value">${totalReviews}</div>
                <div class="stat-label">Total Reviews</div>
            </div>
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
        <tbody>`;

    items.forEach(item => {
        htmlContent += `
            <tr>
                <td>${item.id}</td>
                <td>${escapeHtml(item.question)}</td>
                <td class="error-count">${item._wrongCount}</td>
                <td class="correct-count">${item._correctCount}</td>
                <td>${item._reviewCount}</td>
                <td class="${item._mastered ? 'mastered-yes' : 'mastered-no'}">${item._mastered ? 'Yes' : 'No'}</td>
            </tr>`;
    });

    htmlContent += `
        </tbody>
    </table>

    <div class="footer">
        <p>Generated on ${new Date().toLocaleString()} by Reviewer Intense</p>
    </div>
</body>
</html>`;

    // Create and download file
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeFileName = fileName.replace('.json', '');
    a.href = url;
    a.download = `review_report_${safeFileName}_${Date.now()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    hideExportMenu();
}

async function exportTxt(event) {
    if (event) {
        event.stopPropagation();
    }
    const data = await loadReportData();
    if (!data) return;

    const { progressData, fileName } = data;
    const questionMap = new Map(progressData.questionMap);
    const items = Array.from(questionMap.values());

    // Sort by wrong count descending
    items.sort((a, b) => b._wrongCount - a._wrongCount);

    // Calculate statistics
    const totalItems = progressData.totalItems || items.length;
    const masteredItems = progressData.masteredItems || items.filter(q => q._mastered).length;
    const totalReviews = items.reduce((sum, q) => sum + q._reviewCount, 0);

    let txtContent = `Review Report - ${fileName}
Generated on ${new Date().toLocaleString()}

SUMMARY:
========
Total Questions: ${totalItems}
Mastered Questions: ${masteredItems}
Total Review Sessions: ${totalReviews}

DETAILED REPORT:
================

`;

    items.forEach((item, index) => {
        txtContent += `${index + 1}. ID: ${item.id}
   Question: ${item.question}
   Answer: ${item.answer || 'N/A'}
   Wrong Count: ${item._wrongCount}
   Correct Count: ${item._correctCount}
   Review Count: ${item._reviewCount}
   Mastered: ${item._mastered ? 'Yes' : 'No'}
   Learning Step: ${item._learningStep}
   Consecutive Correct: ${item._consecutiveCorrect}

${'-'.repeat(60)}

`;
    });

    // Create and download file
    const blob = new Blob([txtContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeFileName = fileName.replace('.json', '');
    a.href = url;
    a.download = `review_report_${safeFileName}_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    hideExportMenu();
}

async function exportCsv(event) {
    if (event) {
        event.stopPropagation();
    }
    const data = await loadReportData();
    if (!data) return;

    const { progressData, fileName } = data;
    const questionMap = new Map(progressData.questionMap);
    const items = Array.from(questionMap.values());

    // Sort by wrong count descending
    items.sort((a, b) => b._wrongCount - a._wrongCount);

    // CSV header
    let csvContent = 'ID,Question,Answer,Wrong Count,Correct Count,Review Count,Mastered,Learning Step,Consecutive Correct\n';

    // CSV rows
    items.forEach(item => {
        csvContent += `${csvEscape(item.id)},${csvEscape(item.question)},${csvEscape(item.answer || '')},${csvEscape(item._wrongCount)},${csvEscape(item._correctCount)},${csvEscape(item._reviewCount)},${csvEscape(item._mastered ? 'Yes' : 'No')},${csvEscape(item._learningStep)},${csvEscape(item._consecutiveCorrect)}\n`;
    });

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeFileName = fileName.replace('.json', '');
    a.href = url;
    a.download = `review_report_${safeFileName}_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    hideExportMenu();
}