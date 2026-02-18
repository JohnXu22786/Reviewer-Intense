"""
Review API routes for Reviewer Intense.

Handles review actions and state management, implementing the
"algorithm logic in Python" architecture requirement.
"""

import os
import json
from flask import Blueprint, request, jsonify, current_app, session
from ..algorithms.spaced_repetition import SpacedRepetitionEngine

# Create review blueprint
review_bp = Blueprint('review', __name__, url_prefix='/api')

# No state manager needed for one-time program


def get_review_engine(knowledge_file: str) -> SpacedRepetitionEngine:
    """
    Create new review engine for knowledge file (one-time program).

    Always creates a fresh engine instance as this is a one-time program
    with no state persistence. Items are cached in session to avoid repeated file reads.
    """
    items_key = f'review_items_{knowledge_file}'

    # Load knowledge base items (cache in session)
    if items_key not in session:
        knowledge_dir = current_app.config.get('KNOWLEDGE_DIR', 'D:\\knowledge_bases')
        json_path = os.path.join(knowledge_dir, knowledge_file)

        if not os.path.exists(json_path):
            raise FileNotFoundError(f"Knowledge base file not found: {json_path}")

        with open(json_path, 'r', encoding='utf-8') as f:
            raw_data = json.load(f)

        if not isinstance(raw_data, list):
            raise TypeError("JSON format error: Root element must be a list.")

        items = []
        for item in raw_data:
            question = item.get('question', '').strip()
            answer = item.get('answer', '').strip()

            if not question or not answer:
                continue

            item_id = item.get('id')
            if not item_id:
                # This should not happen as IDs are generated on load
                continue

            items.append({
                'id': item_id,
                'question': question,
                'answer': answer
            })

        # Cache items in session
        session[items_key] = items
    else:
        items = session[items_key]

    # Create fresh engine instance (no saved state for one-time program)
    engine = SpacedRepetitionEngine()
    engine.initialize_from_items(items)

    return engine


@review_bp.route('/review/state', methods=['GET'])
def get_review_state():
    """Get current review state."""
    try:
        knowledge_file = request.args.get('file')
        if not knowledge_file:
            return jsonify({"error": "File parameter required"}), 400

        engine = get_review_engine(knowledge_file)

        # Get next item
        next_item_id = engine.get_next_item()
        next_item = None

        if next_item_id:
            # Get item details from knowledge base
            knowledge_dir = current_app.config.get('KNOWLEDGE_DIR', 'D:\\knowledge_bases')
            json_path = os.path.join(knowledge_dir, knowledge_file)

            with open(json_path, 'r', encoding='utf-8') as f:
                items = json.load(f)

            for item in items:
                if item.get('id') == next_item_id:
                    next_item = {
                        'id': item['id'],
                        'question': item['question'],
                        'answer': item['answer']
                    }
                    break

        progress = engine.get_progress()

        return jsonify({
            "success": True,
            "next_item": next_item,
            "progress": progress,
            "remaining_items": len(engine.dynamic_sequence),
            "total_mastered": engine.mastered_items_count,
            "total_items": engine.total_items_count
        })

    except Exception as e:
        error_msg = f"Failed to get review state: {type(e).__name__}: {str(e)}"
        print(f"API Error in get_review_state: {repr(error_msg)}")
        return jsonify({"error": error_msg}), 500


