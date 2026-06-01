import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Typography, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useAuthStore } from '../../stores/authStore';

const { Title } = Typography;

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      await login(values.username, values.password);
      message.success('登录成功');
      navigate('/dashboard');
    } catch {
      message.error('用户名或密码错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc',
        fontFamily: "'Inter', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          boxShadow: '0 10px 25px rgba(0,0,0,0.05), 0 4px 10px rgba(0,0,0,0.03)',
          border: '1px solid #e2e8f0',
          width: 400,
          overflow: 'hidden',
        }}
      >
        {/* Brand */}
        <div style={{ padding: '32px 0 16px', textAlign: 'center' }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 8,
              background: '#2563eb',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 16,
              fontWeight: 800,
              marginBottom: 8,
            }}
          >
            PM
          </div>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#0f172a' }}>AI-PM</h2>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: '4px 0 0' }}>
            AI 原生项目管理平台
          </p>
        </div>

        {/* Login form */}
        <div style={{ padding: '0 24px 24px' }}>
          <Form onFinish={onFinish} size="large">
            <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
              <Input prefix={<UserOutlined style={{ color: '#94a3b8' }} />} placeholder="用户名" />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password prefix={<LockOutlined style={{ color: '#94a3b8' }} />} placeholder="密码" />
            </Form.Item>
            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                style={{ height: 40, borderRadius: 8, fontWeight: 600, fontSize: 14 }}
              >
                登录
              </Button>
            </Form.Item>
          </Form>
          <div style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>
            默认账号: admin / admin123
          </div>
        </div>
      </div>
    </div>
  );
}
