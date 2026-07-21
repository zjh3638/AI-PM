#!/usr/bin/env python3
import urllib.request, json, ssl
ssl._create_default_https_context = ssl._create_unverified_context

# 获取 token
url = "http://7.22.1.64/cgi-bin/gettoken?corpid=ww1ebf94a46c9b46df&corpsecret=VcSmgP-IYlOnmwuOK1yh-MKkFj6z6IDisLzOwZ0-nNk"
req = urllib.request.urlopen(url, timeout=10)
token_data = json.loads(req.read().decode())
print("Token:", token_data["errcode"], token_data.get("errmsg"))
token = token_data["access_token"]

# 创建群聊
chat_data = json.dumps({
    "name": "测试群聊(容器内)",
    "owner": "liujr",
    "userlist": ["liujr", "jinyu", "chenjuan", "zhaojh"],
    "chatid": ""
}).encode("utf-8")

req2 = urllib.request.Request(
    "http://7.22.1.64/cgi-bin/appchat/create?access_token=" + token,
    data=chat_data,
    headers={"Content-Type": "application/json"}
)
resp2 = urllib.request.urlopen(req2, timeout=15)
print("Create:", json.loads(resp2.read().decode()))