@review_bp.route('/review/action', methods=['POST'])
def handle_review_action():
    """Handle a review action (recognized or forgotten)."""
    try:
        data = request.get_json()
        knowledge_file = data.get('file')
        item_id = data.get('item_id')
        action = data.get('action')  # 'recognized' or 'forgotten'

        if not knowledge_file:
            return jsonify({"error": "File parameter required"}), 400
        if not item_id:
            return jsonify({"error": "Item ID required"}), 400
        if action not in ['recognized', 'forgotten']:
            return jsonify({"error": "Action must be 'recognized' or 'forgotten'"}), 400

        engine = get_review_engine(knowledge_file)

        # Handle the action
        result = engine.handle_review_action(item_id, action)

        # No state saving for one-time program

        # Get next item details
        next_item = None
        if result['next_item_id']:
            knowledge_dir = current_app.config.get('KNOWLEDGE_DIR', 'D:\\knowledge_bases')
            json_path = os.path.join(knowledge_dir, knowledge_file)

            with open(json_path, 'r', encoding='utf-8') as f:
                items = json.load(f)

            for item in items:
                if item.get('id') == result['next_item_id']:
                    next_item = {
                        'id': item['id'],
                        'question': item['question'],
                        'answer': item['answer']
                    }
                    break

        # Calculate statistics
        remaining_items = len(engine.dynamic_sequence)
        total_mastered = engine.mastered_items_count
        total_items = len(engine.item_states)
        sequence_updated = result['next_review_position'] is not None

        return jsonify({
            "success": True,
            "next_item": next_item,
            "updated_state": {
                "review_count": result['updated_state'].review_count,
                "learning_step": result['updated_state'].learning_step,
                "mastered": result['updated_state'].mastered,
                "consecutive_correct": result['updated_state'].consecutive_correct,
                "wrong_count": result['updated_state'].wrong_count,
                "correct_count": result['updated_state'].correct_count
            },
            "mastered": result['updated_state'].mastered,
            "remaining_items": remaining_items,
            "total_mastered": total_mastered,
            "total_items": total_items,
            "sequence_updated": sequence_updated,
            "progress": engine.get_progress()
        })

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        error_msg = f"Failed to handle review action: {type(e).__name__}: {str(e)}"
        print(f"API Error in handle_review_action: {repr(error_msg)}")
        return jsonify({"error": error_msg}), 500


@review_bp.route('/review/reset', methods=['POST'])
def reset_review_state():
    """Reset review session for a knowledge base file (one-time program)."""
    try:
        data = request.get_json()
        knowledge_file = data.get('file')

        if not knowledge_file:
            return jsonify({"error": "File parameter required"}), 400

        # Clear session cache for this knowledge file
        items_key = f'review_items_{knowledge_file}'

        if items_key in session:
            del session[items_key]

        return jsonify({
            "success": True,
            "message": f"Session reset for {knowledge_file}. Next load will start fresh."
        })

    except Exception as e:
        error_msg = f"Failed to reset review session: {type(e).__name__}: {str(e)}"
        print(f"API Error in reset_review_state: {repr(error_msg)}")
        return jsonify({"error": error_msg}), 500


# Migration endpoint removed - one-time program doesn't support state migration


@review_bp.route('/review/export-data', methods=['GET'])
def get_export_data():
    """Get review data for export (matches original localStorage format)."""
    try:
        knowledge_file = request.args.get('file')
        if not knowledge_file:
            return jsonify({"error": "File parameter required"}), 400

        engine = get_review_engine(knowledge_file)

        # Load knowledge base to get question and answer text
        knowledge_dir = current_app.config.get('KNOWLEDGE_DIR', 'D:\\knowledge_bases')
        json_path = os.path.join(knowledge_dir, knowledge_file)

        with open(json_path, 'r', encoding='utf-8') as f:
            kb_items = json.load(f)

        # Create question map like original localStorage format
        question_map = []
        for item_id, state in engine.item_states.items():
            # Find question and answer from knowledge base
            kb_item = next((item for item in kb_items if item.get('id') == item_id), None)
            question = kb_item.get('question', '') if kb_item else ''
            answer = kb_item.get('answer', '') if kb_item else ''

            # Create item data matching original format
            item_data = {
                'id': item_id,
                'question': question,
                'answer': answer,
                '_reviewCount': state.review_count,
                '_consecutiveCorrect': state.consecutive_correct,
                '_learningStep': state.learning_step,
                '_mastered': state.mastered,
                '_wrongCount': state.wrong_count,
                '_correctCount': state.correct_count
            }
            question_map.append([item_id, item_data])

        # Calculate total items (from knowledge base, not just engine)
        total_items = len(kb_items)

        # Calculate mastered items count
        mastered_items = engine.mastered_items_count

        # Get dynamic sequence (only non-mastered items)
        dynamic_sequence = engine.dynamic_sequence.copy()

        return jsonify({
            "success": True,
            "data": {
                "questionMap": question_map,
                "masteredItems": mastered_items,
                "totalItems": total_items,
                "dynamicSequence": dynamic_sequence
            }
        })

    except Exception as e:
        error_msg = f"Failed to get export data: {type(e).__name__}: {str(e)}"
        print(f"API Error in get_export_data: {repr(error_msg)}")
        return jsonify({"error": error_msg}), 500