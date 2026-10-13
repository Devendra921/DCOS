import type { FormInstance } from 'antd';

/** Validation errors stay in the form and focus the first field in its scrollport. */
export async function validateWizardFields<Values>(form: Pick<FormInstance<Values>, 'validateFields' | 'scrollToField'>): Promise<Values | null> {
  try {
    return await form.validateFields();
  } catch (error) {
    if (error && typeof error === 'object' && 'errorFields' in error && Array.isArray(error.errorFields)) {
      const first = error.errorFields[0];
      if (first?.name) form.scrollToField(first.name, { focus: true, block: 'center', behavior: 'smooth' });
      return null;
    }
    throw error;
  }
}
