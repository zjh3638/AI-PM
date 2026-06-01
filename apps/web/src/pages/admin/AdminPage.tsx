import { useEffect, useState } from 'react';
import api from '../../api/client';
import SlidePanel from '../../components/common/SlidePanel';

interface User {
  id: string; username: string; display_name: string; email: string;
  system_role: string; department_name: string; status: string;
  created_at: string;
}

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: '超级管理员', ADMIN: '管理员', USER: '普通用户',
};

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState({ username: '', display_name: '', email: '', password: '', system_role: 'USER' });

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res: any = await api.get('/users', { params: { keyword: keyword || undefined } });
      setUsers(res.data || []);
      setTotal(res.total || 0);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, [keyword]);

  const openCreate = () => {
    setEditing(null);
    setForm({ username: '', display_name: '', email: '', password: '', system_role: 'USER' });
    setPanelOpen(true);
  };

  const openEdit = (u: User) => {
    setEditing(u);
    setForm({ username: u.username, display_name: u.display_name, email: u.email || '', password: '', system_role: u.system_role });
    setPanelOpen(true);
  };

  const submit = async () => {
    if (!form.username.trim()) return;
    if (editing) {
      const data: any = { display_name: form.display_name, system_role: form.system_role };
      if (form.password) (data as any).password = form.password;
      await api.patch(`/users/${editing.id}`, data);
    } else {
      await api.post('/users', form);
    }
    setPanelOpen(false);
    fetchUsers();
  };

  const adminTabs = [
    { key: 'users', label: '用户管理' },
    { key: 'models', label: '模型配置' },
    { key: 'agents', label: 'Agent 配置' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {adminTabs.map((t) => (
          <button key={t.key} className={`personal-tab${activeTab === t.key ? ' active' : ''}`} onClick={() => setActiveTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'users' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="搜索用户..."
                style={{ width: 200, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', outline: 'none' }}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>共 {total} 人</span>
              <button className="btn btn-primary btn-sm" onClick={openCreate}>+ 添加用户</button>
            </div>
          </div>

          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-raised)' }}>
                  <th style={{ padding: '10px 16px', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'left' }}>用户名</th>
                  <th style={{ padding: '10px 16px', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'left' }}>显示名</th>
                  <th style={{ padding: '10px 16px', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'left' }}>角色</th>
                  <th style={{ padding: '10px 16px', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'left' }}>部门</th>
                  <th style={{ padding: '10px 16px', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'left' }}>状态</th>
                  <th style={{ padding: '10px 16px', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'left' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '10px 16px', fontSize: '0.8rem', fontWeight: 500 }}>{u.username}</td>
                    <td style={{ padding: '10px 16px', fontSize: '0.8rem' }}>{u.display_name}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span className={`badge${u.system_role === 'SUPER_ADMIN' ? ' badge-red' : u.system_role === 'ADMIN' ? ' badge-amber' : ''}`} style={{ fontSize: '0.65rem' }}>
                        {ROLE_LABELS[u.system_role] || u.system_role}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{u.department_name || '-'}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: '0.7rem', color: u.status === 'ACTIVE' ? 'var(--green-600)' : 'var(--text-muted)' }}>
                        {u.status === 'ACTIVE' ? '活跃' : '禁用'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => openEdit(u)}>编辑</button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>暂无用户</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'models' && (
        <div className="member-grid">
          {[{ name: 'DeepSeek V3', meta: '通用推理 · 默认模型', status: 'active' },
            { name: 'Qwen Coder', meta: '代码生成 · 开发工程师 Agent', status: 'active' },
            { name: 'DeepSeek R1', meta: '深度推理 · 需求分析师 Agent', status: 'inactive' },
          ].map((m) => (
            <div key={m.name} className="member-card">
              <div className="m-avatar human" style={{ fontSize: '0.65rem' }}>🤖</div>
              <div className="m-info">
                <div className="m-name">{m.name}</div>
                <div className="m-role">{m.meta}</div>
                <span className={`badge${m.status === 'active' ? ' badge-green' : ''}`} style={{ fontSize: '0.62rem', marginTop: 4 }}>
                  {m.status === 'active' ? '活跃' : '未启用'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'agents' && (
        <div className="member-grid">
          {[{ name: '需求分析师', meta: 'DeepSeek R1 · PRD 生成', tasks: '12 项产出' },
            { name: '设计师', meta: 'Qwen Coder · 线框图', tasks: '8 项产出' },
            { name: '开发工程师', meta: 'DeepSeek V3 · PR 生成', tasks: '35 项产出' },
            { name: '项目经理', meta: 'DeepSeek V3 · 周报/风险', tasks: '6 项产出' },
          ].map((a) => (
            <div key={a.name} className="member-card">
              <div className="m-avatar agent">A</div>
              <div className="m-info">
                <div className="m-name">{a.name}</div>
                <div className="m-role">{a.meta}</div>
                <div className="m-load">{a.tasks}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* User Create/Edit Panel */}
      <SlidePanel open={panelOpen} onClose={() => setPanelOpen(false)} title={editing ? '编辑用户' : '添加用户'}>
        <div className="form-group">
          <label>用户名</label>
          <input type="text" placeholder="用户名" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} disabled={!!editing} />
        </div>
        <div className="form-group">
          <label>显示名称</label>
          <input type="text" placeholder="显示名称" value={form.display_name} onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>邮箱</label>
          <input type="email" placeholder="邮箱（可选）" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>{editing ? '新密码（留空不修改）' : '密码'}</label>
          <input type="password" placeholder={editing ? '留空则不修改密码' : '设置密码'} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>系统角色</label>
          <select value={form.system_role} onChange={(e) => setForm((f) => ({ ...f, system_role: e.target.value }))}>
            <option value="SUPER_ADMIN">超级管理员</option>
            <option value="ADMIN">管理员</option>
            <option value="USER">普通用户</option>
          </select>
        </div>
        <div className="form-actions">
          <button className="btn btn-ghost" onClick={() => setPanelOpen(false)}>取消</button>
          <button className="btn btn-primary" onClick={submit}>{editing ? '保存' : '添加'}</button>
        </div>
      </SlidePanel>
    </div>
  );
}
