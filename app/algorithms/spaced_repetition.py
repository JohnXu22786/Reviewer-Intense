"""
Spaced Repetition Algorithm Module for Reviewer Intense

This module implements the spaced repetition algorithm originally in JavaScript,
providing a Python backend for the review logic.

The algorithm maintains a learning state machine for each item:
- Learning step: 0=initial, 1=after first forgotten, 2=after first recognized, 3=mastered
- Spaced repetition intervals: 8-12 positions for review, 15-20 positions for longer intervals
- Dynamic sequence management for review scheduling

This implementation is designed to be EXACTLY equivalent to the JavaScript version
in app/static/js/script.js, specifically the handleAction function (lines 407-474).
"""

import random
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field
import json
import os


class LearningStep:
    """Learning step state machine constants (matches JavaScript)."""
    INITIAL = 0              # 初始状态，尚未复习
    AFTER_FIRST_FORGOTTEN = 1  # 第一次不记得后
    AFTER_FIRST_RECOGNIZED = 2  # 第一次记得后（在不记得之后）
    MASTERED = 3             # 已掌握


@dataclass
class ItemState:
    """State tracking for a single review item (matches JavaScript fields)."""
    item_id: str
    review_count: int = 0                     # _reviewCount
    consecutive_correct: int = 0              # _consecutiveCorrect
    learning_step: int = LearningStep.INITIAL  # _learningStep: 0=初始，1=第一次不记得后，2=第一次记得后，3=掌握
    mastered: bool = False                    # _mastered
    wrong_count: int = 0                      # _wrongCount
    correct_count: int = 0                    # _correctCount

    def to_dict(self) -> Dict[str, Any]:
        """Convert state to dictionary for serialization."""
        return {
            'item_id': self.item_id,
            'review_count': self.review_count,
            'consecutive_correct': self.consecutive_correct,
            'learning_step': self.learning_step,
            'mastered': self.mastered,
            'wrong_count': self.wrong_count,
            'correct_count': self.correct_count
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ItemState':
        """Create ItemState from dictionary."""
        return cls(
            item_id=data['item_id'],
            review_count=data.get('review_count', 0),
            consecutive_correct=data.get('consecutive_correct', 0),
            learning_step=data.get('learning_step', LearningStep.INITIAL),
            mastered=data.get('mastered', False),
            wrong_count=data.get('wrong_count', 0),
            correct_count=data.get('correct_count', 0)
        )


class SpacedRepetitionEngine:
    """
    Spaced repetition engine implementing the EXACT algorithm from JavaScript.

    This class manages the review state for all items and handles the
    spaced repetition algorithm logic identically to the JavaScript version.
    """

    def __init__(self):
        """Initialize the spaced repetition engine (matches JavaScript initialization)."""
        self.item_states: Dict[str, ItemState] = {}  # Maps ID -> ItemState (questionMap in JS)
        self.dynamic_sequence: List[str] = []        # Dynamic sequence of item IDs
        self.mastered_items_count: int = 0           # Count of mastered items
        self.total_items_count: int = 0              # Total number of items

    def _get_random_interval(self) -> int:
        """Generate random interval between 8-12 (inclusive). Matches JavaScript getRandomInterval()."""
        return random.randint(8, 12)  # Math.floor(Math.random() * 5) + 8

    def _get_long_random_interval(self) -> int:
        """Generate longer random interval between 15-20 (inclusive). Matches JavaScript getLongRandomInterval()."""
        return random.randint(15, 20)  # Math.floor(Math.random() * 6) + 15

    def initialize_from_items(self, items: List[Dict[str, Any]], saved_states: Optional[Dict[str, Any]] = None) -> None:
        """
        Initialize the engine with items from a knowledge base file.
        Matches the logic in JavaScript loadLibrary function (lines 75-157).

        Args:
            items: List of items from knowledge base file, each with 'id', 'question', 'answer'
            saved_states: Optional saved progress data (like from localStorage)
        """
        # Clear existing data
        self.item_states.clear()
        self.dynamic_sequence.clear()
        self.mastered_items_count = 0

        # Convert saved_states to map if provided
        saved_map = {}
        if saved_states:
            if 'questionMap' in saved_states:
                # Convert array of [key, value] pairs back to dict
                for item_id, state_data in saved_states['questionMap']:
                    saved_map[item_id] = state_data
            # Use saved mastered items count if available (preserve original behavior)
            if 'masteredItems' in saved_states:
                self.mastered_items_count = saved_states['masteredItems']

        # Initialize question map and dynamic sequence (matches JS lines 110-130)
        for item in items:
            item_id = item['id']

            # Check for saved state
            saved_state = saved_map.get(item_id) if saved_map else None

            # Create question object with saved state or defaults
            question_obj = ItemState(
                item_id=item_id,
                review_count=saved_state.get('_reviewCount', 0) if saved_state else 0,
                consecutive_correct=saved_state.get('_consecutiveCorrect', 0) if saved_state else 0,
                learning_step=saved_state.get('_learningStep', LearningStep.INITIAL) if saved_state else LearningStep.INITIAL,
                mastered=saved_state.get('_mastered', False) if saved_state else False,
                wrong_count=saved_state.get('_wrongCount', 0) if saved_state else 0,
                correct_count=saved_state.get('_correctCount', 0) if saved_state else 0
            )

            self.item_states[item_id] = question_obj
            # Only add non-mastered items to the dynamic sequence
            if not question_obj.mastered:
                self.dynamic_sequence.append(item_id)

        self.total_items_count = len(items)

        # Count mastered items (only if not already set from saved_states)
        if not (saved_states and 'masteredItems' in saved_states):
            self.mastered_items_count = sum(1 for state in self.item_states.values()
                                           if state.mastered)

        # Handle saved dynamic sequence if available (matches JS lines 136-147)
        if saved_states and 'dynamicSequence' in saved_states:
            saved_seq = [item_id for item_id in saved_states['dynamicSequence']
                        if item_id in self.item_states]
            if saved_seq:
                self.dynamic_sequence = saved_seq
            else:
                # Randomize initial sequence
                random.shuffle(self.dynamic_sequence)
        else:
            # Randomize initial sequence
            random.shuffle(self.dynamic_sequence)

    def handle_review_action(self, item_id: str, action: str) -> Dict[str, Any]:
        """
        Handle a review action for an item. EXACTLY matches JavaScript handleAction function.

        Args:
            item_id: ID of the item being reviewed
            action: 'recognized' or 'forgotten'

        Returns:
            Dictionary containing:
                - updated_state: The updated ItemState
                - next_review_position: Position where item was reinserted (if applicable)
                - action_processed: Description of the action taken
                - next_item_id: Next item to review (from dynamic sequence)
        """
        if item_id not in self.item_states:
            raise ValueError(f"Item {item_id} not found in engine")

        state = self.item_states[item_id]

        # Remove item from current position in sequence (matches JS line 413: dynamicSequence.shift())
        if self.dynamic_sequence and self.dynamic_sequence[0] == item_id:
            self.dynamic_sequence.pop(0)
        elif item_id in self.dynamic_sequence:
            # Fallback: remove the item if it's not at position 0
            self.dynamic_sequence.remove(item_id)

        # Increment review count (matches JS line 416)
        state.review_count += 1

        result = {
            'updated_state': state,
            'next_review_position': None,
            'action_processed': '',
            'next_item_id': self.dynamic_sequence[0] if self.dynamic_sequence else None
        }

        if action == 'recognized':
            # User recognized the item
            state.consecutive_correct += 1
            state.correct_count += 1

            # Case 1: First review and correct (first-time recognition)
            # S0 -> M: counter +1
            if state.review_count == 1:
                state.mastered = True
                state.learning_step = LearningStep.MASTERED
                self.mastered_items_count += 1
                result['action_processed'] = 'first_time_recognition_mastered'

            # Case 2: In step 1 (after first forgotten)
            elif state.learning_step == LearningStep.AFTER_FIRST_FORGOTTEN:
                state.learning_step = LearningStep.AFTER_FIRST_RECOGNIZED
                insert_index = self._get_long_random_interval()
                actual_index = min(insert_index, len(self.dynamic_sequence))
                self.dynamic_sequence.insert(actual_index, item_id)
                result['next_review_position'] = actual_index
                result['action_processed'] = 'recognized_after_forgotten'
                result['next_item_id'] = self.dynamic_sequence[0] if self.dynamic_sequence else None

            # Case 3: In step 2 (after first recognized following forgotten)
            # S2 -> M: counter +1
            elif state.learning_step == LearningStep.AFTER_FIRST_RECOGNIZED:
                state.mastered = True
                state.learning_step = LearningStep.MASTERED
                self.mastered_items_count += 1
                result['action_processed'] = 'second_recognition_mastered'

            # Case 4: Already mastered item being reviewed again
            elif state.learning_step == LearningStep.MASTERED:
                # Mastered item recognized - no action needed for one-time program
                # Item remains mastered and is not reinserted into sequence
                result['action_processed'] = 'mastered_item_no_action'
                # No change to mastered status, count, or sequence

            # Other cases (should not happen)
            else:
                result['action_processed'] = 'unexpected_state'

        elif action == 'forgotten':
            # User forgot the item
            state.wrong_count += 1
            state.consecutive_correct = 0

            # Don't decrease counter when item is forgotten (counter only increases)
            state.mastered = False

            # Reset to step 1 regardless of current step (matches JS line 459)
            state.learning_step = LearningStep.AFTER_FIRST_FORGOTTEN

            # Calculate insertion position: 8-12 positions later (matches JS lines 462-464)
            insert_index = self._get_random_interval()
            actual_index = min(insert_index, len(self.dynamic_sequence))
            self.dynamic_sequence.insert(actual_index, item_id)
            result['next_review_position'] = actual_index
            result['action_processed'] = 'forgotten_reset_to_step1'
            result['next_item_id'] = self.dynamic_sequence[0] if self.dynamic_sequence else None

        else:
            raise ValueError(f"Invalid action: {action}. Must be 'recognized' or 'forgotten'")

        return result

    def get_next_item(self) -> Optional[str]:
        """
        Get the next item ID from the dynamic sequence.

        Returns:
            Item ID of the next item to review, or None if sequence is empty
        """
        return self.dynamic_sequence[0] if self.dynamic_sequence else None

    def update_review_state(self, item_id: str, new_state: Dict[str, Any]) -> None:
        """
        Update the review state for an item.

        Args:
            item_id: ID of the item to update
            new_state: Dictionary containing new state values
        """
        if item_id not in self.item_states:
            self.item_states[item_id] = ItemState(item_id=item_id)

        state = self.item_states[item_id]

        # Save old mastered state before updating fields
        old_mastered = state.mastered if 'mastered' in new_state else None

        # Update fields from new_state
        for key, value in new_state.items():
            if hasattr(state, key):
                setattr(state, key, value)

        # Update mastered items count if mastered status changed
        if old_mastered is not None:
            new_mastered = state.mastered  # Get the updated value

            if new_mastered and not old_mastered:
                # Item became mastered - increase counter
                self.mastered_items_count += 1
            # Note: when item becomes unmastered (forgotten), don't decrease counter

    def get_item_state(self, item_id: str) -> Optional[ItemState]:
        """
        Get the current state for an item.

        Args:
            item_id: ID of the item

        Returns:
            ItemState object if found, None otherwise
        """
        return self.item_states.get(item_id)

    def get_sequence_stats(self) -> Dict[str, Any]:
        """
        Get statistics about the current review sequence.

        Returns:
            Dictionary with sequence statistics
        """
        return {
            'sequence_length': len(self.dynamic_sequence),
            'mastered_items': self.mastered_items_count,
            'total_items': self.total_items_count,
            'remaining_items': len(self.dynamic_sequence),
            'mastered_percentage': (self.mastered_items_count / self.total_items_count * 100)
                if self.total_items_count > 0 else 0
        }

    def to_serializable(self) -> Dict[str, Any]:
        """
        Convert engine state to serializable dictionary.

        Returns:
            Dictionary containing all engine state for serialization
        """
        return {
            'item_states': {item_id: state.to_dict() for item_id, state in self.item_states.items()},
            'dynamic_sequence': self.dynamic_sequence.copy(),
            'mastered_items_count': self.mastered_items_count,
            'total_items_count': self.total_items_count
        }

    @classmethod
    def from_serializable(cls, data: Dict[str, Any]) -> 'SpacedRepetitionEngine':
        """
        Create engine from serialized data.

        Args:
            data: Serialized engine data

        Returns:
            New SpacedRepetitionEngine instance
        """
        engine = cls()
        engine.dynamic_sequence = data.get('dynamic_sequence', [])
        engine.mastered_items_count = data.get('mastered_items_count', 0)
        engine.total_items_count = data.get('total_items_count', 0)

        # Load item states
        item_states_data = data.get('item_states', {})
        for item_id, state_data in item_states_data.items():
            engine.item_states[item_id] = ItemState.from_dict(state_data)

        return engine

    # Convenience methods for backward compatibility
    def save_state(self, file_path: str) -> None:
        """Save engine state to JSON file."""
        state_data = self.to_serializable()
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(state_data, f, ensure_ascii=False, indent=2)

    def load_state(self, file_path: str) -> bool:
        """Load engine state from JSON file."""
        if not os.path.exists(file_path):
            return False

        with open(file_path, 'r', encoding='utf-8') as f:
            state_data = json.load(f)

        loaded_engine = self.from_serializable(state_data)
        self.item_states = loaded_engine.item_states
        self.dynamic_sequence = loaded_engine.dynamic_sequence
        self.mastered_items_count = loaded_engine.mastered_items_count
        self.total_items_count = loaded_engine.total_items_count

        return True


    def get_progress(self) -> dict:
        """Get progress statistics."""
        total_items = len(self.item_states)
        mastered_items = self.mastered_items_count
        remaining_items = len(self.dynamic_sequence)
        completion_percentage = (mastered_items / total_items * 100) if total_items > 0 else 0

        return {
            'total_items': total_items,
            'mastered_items': mastered_items,
            'remaining_items': remaining_items,
            'completion_percentage': completion_percentage
        }

    def merge_with_file_data(self, file_items: list) -> tuple:
        """
        Merge engine state with current file data.

        Args:
            file_items: List of items from knowledge base file, each with 'id', 'question', 'answer'

        Returns:
            tuple: (new_items, removed_items_count)
                - new_items: List of IDs of newly added items
                - removed_items_count: Number of items removed (no longer in file)
        """
        file_item_ids = {item['id'] for item in file_items}
        current_item_ids = set(self.item_states.keys())

        # Add new items
        new_items = []
        for item in file_items:
            item_id = item['id']
            if item_id not in self.item_states:
                # Create new state for this item
                self.item_states[item_id] = ItemState(item_id=item_id)
                new_items.append(item_id)

                # Add to dynamic sequence if not mastered (new items are not mastered)
                self.dynamic_sequence.append(item_id)

        # Remove items no longer in file
        removed_items = current_item_ids - file_item_ids
        removed_count = 0
        for item_id in removed_items:
            if item_id in self.item_states:
                # Remove from item states
                state = self.item_states[item_id]
                # Decrease counter if item was mastered
                if state.mastered and self.mastered_items_count > 0:
                    self.mastered_items_count -= 1
                del self.item_states[item_id]
                removed_count += 1

            # Remove from dynamic sequence
            if item_id in self.dynamic_sequence:
                self.dynamic_sequence.remove(item_id)

        # Update total items count
        self.total_items_count = len(self.item_states)

        return new_items, removed_count

    def initialize_sequence(self, item_ids: list, shuffle: bool = True) -> None:
        """
        Initialize dynamic sequence with item IDs.

        Args:
            item_ids: List of item IDs to include in sequence
            shuffle: Whether to shuffle the sequence
        """
        # Filter out mastered items
        sequence_ids = []
        for item_id in item_ids:
            if item_id in self.item_states:
                state = self.item_states[item_id]
                if not state.mastered:
                    sequence_ids.append(item_id)
            else:
                # Item not in states, create new state and add to sequence
                self.item_states[item_id] = ItemState(item_id=item_id)
                sequence_ids.append(item_id)

        self.dynamic_sequence = sequence_ids
        if shuffle:
            import random
            random.shuffle(self.dynamic_sequence)


