# Knowledge Point Mastery Reviewer

## Overview

This Python script, `knowledge_reviewerv1.py`, is a console-based tool designed for efficient, randomized review of knowledge points sourced from local plain text files. It implements an adaptive mastery tracking system (similar to spaced repetition concepts) that determines mastery based on consecutive correct answers, adjusting the requirement if the user has previously struggled with the topic.

## Features

*   **Dynamic Knowledge Base Loading:** Automatically scans and loads `.txt` files from a designated directory (`E:\knowledge_bases`), allowing the user to select the knowledge set for review.
*   **Adaptive Mastery System:** Utilizes a precise mechanism to determine when a topic is truly mastered, distinguishing between initial success and recovery after mistakes (see Mastery Logic below).
*   **Randomized Review Rounds:** Questions are drawn randomly without repetition within each review round (which encompasses all unmastered topics).
*   **Multi-line Answer Support:** The input format allows for detailed, multi-line answers to complex topics.
*   **Real-Time Progress Tracking:** After each response, the script displays the current mastery status and required steps for achieving full mastery.
*   **Mid-Session Exit:** Supports graceful exit, saving the partial progress to a summary report.
*   **Detailed Reporting:** Upon completion or exit, a comprehensive report is generated and saved to the user's desktop, detailing mastered and unmastered topics.

## Mastery Logic

The script uses a specialized counter system (`correct_count` and `incorrect_count`) to track proficiency:

1.  **Initial Mastery (Zero Mistakes):** If the knowledge point has **never** been answered incorrectly (`incorrect_count = 0`), it is considered mastered after **2 consecutive correct answers**.

    $$
    Mastered \iff (IncorrectCount = 0) \land (CorrectCount \ge 2)
    $$

2.  **Recovery Mastery (After Mistakes):** If the knowledge point has been answered incorrectly at least once (`incorrect_count > 0`), the requirement increases. Mastery is achieved only after **3 consecutive correct answers**. An incorrect response resets the `correct_count` to zero.

    $$
    Mastered \iff (IncorrectCount > 0) \land (CorrectCount \ge 3)
    $$

## Setup and Installation

1.  **Download:** Save the provided Python script (`knowledge_reviewerv1.py`) to your local machine.
2.  **Knowledge Base Directory:** The script hardcodes the knowledge base path to: `E:\knowledge_bases`.
    *   **Option A (Recommended):** Create this exact directory path on your system.
    *   **Option B:** Modify the `knowledge_dir` variable inside the `main()` function in the Python script to point to your desired path.
3.  **Create Knowledge Files:** Place your knowledge point files (in the required format, see below) into the `E:\knowledge_bases` directory.
4.  **Run:** Execute the script from your terminal:

```bash
python knowledge_reviewerv1.py
```

## Knowledge Base File Format

The script requires knowledge files to be simple `.txt` files, using specific Chinese markers for the question and answer sections.

*   Each question must start with `题目：` (Question:).
*   The answer must start with `答案：` (Answer:).
*   Answers can span multiple subsequent lines until the next `题目：` marker is encountered.

**Example Format:**

```txt
题目：What is the capital of France?
答案：Paris is the capital.
It is located on the Seine River.

题目：Which protocol is used for secure web browsing?
答案：HTTPS
This uses SSL/TLS encryption.
```

## Usage

1.  **Selection:** Upon running, the script lists all available `.txt` files. Enter the corresponding number to select a topic.
2.  **Review Loop:** The script presents one question at a time.
3.  **Show Answer:** Press **Enter** to reveal the answer after you have attempted to recall it.
4.  **Feedback:** After viewing the answer, provide feedback on your performance:
    *   **A:** Mastered/Correct (Increase correct count).
    *   **B:** Not Mastered/Incorrect (Reset correct count, increase incorrect count).
    *   **X:** Exit the review session.
5.  **Reporting:** When you exit or master all points, a report summarizing your progress and showing the mastery method (2x or 3x consecutive correct) is saved to your desktop (e.g., `C:\Users\User\Desktop\复习报告_file_name_timestamp.txt`).
