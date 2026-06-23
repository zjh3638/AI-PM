import { useEffect, useState } from 'react';
import api from '../../api/client';
import SlidePanel from '../../components/common/SlidePanel';

interface User {
  id: string; username: string; display_name: string; email: string;
  system_role: string; department_name: string; department_id: string; status: string;
  created_at: string;
}

interface Department {
  id: string; name: string; path: string;
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
  const [form, setForm] = useState({ username: '', display_name: '', email: '', password: '', system_role: 'USER', department_id: '' });
  const [departments, setDepartments] = useState<Department[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res: any = await api.get('/users', { params: { keyword: keyword || undefined, page_size: 100 } });
      setUsers(res.data || []);
      setTotal(res.total || 0);
    } finally { setLoading(false); }
  };

  const fetchDepartments = async () => {
    try {
      const res: any = await api.get('/users/departments/list');
      setDepartments(res.data || []);
    } catch { /* skip */ }
  };

  const [deptTree, setDeptTree] = useState<any[]>([]);
  const [deptLoading, setDeptLoading] = useState(false);
  const [deptPanelOpen, setDeptPanelOpen] = useState(false);
  const [deptEditing, setDeptEditing] = useState<any>(null);
  const [deptForm, setDeptForm] = useState({ name: '', parent_id: '', sort_order: 0 });
  const [deptSubmitting, setDeptSubmitting] = useState(false);
  const [deptError, setDeptError] = useState('');
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());

  const fetchDeptTree = async () => {
    setDeptLoading(true);
    try {
      const res: any = await api.get('/departments/tree');
      setDeptTree(res.data || []);
    } finally { setDeptLoading(false); }
  };

  useEffect(() => { fetchUsers(); fetchDepartments(); }, [keyword]);

  const openCreate = () => {
    setEditing(null);
    setForm({ username: '', display_name: '', email: '', password: '', system_role: 'USER', department_id: '' });
    setError('');
    setPanelOpen(true);
  };

  const openEdit = (u: User) => {
    setEditing(u);
    setForm({ username: u.username, display_name: u.display_name, email: u.email || '', password: '', system_role: u.system_role, department_id: u.department_id || '' });
    setError('');
    setPanelOpen(true);
  };

  const submit = async () => {
    if (!form.username.trim()) { setError('请输入用户名'); return; }
    if (!editing && !form.password) { setError('请输入密码'); return; }
    setSubmitting(true);
    setError('');
    try {
      if (editing) {
        const data: any = { display_name: form.display_name, system_role: form.system_role, department_id: form.department_id || null };
        if (form.password) data.password = form.password;
        await api.patch(`/users/${editing.id}`, data);
      } else {
        await api.post('/users', form);
      }
      setPanelOpen(false);
      fetchUsers();
    } catch (e: any) {
      setError(e?.response?.data?.message || '操作失败');
    } finally { setSubmitting(false); }
  };

  const toggleStatus = async (u: User) => {
    const newStatus = u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    await api.patch(`/users/${u.id}`, { status: newStatus });
    fetchUsers();
  };

  // Department CRUD
  const openDeptCreate = (parentId = '') => {
    setDeptEditing(null);
    setDeptForm({ name: '', parent_id: parentId, sort_order: 0 });
    setDeptError('');
    setDeptPanelOpen(true);
  };

  const openDeptEdit = (d: any) => {
    setDeptEditing(d);
    setDeptForm({ name: d.name, parent_id: d.parent_id || '', sort_order: d.sort_order || 0 });
    setDeptError('');
    setDeptPanelOpen(true);
  };

  const submitDept = async () => {
    if (!deptForm.name.trim()) { setDeptError('请输入部门名称'); return; }
    setDeptSubmitting(true);
    setDeptError('');
    try {
      if (deptEditing) {
        await api.patch(`/departments/${deptEditing.id}`, deptForm);
      } else {
        await api.post('/departments', deptForm);
      }
      setDeptPanelOpen(false);
      fetchDeptTree();
    } catch (e: any) {
      setDeptError(e?.response?.data?.message || '操作失败');
    } finally { setDeptSubmitting(false); }
  };

  const deleteDept = async (d: any) => {
    if (!confirm(`确定删除「${d.name}」？\n${d.children?.length ? `该部门下还有 ${d.children.length} 个子部门，` : ''}${d.user_count > 0 ? `该部门有 ${d.user_count} 名成员` : ''}`)) return;
    try {
      await api.delete(`/departments/${d.id}`);
      fetchDeptTree();
    } catch (e: any) {
      alert(e?.response?.data?.message || '删除失败');
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedDepts((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleExpandAll = () => {
    if (expandedDepts.size > 0) {
      setExpandedDepts(new Set());
    } else {
      const all = new Set<string>();
      const walk = (nodes: any[]) => {
        nodes.forEach((n) => { all.add(n.id); if (n.children?.length) walk(n.children); });
      };
      walk(deptTree);
      setExpandedDepts(all);
    }
  };

  // Fetch dept tree when tab opens
  useEffect(() => {
    if (activeTab === 'departments') fetchDeptTree();
    if (activeTab === 'settings') fetchSettings();
  }, [activeTab]);

  const [settingsTab, setSettingsTab] = useState<'gateway' | 'general'>('gateway');
  const [gatewayUrl, setGatewayUrl] = useState('');
  const [gwSaving, setGwSaving] = useState(false);
  const [gwMsg, setGwMsg] = useState('');

  // LDAP settings
  const [ldapEnabled, setLdapEnabled] = useState(false);
  const [ldapServerUri, setLdapServerUri] = useState('');
  const [ldapBindDn, setLdapBindDn] = useState('');
  const [ldapBindPassword, setLdapBindPassword] = useState('');
  const [ldapBaseDn, setLdapBaseDn] = useState('');
  const [ldapUserFilter, setLdapUserFilter] = useState('');
  const [ldapUsernameAttr, setLdapUsernameAttr] = useState('');
  const [ldapDisplayNameAttr, setLdapDisplayNameAttr] = useState('');
  const [ldapEmailAttr, setLdapEmailAttr] = useState('');
  const [ldapAutoCreate, setLdapAutoCreate] = useState(true);
  const [ldapSaving, setLdapSaving] = useState(false);
  const [ldapMsg, setLdapMsg] = useState('');
  const [ldapTesting, setLdapTesting] = useState(false);
  const [ldapTestResult, setLdapTestResult] = useState('');

  const fetchSettings = async () => {
    try {
      const res = await api.get('/ai/admin/settings');
      const d = res.data || {};
      setGatewayUrl(d.llm_gateway_url || '');
      // LDAP
      setLdapEnabled(d.ldap_enabled || false);
      setLdapServerUri(d.ldap_server_uri || '');
      setLdapBindDn(d.ldap_bind_dn || '');
      setLdapBindPassword('');  // password is masked, never pre-fill
      setLdapBaseDn(d.ldap_base_dn || '');
      setLdapUserFilter(d.ldap_user_filter || '(uid={username})');
      setLdapUsernameAttr(d.ldap_username_attribute || 'uid');
      setLdapDisplayNameAttr(d.ldap_display_name_attribute || 'cn');
      setLdapEmailAttr(d.ldap_email_attribute || 'mail');
      setLdapAutoCreate(d.ldap_auto_create_user !== false);
    } catch { /* skip */ }
  };

  const saveGateway = async () => {
    setGwSaving(true);
    setGwMsg('');
    try {
      await api.patch('/ai/admin/settings', { llm_gateway_url: gatewayUrl });
      setGwMsg('已保存');
    } catch { setGwMsg('保存失败'); }
    setGwSaving(false);
  };

  const saveLdap = async () => {
    setLdapSaving(true);
    setLdapMsg('');
    try {
      const payload: any = {
        ldap_enabled: ldapEnabled,
        ldap_server_uri: ldapServerUri,
        ldap_bind_dn: ldapBindDn,
        ldap_base_dn: ldapBaseDn,
        ldap_user_filter: ldapUserFilter,
        ldap_username_attribute: ldapUsernameAttr,
        ldap_display_name_attribute: ldapDisplayNameAttr,
        ldap_email_attribute: ldapEmailAttr,
        ldap_auto_create_user: ldapAutoCreate,
      };
      if (ldapBindPassword) {
        payload.ldap_bind_password = ldapBindPassword;
      }
      await api.patch('/ai/admin/settings', payload);
      setLdapMsg('LDAP 配置已保存');
    } catch (e: any) {
      setLdapMsg(e?.response?.data?.message || '保存失败');
    }
    setLdapSaving(false);
  };

  const testLdap = async () => {
    setLdapTesting(true);
    setLdapTestResult('');
    try {
      const res = await api.post('/ai/admin/settings/test-ldap', {
        ldap_server_uri: ldapServerUri,
        ldap_bind_dn: ldapBindDn,
        ldap_bind_password: ldapBindPassword,
        ldap_base_dn: ldapBaseDn,
        ldap_user_filter: ldapUserFilter,
      });
      setLdapTestResult(res.message || '连接成功');
    } catch (e: any) {
      setLdapTestResult(e?.response?.data?.message || '测试失败');
    }
    setLdapTesting(false);
  };

  const adminTabs = [
    { key: 'users', label: '用户管理' },
    { key: 'departments', label: '部门管理' },
    { key: 'settings', label: '系统设置' },
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
                    <td style={{ padding: '10px 16px', display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => openEdit(u)}>编辑</button>
                      <button className="btn btn-ghost btn-xs" onClick={() => toggleStatus(u)} style={{ color: u.status === 'ACTIVE' ? 'var(--red-500)' : 'var(--green-600)' }}>
                        {u.status === 'ACTIVE' ? '禁用' : '启用'}
                      </button>
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

      {activeTab === 'departments' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {deptTree.length > 0 ? `${countTree(deptTree)} 个部门` : ''}
              </span>
              <button className="btn btn-ghost btn-xs" onClick={toggleExpandAll}>
                {expandedDepts.size > 0 ? '全部折叠' : '全部展开'}
              </button>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => openDeptCreate()}>+ 添加部门</button>
          </div>

          {deptLoading ? (
            <div style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>加载中...</div>
          ) : deptTree.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>暂无部门，点击上方按钮创建</div>
          ) : (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              <DeptTree nodes={deptTree} expanded={expandedDepts} onToggle={toggleExpand} onEdit={openDeptEdit} onDelete={deleteDept} onAdd={openDeptCreate} />
            </div>
          )}
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

      {activeTab === 'settings' && (
        <div style={{ maxWidth: 640 }}>
          <div className="llm-status-card configured" style={{ marginBottom: 20 }}>
            <div className="llm-status-icon">⚙️</div>
            <div className="llm-status-text">
              <div className="llm-status-title">系统设置</div>
              <div className="llm-status-desc">配置 LLM 网关、LDAP 认证等全局参数，仅超级管理员可操作</div>
            </div>
          </div>

          {/* ── LLM Gateway ────────────────────────────── */}
          <div className="llm-form" style={{ marginBottom: 24 }}>
            <h4 style={{ margin: '0 0 16px', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>LLM 网关</h4>
            <div className="llm-form-group">
              <label className="llm-form-label">网关地址</label>
              <div className="llm-gateway-card">
                <input
                  type="text"
                  value={gatewayUrl}
                  onChange={(e) => setGatewayUrl(e.target.value)}
                  placeholder="https://llm-gateway.company.com/v1"
                  className="llm-key-input"
                />
                <div className="llm-gateway-hint">
                  所有用户的 AI 请求通过此网关转发。支持 OpenAI 兼容 API（/v1/chat/completions）
                </div>
              </div>
            </div>
            <div className="llm-form-actions">
              <button className="btn btn-primary btn-sm" onClick={saveGateway} disabled={gwSaving}>
                {gwSaving ? '保存中...' : '保存'}
              </button>
              {gwMsg && <span className={`llm-form-msg${gwMsg.includes('失败') ? ' error' : ''}`}>{gwMsg}</span>}
            </div>
          </div>

          {/* ── LDAP ────────────────────────────────────── */}
          <div className="llm-form">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>LDAP 认证</h4>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.8rem' }}>
                <input
                  type="checkbox"
                  checked={ldapEnabled}
                  onChange={(e) => setLdapEnabled(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                启用 LDAP
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
              <div className="llm-form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="llm-form-label">服务器地址</label>
                <input
                  type="text"
                  value={ldapServerUri}
                  onChange={(e) => setLdapServerUri(e.target.value)}
                  placeholder="ldap://ldap.company.com:389"
                  className="llm-key-input"
                />
              </div>
              <div className="llm-form-group">
                <label className="llm-form-label">绑定 DN</label>
                <input
                  type="text"
                  value={ldapBindDn}
                  onChange={(e) => setLdapBindDn(e.target.value)}
                  placeholder="cn=admin,dc=company,dc=com"
                  className="llm-key-input"
                />
              </div>
              <div className="llm-form-group">
                <label className="llm-form-label">绑定密码</label>
                <input
                  type="password"
                  value={ldapBindPassword}
                  onChange={(e) => setLdapBindPassword(e.target.value)}
                  placeholder={ldapBindPassword ? '' : '留空不修改'}
                  className="llm-key-input"
                />
              </div>
              <div className="llm-form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="llm-form-label">用户基础 DN</label>
                <input
                  type="text"
                  value={ldapBaseDn}
                  onChange={(e) => setLdapBaseDn(e.target.value)}
                  placeholder="ou=users,dc=company,dc=com"
                  className="llm-key-input"
                />
              </div>
              <div className="llm-form-group">
                <label className="llm-form-label">用户过滤器</label>
                <input
                  type="text"
                  value={ldapUserFilter}
                  onChange={(e) => setLdapUserFilter(e.target.value)}
                  placeholder="(uid={username})"
                  className="llm-key-input"
                />
              </div>
              <div className="llm-form-group">
                <label className="llm-form-label">用户名属性</label>
                <input
                  type="text"
                  value={ldapUsernameAttr}
                  onChange={(e) => setLdapUsernameAttr(e.target.value)}
                  placeholder="uid"
                  className="llm-key-input"
                />
              </div>
              <div className="llm-form-group">
                <label className="llm-form-label">显示名属性</label>
                <input
                  type="text"
                  value={ldapDisplayNameAttr}
                  onChange={(e) => setLdapDisplayNameAttr(e.target.value)}
                  placeholder="cn"
                  className="llm-key-input"
                />
              </div>
              <div className="llm-form-group">
                <label className="llm-form-label">邮箱属性</label>
                <input
                  type="text"
                  value={ldapEmailAttr}
                  onChange={(e) => setLdapEmailAttr(e.target.value)}
                  placeholder="mail"
                  className="llm-key-input"
                />
              </div>
            </div>

            <div className="llm-form-group" style={{ marginTop: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.8rem' }}>
                <input
                  type="checkbox"
                  checked={ldapAutoCreate}
                  onChange={(e) => setLdapAutoCreate(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                首次登录自动创建用户
              </label>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4, marginLeft: 24 }}>
                开启后，LDAP 验证通过的账号将自动在系统中创建用户记录
              </div>
            </div>

            <div className="llm-form-actions" style={{ marginTop: 16 }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={testLdap}
                disabled={ldapTesting || !ldapServerUri}
              >
                {ldapTesting ? '测试中...' : '测试连接'}
              </button>
              <button className="btn btn-primary btn-sm" onClick={saveLdap} disabled={ldapSaving}>
                {ldapSaving ? '保存中...' : '保存 LDAP 配置'}
              </button>
              {ldapMsg && (
                <span className={`llm-form-msg${ldapMsg.includes('失败') || ldapMsg.includes('错误') ? ' error' : ''}`} style={{ fontSize: '0.75rem' }}>
                  {ldapMsg}
                </span>
              )}
            </div>
            {ldapTestResult && (
              <div style={{
                marginTop: 10, padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                background: ldapTestResult.includes('成功') ? 'var(--green-50)' : 'var(--red-50)',
                color: ldapTestResult.includes('成功') ? 'var(--green-600)' : 'var(--red-500)',
                fontSize: '0.78rem',
              }}>
                {ldapTestResult}
              </div>
            )}
          </div>
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

      {/* Department Create/Edit Panel */}
      <SlidePanel open={deptPanelOpen} onClose={() => setDeptPanelOpen(false)} title={deptEditing ? '编辑部门' : '添加部门'}>
        <div className="form-group">
          <label>部门名称</label>
          <input type="text" placeholder="部门名称" value={deptForm.name} onChange={(e) => setDeptForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="form-group">
          <label>上级部门</label>
          <select value={deptForm.parent_id} onChange={(e) => setDeptForm((f) => ({ ...f, parent_id: e.target.value }))}>
            <option value="">无（顶级部门）</option>
            {flattenDeptTree(deptTree).filter((d: any) => d.id !== deptEditing?.id).map((d: any) => (
              <option key={d.id} value={d.id}>{d.path}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>排序</label>
          <input type="number" value={deptForm.sort_order} onChange={(e) => setDeptForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))} style={{ width: 80 }} />
        </div>
        {deptError && (
          <div style={{ color: 'var(--red-500)', fontSize: '0.78rem', padding: '8px 12px', background: 'var(--red-50)', borderRadius: 'var(--radius-sm)', marginBottom: 8 }}>{deptError}</div>
        )}
        <div className="form-actions">
          <button className="btn btn-ghost" onClick={() => setDeptPanelOpen(false)}>取消</button>
          <button className="btn btn-primary" onClick={submitDept} disabled={deptSubmitting}>{deptSubmitting ? '保存中...' : deptEditing ? '保存' : '添加'}</button>
        </div>
      </SlidePanel>

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
          <label>部门</label>
          <select value={form.department_id} onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))}>
            <option value="">不指定</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>系统角色</label>
          <select value={form.system_role} onChange={(e) => setForm((f) => ({ ...f, system_role: e.target.value }))}>
            <option value="SUPER_ADMIN">超级管理员</option>
            <option value="ADMIN">管理员</option>
            <option value="USER">普通用户</option>
          </select>
        </div>
        {error && (
          <div style={{ color: 'var(--red-500)', fontSize: '0.78rem', padding: '8px 12px', background: 'var(--red-50)', borderRadius: 'var(--radius-sm)', marginBottom: 8 }}>{error}</div>
        )}
        <div className="form-actions">
          <button className="btn btn-ghost" onClick={() => setPanelOpen(false)}>取消</button>
          <button className="btn btn-primary" onClick={submit} disabled={submitting}>{submitting ? '保存中...' : editing ? '保存' : '添加'}</button>
        </div>
      </SlidePanel>
    </div>
  );
}

// Helper: count total nodes in tree
function countTree(nodes: any[]): number {
  let count = 0;
  const walk = (ns: any[]) => { ns.forEach((n) => { count++; if (n.children?.length) walk(n.children); }); };
  walk(nodes);
  return count;
}

// Helper: flatten tree to array
function flattenDeptTree(nodes: any[]): any[] {
  const result: any[] = [];
  const walk = (ns: any[]) => { ns.forEach((n) => { result.push(n); if (n.children?.length) walk(n.children); }); };
  walk(nodes);
  return result;
}

// Department tree node component
function DeptTree({ nodes, expanded, onToggle, onEdit, onDelete, onAdd, depth = 0 }: {
  nodes: any[]; expanded: Set<string>; onToggle: (id: string) => void;
  onEdit: (d: any) => void; onDelete: (d: any) => void; onAdd: (parentId: string) => void; depth?: number;
}) {
  const levelColors = ['#6366f1', '#8b5cf6', '#a855f7', '#c084fc'];
  const levelLabels = ['部门', '中心', '小组', '子组'];
  return (
    <>
      {nodes.map((d) => {
        const isOpen = expanded.has(d.id);
        const hasChildren = d.children?.length > 0;
        const levelLabel = levelLabels[Math.min(depth, 3)];
        return (
          <div key={d.id}>
            <div
              className="dept-row"
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
                borderBottom: '1px solid var(--border-light)', cursor: 'pointer',
                paddingLeft: 16 + depth * 24,
              }}
              onClick={() => onToggle(d.id)}
            >
              <span style={{ fontSize: '0.7rem', transition: 'transform 0.15s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', opacity: hasChildren ? 1 : 0.2 }}>
                ▶
              </span>
              <span style={{
                fontSize: '0.6rem', fontWeight: 600, color: levelColors[Math.min(depth, 3)],
                background: `${levelColors[Math.min(depth, 3)]}18`, padding: '1px 6px',
                borderRadius: 3, minWidth: 28, textAlign: 'center',
              }}>
                {levelLabel}
              </span>
              <span style={{ fontSize: '0.8rem', fontWeight: 500, flex: 1 }}>{d.name}</span>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{d.path}</span>
              {d.user_count > 0 && (
                <span style={{ fontSize: '0.65rem', color: 'var(--blue-600)', background: 'var(--blue-50)', padding: '1px 6px', borderRadius: 8 }}>
                  {d.user_count} 人
                </span>
              )}
              <span onClick={(e) => { e.stopPropagation(); onAdd(d.id); }} title="添加子部门" style={{ cursor: 'pointer', fontSize: '0.7rem', padding: '2px 6px' }}>＋</span>
              <span onClick={(e) => { e.stopPropagation(); onEdit(d); }} title="编辑" style={{ cursor: 'pointer', fontSize: '0.7rem', padding: '2px 6px' }}>✎</span>
              <span onClick={(e) => { e.stopPropagation(); onDelete(d); }} title="删除" style={{ cursor: 'pointer', fontSize: '0.7rem', padding: '2px 6px', color: 'var(--red-500)' }}>✕</span>
            </div>
            {isOpen && hasChildren && (
              <DeptTree nodes={d.children} expanded={expanded} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} onAdd={onAdd} depth={depth + 1} />
            )}
          </div>
        );
      })}
    </>
  );
}
