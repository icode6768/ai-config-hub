import requests

url='http://api.m.taobao.com/rest/h5ApiUpdate.do?callback=mtopjsonp1&type=jsonp&api=mtop.taobao.wireless.homepage.ac.loadPageContent&v=2.0'
str_cookies='_samesite_flag_=true; cna=vLc5GMgntw0CAd7Ykix+bufq; xlly_s=2; unb=380355620; uc3=id2=UNiE4RF%2Bl%2FQ2&lg2=URm48syIIVrSKA%3D%3D&nk2=D8rlE67zWQ%3D%3D&vt3=F8dCufwuP4gLHR%2F76Yk%3D; csg=4c6a67cc; lgc=licz_85; t=5f6eb5dfd901c5e7ed16e69f2671cd5a; cookie17=UNiE4RF%2Bl%2FQ2; sgcookie=E1001lnPt%2BP8EA3C6OrLwCxq%2B1zRPola5iV8LZBgoGhgHOBEnn8DnLooPhCsxMD0MnIV5kGoh3%2BB2ghFEKigxKiJlA%3D%3D; dnk=licz_85; skt=b8a1aa48f5b90fb1; cookie2=1c84575319e6c497157889da296526a0; existShop=MTYwNTU1MjU4MQ%3D%3D; uc4=id4=0%40Ug%2BbVflP03NiQJhm61RgcPzBK4M%3D&nk4=0%40Denf%2FQtNytbeHDhtybVJmdFo; tracknick=licz_85; _cc_=VFC%2FuZ9ajQ%3D%3D; _l_g_=Ug%3D%3D; sg=50d; _nk_=licz_85; cookie1=UU8NM%2B8Bi3APorEr03c4X0R4dg1wnZtBm%2BbBSJi6Bac%3D; _tb_token_=f5bf3dae511b9; tfstk=cwXFB36GLJeFwe97Mp9rOnUJZkudZYWlhWKJt_zCL0OEz3dhMSA83mouDSAxw; l=eBOTq3scOGoScewkXOfwourza77OSIRAguPzaNbMiOCPOkf95fxhWZ74S7TpC3GdhsC6R3yHMu2yBeYBqI0EFmsfjrebn-Dmn; isg=BAwM3HUAv-2rEauR3wGiVX9B3Wo-RbDvkHaQ9mbNGLda8az7jlWAfwJDlfdJuehH; mt=ci=18_1; uc1=cookie21=VFC%2FuZ9aidsF3vBAgQ%3D%3D&existShop=false&cookie15=URm48syIIVrSKA%3D%3D&cookie14=Uoe0aDmQQPi6VQ%3D%3D&cookie16=VFC%2FuZ9az08KUQ56dCrZDlbNdA%3D%3D&pas=0; thw=cn'
cookies={}
headers={'User-Agent':'Mozilla/5.0 (Linux; Android 7.1.1; OPPO R11t Build/NMF26X; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/53.0.2785.49 Mobile MQQBrowser/6.2 TBS/043307 Safari/537.36 MicroMessenger/6.5.8.1060 NetType/WIFI '
         ,'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8;'
         ,'Accept':'text/html, application/xhtml+xml, */*'}
arr_cookies=str_cookies.split(';')
for cc in arr_cookies:
    key=cc[0:cc.find('=')]
    val=cc[cc.find('=')+1:]
    cookies[key]=val

r=requests.get(url=url,cookies=cookies,headers=headers)
print('url:',url)
print('url:',url)
print(r.text)