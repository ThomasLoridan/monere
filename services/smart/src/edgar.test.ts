import { describe, it, expect } from 'vitest';
import { parse13FInfoTable, parseForm4 } from './edgar.js';

const INFO_TABLE_XML = `<?xml version="1.0"?>
<informationTable xmlns="http://www.sec.gov/edgar/document/thirteenf/informationtable">
  <infoTable>
    <nameOfIssuer>APPLE INC</nameOfIssuer>
    <cusip>037833100</cusip>
    <value>60000000000</value>
    <shrsOrPrnAmt><sshPrnamt>300000000</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt>
  </infoTable>
  <infoTable>
    <nameOfIssuer>APPLE INC</nameOfIssuer>
    <cusip>037833100</cusip>
    <value>1000000000</value>
    <shrsOrPrnAmt><sshPrnamt>5000000</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt>
  </infoTable>
  <infoTable>
    <nameOfIssuer>COCA COLA CO</nameOfIssuer>
    <cusip>191216100</cusip>
    <value>25000000000</value>
    <shrsOrPrnAmt><sshPrnamt>400000000</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt>
  </infoTable>
</informationTable>`;

describe('parse13FInfoTable', () => {
  it('extracts issuer, value and shares from real-format XML', () => {
    const rows = parse13FInfoTable(INFO_TABLE_XML);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      issuer: 'APPLE INC',
      cusip: '037833100',
      valueUsd: 60000000000,
      shares: 300000000,
    });
  });

  it('returns empty on non-13F content instead of inventing rows', () => {
    expect(parse13FInfoTable('<html>not a filing</html>')).toHaveLength(0);
  });
});

const FORM4_XML = `<?xml version="1.0"?>
<ownershipDocument>
  <reportingOwner>
    <reportingOwnerId><rptOwnerName>COOK TIMOTHY D</rptOwnerName></reportingOwnerId>
    <reportingOwnerRelationship><isOfficer>1</isOfficer><officerTitle>Chief Executive Officer</officerTitle></reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <transactionDate><value>2026-06-12</value></transactionDate>
      <transactionCoding><transactionCode>S</transactionCode></transactionCoding>
      <transactionAmounts>
        <transactionShares><value>150000</value></transactionShares>
        <transactionPricePerShare><value>231.40</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
  <footnotes><footnote id="F1">Sale pursuant to a Rule 10b5-1 trading plan.</footnote></footnotes>
</ownershipDocument>`;

describe('parseForm4', () => {
  it('extracts owner, role and transactions', () => {
    const parsed = parseForm4(FORM4_XML, 'https://sec.gov/x', '2026-06-14');
    expect(parsed).not.toBeNull();
    expect(parsed!.owner).toBe('COOK TIMOTHY D');
    expect(parsed!.role).toBe('Chief Executive Officer');
    expect(parsed!.isTenBFivePlan).toBe(true);
    expect(parsed!.transactions[0]).toMatchObject({
      date: '2026-06-12',
      code: 'S',
      shares: 150000,
      price: 231.4,
      acquired: false,
    });
  });

  it('returns null when no owner is present', () => {
    expect(parseForm4('<xml></xml>', 'u', 'd')).toBeNull();
  });
});
