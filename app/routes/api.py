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


@api_bp.route('/update-item', methods=['POST'])
def update_item():
    """Update a specific item in a knowledge base file"""
    try:
        # Get KNOWLEDGE_DIR from app config
        KNOWLEDGE_DIR = current_app.config.get('KNOWLEDGE_DIR', 'D:\\knowledge_bases')

        file_name = request.json['file_name']
        item_id = request.json['item_id']
        new_question = request.json['new_question'].strip()
        new_answer = request.json['new_answer'].strip()

        if not new_question or not new_answer:
            return jsonify({"success": False, "error": "Question and answer cannot be empty"}), 400

        json_path = os.path.join(KNOWLEDGE_DIR, file_name)

        if not os.path.exists(json_path):
            return jsonify({"success": False, "error": f"Knowledge base file not found: {json_path}"}), 404

        # 读取JSON文件
        with open(json_path, 'r', encoding='utf-8') as f:
            raw_data = json.load(f)

        if not isinstance(raw_data, list):
            return jsonify({"success": False, "error": "JSON format error: Root element must be a list."}), 400

        # 查找并更新项目
        item_found = False

        for item in raw_data:
            # 通过ID匹配，或通过内容哈希匹配（如果原始项目没有ID）
            existing_id = item.get('id')
            if existing_id == item_id:
                # 更新项目，但保持原来的ID
                item['question'] = new_question
                item['answer'] = new_answer
                item_found = True
                break
            elif not existing_id and generate_content_hash(item.get('question', ''), item.get('answer', '')) == item_id:
                # 原始项目没有ID，但内容哈希匹配
                item['question'] = new_question
                item['answer'] = new_answer
                item['id'] = item_id  # 使用原来的ID
                item_found = True
                break

        if not item_found:
            return jsonify({"success": False, "error": f"Item with ID {item_id} not found"}), 404

        # 写回文件
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(raw_data, f, ensure_ascii=False, indent=2)

        print(f"✅ Updated item in {file_name}: {item_id}")
        return jsonify({"success": True, "new_id": item_id})  # 返回原来的ID

    except Exception as e:
        error_msg = f"Server failed to update item. File: {request.json.get('file_name', 'N/A')}. Details: {type(e).__name__}: {str(e)}"
        print(f"Server Error in update_item: {error_msg}")
        return jsonify({"success": False, "error": error_msg}), 500


@api_bp.route('/create', methods=['POST'])
def create_knowledge_base():
    """Create a new empty knowledge base file"""
    try:
        # Get KNOWLEDGE_DIR from app config
        KNOWLEDGE_DIR = current_app.config.get('KNOWLEDGE_DIR', 'D:\\knowledge_bases')

        file_name = request.json['file_name']
        # Ensure .json extension
        if not file_name.endswith('.json'):
            file_name += '.json'

        # Validate filename
        import re
        if not re.match(r'^[a-zA-Z0-9_\-\.]+$', file_name):
            return jsonify({"success": False, "error": "Invalid filename. Only letters, numbers, hyphens, underscores, and dots allowed."}), 400

        json_path = os.path.join(KNOWLEDGE_DIR, file_name)

        # Check if file already exists
        if os.path.exists(json_path):
            return jsonify({"success": False, "error": f"File already exists: {file_name}"}), 400

        # Ensure directory exists
        os.makedirs(KNOWLEDGE_DIR, exist_ok=True)

        # Create empty JSON array
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump([], f, ensure_ascii=False, indent=2)

        print(f"✅ Created new knowledge base: {file_name}")
        return jsonify({"success": True, "file_name": file_name})

    except Exception as e:
        error_msg = f"Server failed to create knowledge base. File: {request.json.get('file_name', 'N/A')}. Details: {type(e).__name__}: {str(e)}"
        print(f"Server Error in create_knowledge_base: {error_msg}")
        return jsonify({"success": False, "error": error_msg}), 500


@api_bp.route('/save-all', methods=['POST'])
def save_all_items():
    """Save all items to a knowledge base file (overwrites existing)"""
    try:
        # Get KNOWLEDGE_DIR from app config
        KNOWLEDGE_DIR = current_app.config.get('KNOWLEDGE_DIR', 'D:\\knowledge_bases')

        file_name = request.json['file_name']
        items = request.json['items']

        if not isinstance(items, list):
            return jsonify({"success": False, "error": "Items must be a list."}), 400

        json_path = os.path.join(KNOWLEDGE_DIR, file_name)

        # Ensure directory exists
        os.makedirs(KNOWLEDGE_DIR, exist_ok=True)

        # Process items, preserving existing IDs if they exist
        processed_items = []
        for item in items:
            question = item.get('question', '').strip()
            answer = item.get('answer', '').strip()

            if not question or not answer:
                continue  # Skip empty items

            # Use existing ID if present, otherwise generate based on content
            existing_id = item.get('id')
            if existing_id:
                item_id = existing_id
            else:
                item_id = generate_content_hash(question, answer)
            processed_items.append({
                'id': item_id,
                'question': question,
                'answer': answer
            })

        # Write to file
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(processed_items, f, ensure_ascii=False, indent=2)

        print(f"✅ Saved {len(processed_items)} items to {file_name}")
        return jsonify({"success": True, "count": len(processed_items)})

    except Exception as e:
        error_msg = f"Server failed to save items. File: {request.json.get('file_name', 'N/A')}. Details: {type(e).__name__}: {str(e)}"
        print(f"Server Error in save_all_items: {error_msg}")
        return jsonify({"success": False, "error": error_msg}), 500