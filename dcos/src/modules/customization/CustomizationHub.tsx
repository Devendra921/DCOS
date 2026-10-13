import { TabbedHub } from '../../shared/components/ux/TabbedHub';
import CustomFieldsPage from './CustomFieldsPage';
import TagsPage from './TagsPage';

export default function CustomizationHub() {
  return <TabbedHub title="Customization" description="Custom fields and tags for your records." tabs={[
    { label: 'Custom fields', path: '/customization', el: <CustomFieldsPage /> },
    { label: 'Tags', path: '/customization/tags', el: <TagsPage /> },
  ]} />;
}
