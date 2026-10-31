import { phoneKey, phoneVariants } from '../../lib/agents/whatsapp/numbers';
import { renderTemplate } from '../../lib/agents/whatsapp/templates';
import { TRIGGER_LABELS } from '../../lib/agents/activation/rules';

describe('official number helpers', () => {
  it('one key for a mobile with or without the ninth digit', () => {
    expect(phoneKey('5566999998888')).toBe('556699998888');
    expect(phoneKey('556699998888')).toBe('556699998888');
    expect(phoneKey('+55 (66) 99999-8888')).toBe('556699998888');
  });

  it('a landline and a foreign number stay as they are', () => {
    expect(phoneKey('551133334444')).toBe('551133334444');
    expect(phoneVariants('551133334444')).toEqual(['551133334444']);
    expect(phoneKey('16505551111')).toBe('16505551111');
  });

  it('finds the owner by either spelling', () => {
    expect(phoneVariants('556699998888')).toEqual(['556699998888', '5566999998888']);
    expect(phoneVariants('5566999998888')).toEqual(['556699998888', '5566999998888']);
  });

  it('every agent trigger has an approved template', () => {
    for (const trigger of Object.keys(TRIGGER_LABELS)) {
      expect(renderTemplate(trigger, { firstName: 'Maria', restaurantName: 'Pizzaria', draft: '' })?.name).toBe(trigger);
    }
  });

  it('fills the template and takes the button path from the draft', () => {
    const t = renderTemplate('sem_caixa', { firstName: 'Maria', restaurantName: 'Pizzaria Boa', draft: 'Oi\n\nhttps://gastrux.com/caixa?x=1\n\nEquipe Gastrux' })!;
    expect(t.bodyParams).toEqual(['Maria', 'Pizzaria Boa']);
    expect(t.linkPath).toBe('caixa?x=1');
    expect(t.text).toContain('O cardápio do Pizzaria Boa já está pronto');
    expect(t.text).not.toContain('{{');
    expect(t.text.endsWith('Equipe Gastrux')).toBe(true);
  });

  it('one variable sends one parameter; no name uses the restaurant; no link goes home', () => {
    const t = renderTemplate('sumiu', { firstName: null, restaurantName: 'Pizzaria Boa', draft: 'sem link' })!;
    expect(t.bodyParams).toEqual(['Pizzaria Boa']);
    expect(t.linkPath).toBe('dashboard');
  });
});
