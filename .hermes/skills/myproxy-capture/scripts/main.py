# -*- coding: utf-8 -*-
import sys
from multiprocessing import Process
from proxy_server import start_proxy
from utils.LoggerDebug import LoggerDebug


def proxy_server():
    start_proxy()

if __name__ == "__main__":
    # sys.stdout = LoggerDebug("log_debug.log")

    Process(target=proxy_server).start()

