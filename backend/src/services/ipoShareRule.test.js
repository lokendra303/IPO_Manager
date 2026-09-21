import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateMultiRuleSplit, calculateSplit } from './profitShareService.js';
import {
  MISSING_IPO_SHARE_RULE,
  MEMBER_NOT_ON_SHARE_RULE,
  CONTRADICTING_SHARE_RULES,
  shareRuleToSplitRules,
  tryResolveShareRulesForMember,
  assertMemberOnShareRule,
  isMemberOnShareRule,
  findShareRuleConflicts,
  formatShareRuleConflicts,
  mapSharePackRow,
} from './ipoShareRuleService.js';

const sampleRule = {
  id: 11,
  ruleName: 'Rinku 30%',
  fundProviderId: 3,
  providerName: 'Sagar',
  profitProviderPercent: 50,
  profitManagerPercent: 20,
  lossProviderPercent: 50,
  lossManagerPercent: 20,
  memberIds: [101, 102],
};

describe('IPO share rules', () => {
  it('resolves using the IPO rule percents (template math)', () => {
    const { rules, error } = tryResolveShareRulesForMember(sampleRule, 101);
    assert.equal(error, null);
    assert.equal(rules.length, 1);
    const split = calculateMultiRuleSplit(1000, rules);
    const expected = calculateSplit(1000, 50, 20);
    assert.equal(split.totalProvider, expected.providerAmount);
    assert.equal(split.totalManager, expected.managerAmount);
    assert.equal(split.memberAmount, expected.memberAmount);
    assert.equal(split.memberAmount, 300);
  });

  it('fails when the IPO has no share rule', () => {
    const { rules, error } = tryResolveShareRulesForMember(null, 101);
    assert.equal(rules.length, 0);
    assert.equal(error, MISSING_IPO_SHARE_RULE);
  });

  it('fails when the member is not on the selected share rule', () => {
    const { rules, error } = tryResolveShareRulesForMember(sampleRule, 999);
    assert.equal(rules.length, 0);
    assert.equal(error, MEMBER_NOT_ON_SHARE_RULE);
    assert.equal(isMemberOnShareRule(sampleRule, 101), true);
    assert.equal(isMemberOnShareRule(sampleRule, 999), false);
    assert.throws(() => assertMemberOnShareRule(sampleRule, 999), (err) => err.message === MEMBER_NOT_ON_SHARE_RULE);
    assert.throws(() => assertMemberOnShareRule(null, 101), (err) => err.message === MISSING_IPO_SHARE_RULE);
  });

  it('does not fall back to per-member rules when converting an IPO rule', () => {
    const converted = shareRuleToSplitRules(sampleRule);
    assert.equal(converted[0].ipoId, null);
    assert.equal(converted[0].profitProviderPercent, sampleRule.profitProviderPercent);
    assert.equal(converted[0].profitManagerPercent, sampleRule.profitManagerPercent);
  });

  const ruleA = {
    ...sampleRule,
    id: 11,
    ruleName: 'Retail 30%',
    memberIds: [101, 102],
    members: [{ memberId: 101, displayName: 'Amit' }, { memberId: 102, displayName: 'Bina' }],
  };
  const ruleB = {
    ...sampleRule,
    id: 12,
    ruleName: 'HNI 40%',
    profitProviderPercent: 40,
    profitManagerPercent: 20,
    memberIds: [201],
    members: [{ memberId: 201, displayName: 'Chetan' }],
  };
  const overlapping = {
    ...sampleRule,
    id: 13,
    ruleName: 'VIP 25%',
    memberIds: [102, 201],
    members: [{ memberId: 102, displayName: 'Bina' }, { memberId: 201, displayName: 'Chetan' }],
  };

  it('resolves each member to the one matching rule when several non-overlapping rules are selected', () => {
    const selected = [ruleA, ruleB];
    const forAmit = tryResolveShareRulesForMember(selected, 101);
    assert.equal(forAmit.error, null);
    assert.equal(forAmit.rules[0].id, 11);
    const forChetan = tryResolveShareRulesForMember(selected, 201);
    assert.equal(forChetan.error, null);
    assert.equal(forChetan.rules[0].id, 12);
  });

  it('rejects overlapping members across selected IPO rules', () => {
    const conflicts = findShareRuleConflicts([ruleA, overlapping]);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].memberId, 102);
    assert.match(formatShareRuleConflicts(conflicts), /Bina is on Retail 30% and VIP 25%/);
    const { rules, error } = tryResolveShareRulesForMember([ruleA, overlapping], 102);
    assert.equal(rules.length, 0);
    assert.match(error, new RegExp(CONTRADICTING_SHARE_RULES));
  });

  it('allows non-overlapping rules and still fails for members on none of them', () => {
    assert.equal(findShareRuleConflicts([ruleA, ruleB]).length, 0);
    const { error } = tryResolveShareRulesForMember([ruleA, ruleB], 999);
    assert.equal(error, MEMBER_NOT_ON_SHARE_RULE);
  });

  it('flags overlapping members in a share template', () => {
    const pack = mapSharePackRow({ id: 1, pack_name: 'Mix', sort_order: 0 }, [ruleA, overlapping]);
    assert.equal(pack.hasConflicts, true);
    assert.equal(pack.conflicts.length, 1);
    assert.equal(pack.packName, 'Mix');
  });

  it('allows a template of non-overlapping rules', () => {
    const pack = mapSharePackRow({ id: 2, pack_name: 'Retail + HNI', sort_order: 0 }, [ruleA, ruleB]);
    assert.equal(pack.hasConflicts, false);
    assert.deepEqual(pack.ruleIds, [11, 12]);
    assert.equal(pack.memberCount, 3);
  });
});
