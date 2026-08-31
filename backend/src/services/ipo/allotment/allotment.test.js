import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapShareAllotment,
  matchRegistrarCompany,
  parseMufgCompanyList,
  parseMufgSearchXml,
  scoreCompanyMatch,
  sharesToLots,
} from './parseAllotment.js';

describe('MUFG allotment XML', () => {
  it('parses the company dropdown feed', () => {
    const xml = `<NewDataSet>
      <Table><company_id>11926</company_id><companyname>Symbiotec Pharmalab Limited - IPO</companyname></Table>
      <Table><company_id>11925</company_id><companyname>Lumino Industries Limited - IPO</companyname></Table>
    </NewDataSet>`;
    const companies = parseMufgCompanyList(xml);
    assert.equal(companies.length, 2);
    const hit = matchRegistrarCompany(['Lumino Industries IPO', 'Lumino Industries'], companies);
    assert.equal(hit.companyId, '11925');
  });

  it('maps empty dataset to no record', () => {
    assert.equal(parseMufgSearchXml('<NewDataSet />').kind, 'empty');
  });

  it('maps registrar messages to retry', () => {
    const parsed = parseMufgSearchXml('<NewDataSet><Table1><Msg>Please try after some time</Msg></Table1></NewDataSet>');
    assert.equal(parsed.kind, 'message');
    assert.match(parsed.message, /try after/i);
  });

  it('maps allotted shares from Table rows', () => {
    const xml = `<NewDataSet><Table>
      <NAME1>TEST USER</NAME1><PEMNDG>123456</PEMNDG><SHARES>182</SHARES><ALLOT>182</ALLOT>
    </Table></NewDataSet>`;
    const parsed = parseMufgSearchXml(xml);
    assert.equal(parsed.kind, 'result');
    assert.equal(parsed.status, 'ALLOTED');
    assert.equal(parsed.allottedShares, 182);
    assert.equal(parsed.applicationNumber, '123456');
  });

  it('maps zero allotment as not allotted and partial when fewer shares', () => {
    assert.equal(mapShareAllotment(0, 182).status, 'NOT_ALLOTED');
    assert.equal(mapShareAllotment(91, 182).status, 'PARTIALLY_ALLOTTED');
    assert.equal(sharesToLots(182, 182), 1);
    assert.equal(sharesToLots(364, 182), 2);
  });

  it('does not match unrelated companies', () => {
    assert.equal(scoreCompanyMatch('Lumino Industries', 'Symbiotec Pharmalab Limited - IPO'), 0);
  });
});
