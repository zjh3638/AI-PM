import { useState, useCallback } from 'react';
import { Input, List, Typography, Tag, Spin } from 'antd';
import { SearchOutlined, FileTextOutlined, CheckSquareOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';

const { Text } = Typography;

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ tasks: any[]; documents: any[] }>({ tasks: [], documents: [] });
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const debounceSearch = useCallback(
    debounce(async (q: string) => {
      if (!q.trim()) {
        setResults({ tasks: [], documents: [] });
        setOpen(false);
        return;
      }
      setLoading(true);
      try {
        const res = await api.get('/search', { params: { q, type: 'all' } });
        setResults(res.data);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 300),
    []
  );

  const handleChange = (value: string) => {
    setQuery(value);
    debounceSearch(value);
  };

  return (
    <div style={{ position: 'relative', width: 300 }}>
      <Input
        prefix={<SearchOutlined />}
        placeholder="搜索任务和文档..."
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => { if (query.trim()) setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        allowClear
      />
      {open && (results.tasks.length > 0 || results.documents.length > 0) && (
        <div style={{
          position: 'absolute', top: 36, left: 0, right: 0, zIndex: 1000,
          background: '#fff', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          maxHeight: 400, overflow: 'auto',
        }}>
          <Spin spinning={loading}>
            {results.tasks.length > 0 && (
              <div style={{ padding: '8px 12px' }}>
                <Text type="secondary" strong>任务</Text>
                <List size="small" dataSource={results.tasks} renderItem={(t: any) => (
                  <List.Item style={{ cursor: 'pointer', padding: '4px 0' }}
                    onMouseDown={() => navigate(`/workspaces/${t.workspace_id}`)}>
                    <CheckSquareOutlined style={{ marginRight: 6 }} /> {t.title}
                    <Tag style={{ marginLeft: 8 }}>{t.task_type}</Tag>
                  </List.Item>
                )} />
              </div>
            )}
            {results.documents.length > 0 && (
              <div style={{ padding: '8px 12px', borderTop: '1px solid #f0f0f0' }}>
                <Text type="secondary" strong>文档</Text>
                <List size="small" dataSource={results.documents} renderItem={(d: any) => (
                  <List.Item style={{ cursor: 'pointer', padding: '4px 0' }}
                    onMouseDown={() => navigate(`/workspaces/${d.workspace_id}`)}>
                    <FileTextOutlined style={{ marginRight: 6 }} /> {d.title}
                  </List.Item>
                )} />
              </div>
            )}
          </Spin>
        </div>
      )}
    </div>
  );
}

function debounce(fn: (...args: any[]) => void, delay: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
