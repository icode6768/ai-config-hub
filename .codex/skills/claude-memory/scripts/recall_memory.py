#!/usr/bin/env python
"""
Claude Code 记忆检索脚本
从向量数据库检索相关的历史对话
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


def recall_memory(query: str, k: int = 5, tag: str = None):
    """从向量数据库检索相关记忆"""
    from app.services.memory_service import get_memory_service

    # 获取唯一的用户标识
    import platform
    import getpass
    machine_id = f"{platform.node()}_{getpass.getuser()}"

    # 获取记忆服务
    memory = get_memory_service()

    # 检索记忆
    results = memory.recall_memories(
        query=query,
        user_id=machine_id,
        k=k
    )

    # 如果指定了标签，过滤结果
    if tag and results:
        results = [doc for doc in results if doc.metadata.get('tag') == tag]

    return results, machine_id


def main():
    parser = argparse.ArgumentParser(description='检索 Claude Code 长期记忆')
    parser.add_argument('query', type=str, help='查询内容（支持语义搜索）')
    parser.add_argument('--limit', '-k', type=int, default=5,
                        help='返回结果数量（默认：5）')
    parser.add_argument('--tag', '-t', type=str, default=None,
                        help='按标签过滤')

    args = parser.parse_args()

    print("=" * 60)
    print("Claude Code 长期记忆 - 检索")
    print("=" * 60)
    print(f"查询: {args.query}")
    print(f"限制: {args.limit} 条")
    if args.tag:
        print(f"标签过滤: {args.tag}")
    print("-" * 60)

    try:
        results, machine_id = recall_memory(
            query=args.query,
            k=args.limit,
            tag=args.tag
        )

        if results:
            print(f"找到 {len(results)} 条相关记忆:\n")
            for i, doc in enumerate(results, 1):
                print(f"[{i}] {doc.page_content}")
                print(f"    标签: {doc.metadata.get('tag', '无')}")
                print(f"    时间: {doc.metadata.get('timestamp', '未知')}")
                print(f"    来源: {doc.metadata.get('source', '未知')}")
                print()
        else:
            print("未找到相关记忆")

        print("=" * 60)

    except Exception as e:
        print(f"检索失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
