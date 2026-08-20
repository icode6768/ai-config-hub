import hashlib
import requests
class UtilHelper():
    '''
    md5加密
    '''
    def md5_encrypt(self,text):
        # 创建md5对象
        md5 = hashlib.md5()
        # 更新md5对象，注意需要编码
        md5.update(text.encode('utf-8'))
        # 获取加密结果
        return md5.hexdigest()
    '''
    下载图片
    '''
    def download_image(self,url, save_path):
        try:
            response = requests.get(url, stream=True,verify=False)
            response.raise_for_status()  # 检查请求是否成功
            with open(save_path, "wb") as file:
                for chunk in response.iter_content(1024):
                    file.write(chunk)
            print(f"Image successfully downloaded: {save_path}")
        except requests.exceptions.RequestException as e:
            print(f"Failed to download image: {e}")
    '''
    下载视频
    '''
    def download_video(self,url, save_path,headers=None):
        try:
            response = requests.get(url, stream=True,verify=False,headers=headers)
            response.raise_for_status()  # 检查请求是否成功
            with open(save_path, "wb") as file:
                for chunk in response.iter_content(chunk_size=1024 * 1024):  # 1 MB per chunk
                    if chunk:
                        file.write(chunk)
            print(f"Video successfully downloaded: {save_path}")
        except requests.exceptions.RequestException as e:
            print(f"Failed to download video: {e}")

    '''
    读取文件并将其转为二进制
    '''
    def read_file_as_binary(self,file_path: str) -> bytes:
        try:
            with open(file_path, 'rb') as file:
                binary_data = file.read()
            return binary_data
        except FileNotFoundError:
            print("文件未找到，请检查路径是否正确。")
        except Exception as e:
            print(f"发生错误: {e}")