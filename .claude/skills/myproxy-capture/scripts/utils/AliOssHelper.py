# -*- coding: utf-8 -*-
import oss2
import os
from config import setting

'''
阿里云对象存储操作
'''
class AliOssHelper:
    def __init__(self,accessKeyID=None,accessKeySecret=None,bucketName=None,endpoint=None):
        system_config = setting.load_config()
        if accessKeyID is None:
            accessKeyID=system_config.get('alioos','Oss_AccessKey_ID')
        if accessKeySecret is None:
            accessKeySecret=system_config.get('alioos','Oss_AccessKey_Secret')
        if bucketName is None:
            bucketName=system_config.get('alioos','Oss_BucketName')
        if endpoint is None:
            endpoint=system_config.get('alioos','Oss_Endpoint')

        auth = oss2.Auth(accessKeyID, accessKeySecret)
        self.bucket = oss2.Bucket(auth, endpoint, bucketName)



    '''
    上传
    '''
    def upload(self,key,content):
        self.bucket.put_object(key, content)

    '''
    下载
    '''
    def download(self,key):
        return self.bucket.get_object(key).read()

    '''
    删除
    '''
    def delete(self,key):
        return self.bucket.delete_object(key)