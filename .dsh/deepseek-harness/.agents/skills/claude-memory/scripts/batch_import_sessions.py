#!/usr/bin/env python
"""
批量导入 Claude Code 会话记录到长期记忆
"""
import sys
import os
import json
from datetime import datetime

# 添加 backend 目录到 Python 路径
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(script_dir))))
backend_path = os.path.join(project_root, 'backend')
sys.path.insert(0, backend_path)

# 加载 .env 文件
from dotenv import load_dotenv
env_path = os.path.join(backend_path, '.env')
load_dotenv(env_path)

# 会话目录
SESSIONS_DIR = r"C:\Users\Administrator\.claude\projects\E--mywroks-project-ai-digital-human-system"


def extract_session_summary(jsonl_path: str, max_messages: int = 10) -> dict:
    """从会话文件提取摘要信息"""
    messages = []
    user_messages = []
    assistant_actions = []

    try:
        with open(jsonl_path, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    try:
                        data = json.loads(line)
                        messages.append(data)

                        # 提取用户消息
                        if data.get('type') == 'human':
                            content = data.get('message', {}).get('content', '')
                            if isinstance(content, str) and content.strip():
                                user_messages.append(content[:200])

                        # 提取助手操作摘要
                        if data.get('type') == 'assistant':
                            msg = data.get('message', {})
                            if msg.get('content'):
                                for item in msg.get('content', []):
                                    if isinstance(item, dict):
                                        if item.get('type') == 'text':
                                            text = item.get('text', '')[:150]
                                            if text:
                                                assistant_actions.append(text)
                                        elif item.get('type') == 'tool_use':
                                            tool_name = item.get('name', '')
                                            assistant_actions.append(f"[工具: {tool_name}]")
                    except json.JSONDecodeError:
                        continue
    except Exception as e:
        return {"error": str(e)}

    return {
        "total_messages": len(messages),
        "user_messages": user_messages[:5],  # 取前5条用户消息
        "assistant_summary": assistant_actions[:5],  # 取前5个助手操作
    }


def save_session_to_memory(session_info: dict, session_data: dict):
    """保存会话到长期记忆"""
    from app.services.memory_service import get_memory_service
    import platform
    import getpass

    machine_id = f"{platform.node()}_{getpass.getuser()}"
    memory = get_memory_service()

    # 构建会话摘要
    session_id = session_info.get('sessionId', 'unknown')
    first_prompt = session_info.get('firstPrompt', '')[:100]
    created = session_info.get('created', '')
    modified = session_info.get('modified', '')
    message_count = session_info.get('messageCount', 0)

    # 用户消息摘要
    user_msgs = session_data.get('user_messages', [])
    user_summary = '; '.join(user_msgs[:3]) if user_msgs else first_prompt

    # 构建内容
    content = f"会话摘要 [{session_id[:8]}]: {user_summary}"
    if len(content) > 500:
        content = content[:500] + "..."

    # 元数据
    metadata = {
        "source": "session-import",
        "session_id": session_id,
        "created": created,
        "modified": modified,
        "message_count": message_count,
        "timestamp": datetime.now().isoformat(),
        "tag": "会话记录"
    }

    # 保存
    doc_id = memory.store_memory(
        content=content,
        metadata=metadata,
        user_id=machine_id
    )

    return doc_id


def main():
    print("=" * 60)
    print("批量导入 Claude Code 会话到长期记忆")
    print("=" * 60)

    # 读取会话索引
    index_path = os.path.join(SESSIONS_DIR, "sessions-index.json")
    if not os.path.exists(index_path):
        print(f"未找到会话索引文件: {index_path}")
        return

    with open(index_path, 'r', encoding='utf-8') as f:
        index_data = json.load(f)

    entries = index_data.get('entries', [])
    print(f"找到 {len(entries)} 个会话记录\n")

    saved_count = 0
    error_count = 0

    for i, entry in enumerate(entries, 1):
        session_id = entry.get('sessionId', 'unknown')
        jsonl_path = entry.get('fullPath', '')
        first_prompt = entry.get('firstPrompt', '')[:50]

        print(f"[{i}/{len(entries)}] 处理会话: {session_id[:8]}...")
        print(f"    首条消息: {first_prompt}...")

        if not os.path.exists(jsonl_path):
            print(f"    跳过: 文件不存在")
            continue

        try:
            # 提取会话摘要
            session_data = extract_session_summary(jsonl_path)

            if session_data.get('error'):
                print(f"    错误: {session_data['error']}")
                error_count += 1
                continue

            # 保存到记忆
            doc_id = save_session_to_memory(entry, session_data)
            print(f"    保存成功: {doc_id[:8]}...")
            saved_count += 1

        except Exception as e:
            print(f"    错误: {e}")
            error_count += 1

    print("\n" + "=" * 60)
    print(f"导入完成!")
    print(f"  成功: {saved_count}")
    print(f"  失败: {error_count}")
    print("=" * 60)


if __name__ == "__main__":
    main()
