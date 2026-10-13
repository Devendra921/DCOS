import { Empty } from 'antd';

/** Blueprint-phase placeholder for a not-yet-built module screen. */
export const ModulePlaceholder = ({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) => (
  <div>
    <div className="vw-page-title vw-card-section" role="heading" aria-level={3}>
      {title}
    </div>
    <div style={{ marginTop: 64 }}>
      <Empty description={`${title} — not built yet`} />
    </div>
  </div>
);

export default ModulePlaceholder;
