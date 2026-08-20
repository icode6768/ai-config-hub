#!/usr/bin/env python
"""
Claude Code 记忆状态查看脚本
显示记忆服务状态和统计信息
"""
import sys
import os

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


def get_status():
    """获取记忆服务状态"""
    from app.services.memory_service import get_memory_service

    # 获取唯一的用户标识
    import platform
    import getpass
    machine_id = f"{platform.node()}_{getpass.getuser()}"

    # 获取记忆服务
    memory = get_memory_service()

    # 获取服务状态
    status = memory.get_status()

    return status, machine_id


def main():
    print("=" * 60)
    print("Claude Code 长期记忆 - 状态")
    print("=" * 60)

    try:
        status, machine_id = get_status()

        print(f"\n用户ID: {machine_id}")
        print("-" * 60)
        print("\n服务配置:")
        for key, value in status.items():
            print(f"  {key}: {value}")

        print("\n" + "-" * 60)
        print("\n使用方法:")
        print("  保存记忆: python .claude/skills/claude-memory/scripts/save_memory.py \"内容\" --tag \"标签\"")
        print("  检索记忆: python .claude/skills/claude-memory/scripts/recall_memory.py \"查询内容\"")
        print("  加载上下文: python .claude/skills/claude-memory/scripts/load_context.py \"任务描述\"")

        print("\n" + "=" * 60)

    except Exception as e:
        print(f"获取状态失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
