import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const username = (form.elements.namedItem('username') as HTMLInputElement).value;
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;
    setLoading(true);
    try {
      await login(username, password);
      navigate('/dashboard');
    } catch {
      // error handled by API client
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="brand">
          <div className="brand-icon">PM</div>
          <h2>AI PM</h2>
          <p>项目管理工具，AI 让每个人更高效</p>
        </div>

        <div className="login-tabs">
          <button
            className={`login-tab${activeTab === 0 ? ' active' : ''}`}
            onClick={() => setActiveTab(0)}
          >
            密码登录
          </button>
          <button
            className={`login-tab${activeTab === 1 ? ' active' : ''}`}
            onClick={() => setActiveTab(1)}
          >
            LDAP
          </button>
          <button
            className={`login-tab${activeTab === 2 ? ' active' : ''}`}
            onClick={() => setActiveTab(2)}
          >
            企微扫码
          </button>
        </div>

        {/* Password Login */}
        <form
          className={`login-form${activeTab === 0 ? ' active' : ''}`}
          onSubmit={handlePasswordLogin}
        >
          <div className="field">
            <label>用户名</label>
            <input type="text" name="username" placeholder="请输入用户名" defaultValue="admin" />
          </div>
          <div className="field">
            <label>密码</label>
            <input type="password" name="password" placeholder="请输入密码" defaultValue="admin123" />
          </div>
          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? '登录中...' : '登 录'}
          </button>
        </form>

        {/* LDAP Login */}
        <form className={`login-form${activeTab === 1 ? ' active' : ''}`} onSubmit={handlePasswordLogin}>
          <div className="field">
            <label>企业账号</label>
            <input type="text" name="username" placeholder="请输入 LDAP 账号" />
          </div>
          <div className="field">
            <label>密码</label>
            <input type="password" name="password" placeholder="请输入 LDAP 密码" />
          </div>
          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? '登录中...' : 'LDAP 登录'}
          </button>
        </form>

        {/* WeChat QR */}
        <div className={`login-form${activeTab === 2 ? ' active' : ''}`}>
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
            <div
              style={{
                width: 120,
                height: 120,
                background: 'var(--bg-raised)',
                margin: '0 auto 12px',
                borderRadius: 'var(--radius)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2.5rem',
              }}
            >
              扫码
            </div>
            请使用企业微信扫描二维码
          </div>
        </div>
      </div>
    </div>
  );
}
