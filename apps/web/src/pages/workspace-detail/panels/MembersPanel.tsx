import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useWorkspaceStore } from '../../../stores/workspaceStore';
import { useAuthStore } from '../../../stores/authStore';
import SlidePanel from '../../../components/common/SlidePanel';
import api from '../../../api/client';
import type { WorkspaceMember } from '../../../types';

export default function MembersPanel() {
  const { id } = useParams<{ id: string }>();
  const { members, loading, fetchMembers, current, fetchDetail } = useWorkspaceStore();
  const { user } = useAuthStore();

  useEffect(() => { if (id) fetchMembers(id); }, [id]);

  const [wecomLoading, setWecomLoading] = useState(false);
  // 企业微信（联盟E动）已启用且当前项目尚未建群时，允许补建群
  const canInitWecom = current?.wecom_enabled && !current?.wecom_chat_id;

  const handleInitWecom = async () => {
    if (!id) return;
    if (!confirm('将为本项目创建联盟E动群，并把全部成员拉入群聊，是否继续？')) return;
    setWecomLoading(true);
    try {
      await api.post(`/workspaces/${id}/wecom-group`);
      await fetchDetail(id);
    } catch {
      /* 错误已由 API 拦截器统一提示 */
    } finally {
      setWecomLoading(false);
    }
  };

  const canManage = user && (
    user.system_role === 'SUPER_ADMIN' ||
    members.length === 0 ||
    members.some((m: WorkspaceMember) => m.user_id === user.id && (m.role === 'OWNER' || m.role === 'MANAGER'))
  );

  const [addOpen, setAddOpen] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [addForm, setAddForm] = useState({ user_id: '', role: 'MEMBER' });
  const [addError, setAddError] = useState('');
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const selectedUser = users.find((u: any) => u.id === addForm.user_id);

  const fetchUsers = async (keyword = '') => {
    setUsersLoading(true);
    setAddError('');
    try {
      const params: any = { page_size: 100 };
      if (keyword) params.keyword = keyword;
      const res: any = await api.get('/users', { params });
      const allUsers = res.data || [];
      const memberIds = new Set(members.map((m: WorkspaceMember) => m.user_id));
      setUsers(allUsers.filter((u: any) => !memberIds.has(u.id) && u.status === 'ACTIVE'));
    } catch (e: any) {
      setUsers([]);
      setAddError(e?.response?.data?.message || '加载用户列表失败');
    }
    setUsersLoading(false);
  };

  const handleUserSearch = (value: string) => {
    setUserSearch(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchUsers(value), 300);
  };

  const openAdd = () => {
    setAddForm({ user_id: '', role: 'MEMBER' });
    setAddError('');
    setUserSearch('');
    fetchUsers();
    setAddOpen(true);
  };

  const submitAdd = async () => {
    if (!id || !addForm.user_id) { setAddError('请选择用户'); return; }
    setAddSubmitting(true);
    setAddError('');
    try {
      await api.post(`/workspaces/${id}/members`, addForm);
      setAddOpen(false);
      fetchMembers(id);
    } catch (e: any) {
      setAddError(e?.response?.data?.message || '添加失败');
    } finally { setAddSubmitting(false); }
  };

  const handleRemove = async (member: WorkspaceMember) => {
    if (!id) return;
    if (!confirm(`确定移除成员「${member.user_name || member.user_id}」？`)) return;
    try {
      await api.delete(`/workspaces/${id}/members/${member.id}`);
      fetchMembers(id);
    } catch {
      /* 错误已由 API 拦截器统一提示 */
    }
  };

  const roleLabels: Record<string, string> = { OWNER: '所有者', MANAGER: '管理员', MEMBER: '成员', VIEWER: '观察者', AI_AGENT: 'AI Agent' };
  const roleColor: Record<string, string> = { OWNER: 'var(--amber-600)', MANAGER: 'var(--blue-600)', MEMBER: 'var(--text-secondary)', VIEWER: 'var(--text-muted)', AI_AGENT: 'var(--purple-500)' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>共 {members.length} 人</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {canManage && canInitWecom && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleInitWecom}
              disabled={wecomLoading}
              title="为本项目创建联盟E动群并拉入全部成员"
            >
              {wecomLoading ? '创建中...' : '创建联盟E动群'}
            </button>
          )}
          {canManage && (
            <button className="btn btn-primary btn-sm" onClick={openAdd}>+ 添加成员</button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>加载中...</div>
      ) : (
        <div className="member-grid">
          {members.map((m: WorkspaceMember) => (
            <div key={m.id} className="member-card" style={{ position: 'relative' }}>
              <div className={`m-avatar ${m.role === 'AI_AGENT' ? 'agent' : 'human'}`}>
                {(m.user_name || m.ai_agent_id || '?')[0]}
              </div>
              <div className="m-info">
                <div className="m-name">{m.user_name || m.ai_agent_id || m.user_id}</div>
                <div className="m-role" style={{ color: roleColor[m.role] }}>{roleLabels[m.role] || m.role}</div>
                {m.role !== 'AI_AGENT' && <div className="m-load">负载 78%</div>}
              </div>
              {canManage && m.role !== 'OWNER' && (
                <button
                  className="btn btn-ghost btn-xs"
                  style={{ position: 'absolute', top: 8, right: 8, color: 'var(--red-500)', fontSize: '0.6rem' }}
                  onClick={() => handleRemove(m)}
                  title="移除成员"
                >✕</button>
              )}
            </div>
          ))}
        </div>
      )}

      <SlidePanel open={addOpen} onClose={() => setAddOpen(false)} title="添加成员">
        <div className="form-group" style={{ position: 'relative' }}>
          <label>选择用户</label>
          {selectedUser ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-surface)', fontSize: '0.82rem',
            }}>
              <span>
                <strong>{selectedUser.display_name}</strong>
                <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>({selectedUser.username})</span>
                {selectedUser.department_name && (
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginLeft: 6 }}>— {selectedUser.department_name}</span>
                )}
              </span>
              <button className="btn btn-ghost btn-xs" onClick={() => { setAddForm((f) => ({ ...f, user_id: '' })); setUserSearch(''); fetchUsers(); }}>
                更改
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                placeholder="搜索用户姓名或用户名..."
                value={userSearch}
                onChange={(e) => handleUserSearch(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box' }}
                autoFocus
              />
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                maxHeight: 240, overflowY: 'auto',
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                marginTop: 2,
              }}>
                {usersLoading ? (
                  <div style={{ padding: '10px 12px', fontSize: '0.76rem', color: 'var(--text-muted)' }}>搜索中...</div>
                ) : users.length === 0 ? (
                  <div style={{ padding: '10px 12px', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                    {userSearch ? `没有匹配「${userSearch}」的用户` : '暂无可添加的用户'}
                  </div>
                ) : (
                  users.map((u: any) => (
                    <div
                      key={u.id}
                      onClick={() => { setAddForm((f) => ({ ...f, user_id: u.id })); setUserSearch(''); }}
                      style={{
                        padding: '8px 12px', cursor: 'pointer', fontSize: '0.8rem',
                        borderBottom: '1px solid var(--border-light)',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ fontWeight: 500 }}>{u.display_name}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        @{u.username}{u.department_name ? ` · ${u.department_name}` : ''}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
        <div className="form-group">
          <label>角色</label>
          <select value={addForm.role} onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value }))} style={{ width: '100%' }}>
            <option value="MEMBER">成员</option>
            <option value="MANAGER">管理员</option>
            <option value="VIEWER">观察者</option>
          </select>
        </div>
        {addError && (
          <div style={{ color: 'var(--red-500)', fontSize: '0.78rem', padding: '8px 12px', background: 'var(--red-50)', borderRadius: 'var(--radius-sm)', marginBottom: 8 }}>{addError}</div>
        )}
        <div className="form-actions">
          <button className="btn btn-ghost" onClick={() => setAddOpen(false)}>取消</button>
          <button className="btn btn-primary" onClick={submitAdd} disabled={addSubmitting || !addForm.user_id}>
            {addSubmitting ? '添加中...' : '添加'}
          </button>
        </div>
      </SlidePanel>
    </div>
  );
}
