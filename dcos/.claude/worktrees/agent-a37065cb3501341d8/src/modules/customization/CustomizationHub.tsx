import { TabbedHub } from '../../shared/components/ux/TabbedHub';
import CustomFieldsPage from './CustomFieldsPage';
import TagsPage from './TagsPage';

export default function CustomizationHub() {
  return <TabbedHub tabs={[
    { label: 'Custom fields', path: '/customization', el: <CustomFieldsPage /> },
    { label: 'Tags', path: '/customization/tags', el: <TagsPage /> },
  ]} />;
}
