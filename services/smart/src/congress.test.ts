import { describe, it, expect } from 'vitest';
import { parseHouseXml } from './congress.js';

const HOUSE_XML = `<?xml version="1.0" encoding="utf-8"?>
<FinancialDisclosure>
  <Member>
    <Prefix />
    <Last>Pelosi</Last>
    <First>Nancy</First>
    <Suffix />
    <FilingType>P</FilingType>
    <StateDst>CA11</StateDst>
    <Year>2026</Year>
    <FilingDate>5/28/2026</FilingDate>
    <DocID>20026123</DocID>
  </Member>
  <Member>
    <Last>Smith</Last>
    <First>John</First>
    <FilingType>A</FilingType>
    <StateDst>TX01</StateDst>
    <Year>2026</Year>
    <FilingDate>4/10/2026</FilingDate>
    <DocID>10012345</DocID>
  </Member>
</FinancialDisclosure>`;

describe('parseHouseXml — official House disclosure index', () => {
  it('keeps only Periodic Transaction Reports (type P) with official PDF links', () => {
    const entries = parseHouseXml(HOUSE_XML, 2026);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      name: 'Nancy Pelosi',
      district: 'CA11',
      filing: {
        type: 'PTR',
        filed: '2026-05-28',
        year: 2026,
        docId: '20026123',
        disclosureUrl: 'https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/20026123.pdf',
      },
    });
  });

  it('returns nothing on unrelated XML rather than inventing filings', () => {
    expect(parseHouseXml('<xml><foo/></xml>', 2026)).toHaveLength(0);
  });
});
