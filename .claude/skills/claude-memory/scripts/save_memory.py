#!/usr/bin/env python
"""
Claude Code 记忆保存脚本
将对话内容保存到向量数据库，实现跨会话持久化
"""
import sys
import os
import argparse
from datetime import datetime

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


def save_memory(content: str, tag: str = None, source: str = "claude-code"):
    """保存记忆到向量数据库"""
    from app.services.memory_service import get_memory_service

    # 获取唯一的用户标识（使用机器名+用户名）
    import platform
    import getpass
    machine_id = f"{platform.node()}_{getpass.getuser()}"

    # 构建元数据
    metadata = {
        "source": source,
        "timestamp": datetime.now().isoformat(),
        "machine_id": machine_id,
    }
    if tag:
        metadata["tag"] = tag

    # 获取记忆服务
    memory = get_memory_service()

    # 保存记忆
    doc_id = memory.store_memory(
        content=content,
        metadata=metadata,
        user_id=machine_id  # 使用机器标识作为用户ID，实现跨项目共享
    )

    return doc_id, machine_id


def main():
    parser = argparse.ArgumentParser(description='保存 Claude Code 对话到长期记忆')
    parser.add_argument('content', type=str, help='要保存的内容')
    parser.add_argument('--tag', '-t', type=str, default=None,
                        help='记忆标签（如：项目信息、进度、问题、解决方案）')
    parser.add_argument('--source', '-s', type=str, default='claude-code',
                        help='来源标识（默认：claude-code）')

    args = parser.parse_args()

    print("=" * 50)
    print("Claude Code 长期记忆 - 保存")
    print("=" * 50)

    try:
        doc_id, machine_id = save_memory(
            content=args.content,
            tag=args.tag,
            source=args.source
        )

        print(f"保存成功!")
        print(f"  内容: {args.content[:100]}{'...' if len(args.content) > 100 else ''}")
        print(f"  标签: {args.tag or '无'}")
        print(f"  文档ID: {doc_id}")
        print(f"  用户ID: {machine_id}")
        print(f"  时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 50)

    except Exception as e:
        print(f"保存失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
