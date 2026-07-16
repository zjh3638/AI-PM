#!/usr/bin/env python3
"""测试 LLM 网关连接和错误处理"""
import asyncio
import httpx
import sys

async def test_gateway(url: str):
    """测试网关各个端点"""
    print(f"🔍 测试 LLM 网关: {url}\n")

    # 1. 测试 /models 端点
    print("1️⃣ 测试模型列表端点...")
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{url}/models")
            print(f"   ✅ 状态码: {resp.status_code}")
            if resp.status_code == 200:
                data = resp.json()
                models = data.get("data", [])
                print(f"   📋 可用模型数量: {len(models)}")
                if models:
                    print(f"   📌 首个模型: {models[0].get('id', 'N/A')}")
    except httpx.TimeoutException:
        print("   ❌ 请求超时（5秒）")
        return False
    except httpx.ConnectError as e:
        print(f"   ❌ 连接失败: {e}")
        return False
    except Exception as e:
        print(f"   ❌ 错误: {e}")
        return False

    # 2. 测试 /chat/completions 端点
    print("\n2️⃣ 测试聊天完成端点...")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            payload = {
                "model": "deepseek-chat",
                "messages": [{"role": "user", "content": "你好"}],
                "temperature": 0.3,
                "max_tokens": 50
            }
            resp = await client.post(
                f"{url}/chat/completions",
                headers={
                    "Authorization": "Bearer test-key",
                    "Content-Type": "application/json"
                },
                json=payload
            )
            print(f"   ✅ 状态码: {resp.status_code}")

            if resp.status_code == 502:
                print(f"   ⚠️  502 Bad Gateway - 上游模型服务不可用")
                print(f"   📄 响应体: {resp.text[:200]}")
                return False
            elif resp.status_code == 401:
                print(f"   ⚠️  401 Unauthorized - API Key 无效")
                return False
            elif resp.status_code == 400:
                print(f"   ⚠️  400 Bad Request - 请求参数错误")
                print(f"   📄 响应体: {resp.text[:200]}")
                return False
            elif resp.status_code == 200:
                data = resp.json()
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                print(f"   ✅ 成功！回复: {content[:50]}...")
                return True
            else:
                print(f"   ❌ 未预期的状态码: {resp.status_code}")
                print(f"   📄 响应体: {resp.text[:200]}")
                return False

    except httpx.TimeoutException:
        print("   ❌ 请求超时（10秒）")
        return False
    except httpx.ConnectError as e:
        print(f"   ❌ 连接失败: {e}")
        return False
    except Exception as e:
        print(f"   ❌ 错误: {e}")
        return False

if __name__ == "__main__":
    gateway_url = sys.argv[1] if len(sys.argv) > 1 else "http://7.24.28.9:8080/v1"
    result = asyncio.run(test_gateway(gateway_url))

    print("\n" + "="*60)
    if result:
        print("✅ LLM 网关工作正常")
        sys.exit(0)
    else:
        print("❌ LLM 网关存在问题，请检查:")
        print("   1. 网关服务是否运行")
        print("   2. 上游模型服务（如 DeepSeek/Qwen）是否启动")
        print("   3. 网关配置中的上游地址是否正确")
        print("   4. 网络连接是否正常")
        sys.exit(1)
