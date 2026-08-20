#最前面
import sys
#加一个类
class LoggerDebug(object):
    def __init__(self, filename="Default.log"):
        # self.terminal = sys.stdout
        # self.log = open(filename, "a")

        self.log = open(filename, "a", encoding="utf-8", errors="ignore")

    def write(self, message):
        # self.terminal.write(message)
        self.log.write(message)
        print(message)
        #pass

    def flush(self):
        pass

    def reset(self):
        self.log.close()
        sys.stdout = self.terminal
#主函数里定义下输出文件
def main():
	#文件名和路径
	# sys.stdout=LoggerDebug("log.txt")
	#要运行的函数

	sys.stdout.reset()
	return None
