#!/usr/bin/env python
"""
Claude Code 上下文加载脚本
在新会话开始时加载相关的历史上下文
"""
import sys
import os
import argparse

# 添加 backend 目录到 Python 路径
# 脚本位于 .claude/skills/claude-memory/scripts/，需要向上4层到项目根目录
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(script_dir))))
backend_path = os.path.join(project_root, 'backend')
sys.path.insert(0, backend_path)

# 加载 .env 文件
from dotenv import load_dotenv
env_path = os.path.join(backend_path, '.env')
load_dotenv(env_path)


def load_context(task_description: str, k: int = 10):
    """加载与任务相关的历史上下文"""
    from app.services.memory_service import get_memory_service

    # 获取唯一的用户标识
    import platform
    import getpass
    machine_id = f"{platform.node()}_{getpass.getuser()}"

    # 获取记忆服务
    memory = get_memory_service()

    # 检索相关记忆
    results = memory.recall_memories(
        query=task_description,
        user_id=machine_id,
        k=k
    )

    return results, machine_id


def format_context(results):
    """格式化上下文为可读文本"""
    if not results:
        return "暂无相关历史记忆"

    context_lines = []
    for i, doc in enumerate(results, 1):
        tag = doc.metadata.get('tag', '未分类')
        timestamp = doc.metadata.get('timestamp', '')
        if timestamp:
            # 简化时间格式
            timestamp = timestamp.split('T')[0] if 'T' in timestamp else timestamp

        context_lines.append(f"[{tag}] {doc.page_content}")
        if timestamp:
            context_lines.append(f"    ({timestamp})")
        context_lines.append("")

    return "\n".join(context_lines)


def main():
    parser = argparse.ArgumentParser(description='加载 Claude Code 会话上下文')
    parser.add_argument('task', type=str, nargs='?', default=None,
                        help='当前任务描述（可选，不提供则加载最近记忆）')
    parser.add_argument('--limit', '-k', type=int, default=10,
                        help='加载记忆数量（默认：10）')
    parser.add_argument('--format', '-f', choices=['text', 'json'], default='text',
                        help='输出格式（默认：text）')

    args = parser.parse_args()

    print("=" * 60)
    print("Claude Code 长期记忆 - 上下文加载")
    print("=" * 60)

    try:
        # 如果没有提供任务描述，使用通用查询
        task = args.task or "最近的开发工作和项目信息"

        print(f"任务: {task}")
        print("-" * 60)

        results, machine_id = load_context(task, args.limit)

        if args.format == 'json':
            import json
            output = []
            for doc in results:
                output.append({
                    "content": doc.page_content,
                    "metadata": doc.metadata
                })
            print(json.dumps(output, ensure_ascii=False, indent=2))
        else:
            print("\n相关历史上下文:\n")
            print(format_context(results))

        print("=" * 60)
        print(f"用户ID: {machine_id}")
        print(f"加载了 {len(results)} 条记忆")
        print("=" * 60)

    except Exception as e:
        print(f"加载失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
