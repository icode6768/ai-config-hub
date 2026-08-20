# -*- coding: utf-8 -*-
import  requests
class HttpHelper:

    headers={'user-agent':'SohuVideoMobile/10.0.68 (Platform/6)'}

    '''
    获得指定链接返回的内容
    '''

    @staticmethod
    def getText(url,headers=None):
        headers=HttpHelper.headers if headers is None else None
        return requests.get(url=url,headers=headers,verify=False).text

    '''
    提交表单并返回内容
    '''
    @staticmethod
    def postText(url,headers=None):
        headers=HttpHelper.headers if headers is None else None
        return requests.post(url=url,headers=headers,verify=False).text