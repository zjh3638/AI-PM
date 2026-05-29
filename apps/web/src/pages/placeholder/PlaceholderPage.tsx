import { Empty } from 'antd';

export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div style={{ padding: '64px 0', textAlign: 'center' }}>
      <Empty description={`${title} — 功能开发中`} />
      <p style={{ color: '#999', marginTop: 8 }}>该功能将在后续版本中实现</p>
    </div>
  );
}
