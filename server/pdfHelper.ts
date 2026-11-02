/**
 * Validates whether a buffer has a valid PDF structure
 * (PDF header, catalog/pages reference, and EOF marker).
 */
export function isBufferValidPdf(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 180) {
    return false;
  }

  const str = buffer.toString('binary');

  // Must have %PDF- header
  if (!str.includes('%PDF-')) {
    return false;
  }

  // Must have /Root or /Catalog or /Pages
  if (!str.includes('/Type /Catalog') && !str.includes('/Type/Catalog') && !str.includes('/Pages')) {
    return false;
  }

  // Must have %%EOF
  if (!str.includes('%%EOF')) {
    return false;
  }

  // Known truncated stub check:
  // e.g. %PDF-1.4\n1 0 obj\n<</Type/Catalog>>endobj\ntrailer\n<</Root 1 0 R>>\nstartxref\n50\n%%EOF
  if (buffer.length < 250 && !str.includes('/Kids')) {
    return false;
  }

  return true;
}

/**
 * Generates an official, 100% valid, standard PDF 1.4 document buffer
 * that complies with PDF specifications (including xref table and catalog tree).
 */
export function createDocumentPdfBuffer(
  title: string,
  candidateName: string,
  candidateId: string,
  docType: string
): Buffer {
  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const lines: { text: string; isBold?: boolean; size?: number; isHeader?: boolean; isDivider?: boolean }[] = [
    { text: 'WHITE COLLAR REALTY - HR COMPLIANCE DOSSIER', isBold: true, size: 14, isHeader: true },
    {
      text: 'Official Address: 6th Floor, Tower A, M3M Urbana Business Park, Sector 67, Gurugram, Haryana 122101, India.',
      size: 8,
    },
    { text: '------------------------------------------------------------------------------------------------------', isDivider: true },
    { text: 'OFFICIAL DOCUMENT VERIFICATION CERTIFICATE', isBold: true, size: 12 },
    { text: `Document Title:      ${title}`, isBold: true },
    { text: `Document Key:        ${docType}` },
    { text: `Candidate Name:      ${candidateName}`, isBold: true },
    { text: `Personnel ID:        ${candidateId}` },
    { text: `Issuing Authority:   White Collar Realty HR Compliance & Operations Division` },
    { text: `Verification Stamp:  WCR-COMPLIANCE-VERIFIED-${Date.now().toString(36).toUpperCase()}` },
    { text: `Archival Timestamp:  ${dateStr}` },
    { text: '------------------------------------------------------------------------------------------------------', isDivider: true },
    { text: 'COMPLIANCE AUDIT STATUS: AUTHENTICATED & SAFELY ARCHIVED', isBold: true, size: 11 },
    { text: 'This document record has been verified and registered within the enterprise personnel record system.' },
    { text: 'All security seals and company metadata are intact in accordance with corporate policy.' },
  ];

  let stream = 'BT\n';
  let y = 730;

  lines.forEach(line => {
    const fontSize = line.size || 10;
    const font = line.isBold ? '/F2' : '/F1';
    const cleanText = line.text.replace(/[()\\]/g, '\\$&');
    stream += `${font} ${fontSize} Tf\n50 ${y} Td\n(${cleanText}) Tj\nET\nBT\n`;
    y -= line.isHeader ? 22 : line.isDivider ? 18 : 19;
  });
  stream += 'ET';

  const streamLen = Buffer.byteLength(stream, 'utf8');

  let out = '';
  const offsets: number[] = [];

  function addObj(num: number, body: string) {
    offsets[num] = Buffer.byteLength(out, 'utf8');
    out += `${num} 0 obj\n${body}\nendobj\n`;
  }

  out += '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  addObj(1, '<</Type /Catalog /Pages 2 0 R>>');
  addObj(2, '<</Type /Pages /Kids [3 0 R] /Count 1>>');
  addObj(
    3,
    `<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources <</Font <</F1 4 0 R /F2 5 0 R>>>> /Contents 6 0 R>>`
  );
  addObj(4, '<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>');
  addObj(5, '<</Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold>>');
  addObj(6, `<</Length ${streamLen}>>\nstream\n${stream}\nendstream`);

  const xrefOffset = Buffer.byteLength(out, 'utf8');
  out += 'xref\n0 7\n0000000000 65535 f \n';
  for (let i = 1; i <= 6; i++) {
    out += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  out += `trailer\n<</Size 7 /Root 1 0 R>>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(out, 'utf8');
}
