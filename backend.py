import os
import hashlib
import json
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

# 1. Load config
def load_config():
    config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config.json')
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        print("⚠️ config.json not found. Using default paths.")
        return {"KNOWLEDGE_DIR": "D:\\knowledge_bases"}

config = load_config()
KNOWLEDGE_DIR = config['KNOWLEDGE_DIR']

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = BASE_DIR

def generate_content_hash(question, answer):
    """Generates a hash based on Q/A content, used for initial ID generation."""
    q = question.strip().replace('\r\n', '\n').replace('\r', '\n')
    a = answer.strip().replace('\r\n', '\n').replace('\r', '\n')
    content = f"{q}|{a}"
    return hashlib.md5(content.encode('utf-8')).hexdigest()[:8]

@app.route('/api/files', methods=['GET'])
def list_files():
    """列出所有可用的JSON知识库文件"""
    if not os.path.exists(KNOWLEDGE_DIR):
        os.makedirs(KNOWLEDGE_DIR)
        print(f"📁 Creating directory: {KNOWLEDGE_DIR}")

    files = [f for f in os.listdir(KNOWLEDGE_DIR) if f.endswith('.json')]
    print(f"📄 Scanned {len(files)} JSON files: {files}")

    # 不再检查是否有待复习的题目，因为每次都从零开始
    file_list = []
    for f in files:
        file_list.append({
            'name': f,
            'has_due_today': True  # 始终显示为有待复习
        })

    return jsonify({"files": file_list})

@app.route('/api/load', methods=['POST'])
def load_data():
    """加载指定的知识库文件"""
    try:
        file_name = request.json['file_name']
        json_path = os.path.join(KNOWLEDGE_DIR, file_name)
    
        print(f"📖 Attempting to load file: {file_name}")
    
        if not os.path.exists(json_path):
             return jsonify({"error": f"Knowledge base file not found: {json_path}"}), 404
           
        # 读取JSON文件
        with open(json_path, 'r', encoding='utf-8') as f:
            raw_data = json.load(f)
        
        if not isinstance(raw_data, list):
            raise TypeError(f"JSON format error: Root element must be a list.")
        
        # 处理数据，确保每个题目都有ID
        items = []
        for item in raw_data:
            question = item.get('question', '').strip()
            answer = item.get('answer', '').strip()
          
            if not question or not answer:
                continue
            
            # 生成或使用已有的ID
            existing_id = item.get('id')
            if existing_id:
                stable_id = existing_id
            else:
                stable_id = generate_content_hash(question, answer)
            
            items.append({
                'id': stable_id,
                'question': question,
                'answer': answer
            })
        
        print(f"   📊 Loaded {len(items)} items from {file_name}.")
        return jsonify({"items": items, "total": len(items)})

    except Exception as e:
        error_msg = f"Server failed to process request. File: {request.json.get('file_name', 'N/A')}. Details: {type(e).__name__}: {str(e)}"
        print(f"Server Error in load_data: {error_msg}")
        return jsonify({"error": error_msg}), 500

# Serve static frontend files
@app.route('/')
def serve_index():
    return send_from_directory(FRONTEND_DIR, 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory(FRONTEND_DIR, filename)

if __name__ == '__main__':
    print(f"🚀 Starting Flask Server (v4.0.0-Intense)..." )
    print(f"📚 Knowledge Base Directory: {KNOWLEDGE_DIR}")
    print("📡 Listening at: http://0.0.0.0:1200")
    print("💡 Please visit: http://localhost:1200")
    app.run(host='0.0.0.0', port=1200, debug=True)
