"""
API routes for Reviewer Intense application.
"""

import os
import hashlib
import json
from flask import Blueprint, request, jsonify, current_app

# Create API blueprint
api_bp = Blueprint('api', __name__, url_prefix='/api')


def generate_content_hash(question, answer):
    """Generates a hash based on Q/A content, used for initial ID generation."""
    q = question.strip().replace('\r\n', '\n').replace('\r', '\n')
    a = answer.strip().replace('\r\n', '\n').replace('\r', '\n')
    content = f"{q}|{a}"
    return hashlib.md5(content.encode('utf-8')).hexdigest()[:8]


@api_bp.route('/files', methods=['GET'])
def list_files():
    """List all available JSON knowledge base files"""
    # Get KNOWLEDGE_DIR from app config
    KNOWLEDGE_DIR = current_app.config.get('KNOWLEDGE_DIR', 'D:\\knowledge_bases')

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


@api_bp.route('/load', methods=['POST'])
def load_data():
    """Load specified knowledge base file"""
    try:
        # Get KNOWLEDGE_DIR from app config
        KNOWLEDGE_DIR = current_app.config.get('KNOWLEDGE_DIR', 'D:\\knowledge_bases')

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