/** Shown instead of the form for a record-backed task: why, what to do, and a button to the record. */
import { useNavigate } from 'react-router-dom';
import { Link as LinkIcon } from 'lucide-react';
import { Btn } from '../../../ops/ui/kit';
import type { RecordTaskLink } from '../lib/recordTasks';

export function RecordTaskNotice({ link }: { link: RecordTaskLink }) {
  const navigate = useNavigate();
  return (
    <div className="col" style={{ gap: 10 }}>
      <p className="vw-card-description" style={{ margin: 0 }}>
        This step is done on the {link.recordLabel}, so the {link.recordLabel} and its process stay in step. {link.how}
      </p>
      <div><Btn variant="filled" icon={LinkIcon} onClick={() => navigate(link.path)}>{link.label}</Btn></div>
    </div>
  );
}
