import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  ImageRun,
  PageBreak,
  ShadingType,
  Header,
  Footer,
  VerticalAlign,
  HeightRule,
  TableLayoutType,
  HorizontalPositionRelativeFrom,
  VerticalPositionRelativeFrom,
  TextWrappingType,
} from 'docx';
import fs from 'fs';
import path from 'path';
import type { OfferLetterData, CompensationLineItem } from '../src/types/index.ts';
import {
  WCR_ORIGINAL_OFFER_SECTIONS,
  formatSalutationName,
  formatOfferJoiningDate,
  summarizeCompensationComponents,
} from './lifecycleEngine.ts';

interface GenerateDocxOptions {
  assetsDir?: string;
}

const NONE_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NO_BORDERS = {
  top: NONE_BORDER,
  bottom: NONE_BORDER,
  left: NONE_BORDER,
  right: NONE_BORDER,
};

// Exact master template geometry: 486.75pt x 699.0pt (649px x 932px @ 96dpi)
const PAGE_WIDTH_TWIPS = 9735;
const PAGE_HEIGHT_TWIPS = 13980;
const MARGIN_LR_TWIPS = 1440; // 72pt
const CONTENT_WIDTH_TWIPS = PAGE_WIDTH_TWIPS - MARGIN_LR_TWIPS * 2; // 6855 twips (342.75pt)

function formatAmount(amount: number, market?: string): string {
  const rounded = Math.round(Number(amount) || 0);
  if (market === 'Dubai') {
    return `AED ${rounded.toLocaleString('en-US')}`;
  }
  return rounded.toLocaleString('en-IN');
}

function buildESignatureDashedTable(): Table {
  const leftRightWidth = 3150; // ~46% of 6855
  const spacerWidth = 555; // ~8% of 6855
  const dashedBorder = { style: BorderStyle.DASHED, size: 4, color: '8A8A8A' };

  const makeSignatureColumn = (label: string) =>
    new TableCell({
      width: { size: leftRightWidth, type: WidthType.DXA },
      borders: NO_BORDERS,
      margins: { top: 20, bottom: 20, left: 0, right: 60 },
      children: [
        new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { before: 0, after: 40, line: 200 },
          children: [
            new TextRun({
              text: label,
              font: 'Arial',
              size: 12, // 6pt
              bold: true,
              color: '1A1A1A',
            }),
          ],
        }),
        new Table({
          width: { size: leftRightWidth - 60, type: WidthType.DXA },
          layout: TableLayoutType.FIXED,
          columnWidths: [leftRightWidth - 60],
          rows: [
            new TableRow({
              height: { value: 260, rule: HeightRule.ATLEAST },
              children: [
                new TableCell({
                  width: { size: leftRightWidth - 60, type: WidthType.DXA },
                  borders: {
                    top: dashedBorder,
                    bottom: dashedBorder,
                    left: dashedBorder,
                    right: dashedBorder,
                  },
                  children: [
                    new Paragraph({
                      spacing: { before: 0, after: 0, line: 200 },
                      children: [new TextRun({ text: ' ', font: 'Arial', size: 11, color: '9A9A9A' })],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    });

  return new Table({
    width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [leftRightWidth, spacerWidth, leftRightWidth],
    borders: {
      ...NO_BORDERS,
      insideHorizontal: NONE_BORDER,
      insideVertical: NONE_BORDER,
    },
    rows: [
      new TableRow({
        children: [
          makeSignatureColumn('HR RECRUITER E-SIGNATURE'),
          new TableCell({
            width: { size: spacerWidth, type: WidthType.DXA },
            borders: NO_BORDERS,
            children: [new Paragraph({ children: [] })],
          }),
          makeSignatureColumn('EMPLOYEE E-SIGNATURE'),
        ],
      }),
    ],
  });
}

export async function generateWcrOfferLetterDocx(
  data: OfferLetterData,
  options: GenerateDocxOptions = {}
): Promise<Buffer> {
  const assetsRoot = options.assetsDir || path.resolve(process.cwd(), 'public/assets');
  const masterImagesDir = path.join(assetsRoot, 'offer_master_template/images');

  let page1BgBuffer: Buffer | null = null;
  let page2BgBuffer: Buffer | null = null;
  let stampImgBuffer: Buffer | null = null;

  try {
    const p1Path = path.join(masterImagesDir, 'image2.png');
    if (fs.existsSync(p1Path)) {
      page1BgBuffer = fs.readFileSync(p1Path);
    }
  } catch (e) {
    console.warn('[WordGenerator] Could not load master page 1 background:', e);
  }

  try {
    const p2Path = path.join(masterImagesDir, 'wcr_page2_watermark.png');
    if (fs.existsSync(p2Path)) {
      page2BgBuffer = fs.readFileSync(p2Path);
    }
  } catch (e) {
    console.warn('[WordGenerator] Could not load master page 2 watermark:', e);
  }

  try {
    const masterStampPath = path.join(masterImagesDir, 'image1.png');
    const fallbackStampPath = path.join(assetsRoot, 'wcr_blue_stamp.png');
    if (fs.existsSync(masterStampPath)) {
      stampImgBuffer = fs.readFileSync(masterStampPath);
    } else if (fs.existsSync(fallbackStampPath)) {
      stampImgBuffer = fs.readFileSync(fallbackStampPath);
    }
  } catch (e) {
    console.warn('[WordGenerator] Could not load stamp image:', e);
  }

  const rawName = (data.candidateName || '').trim();
  const displaySalutationName = formatSalutationName(rawName, data.salutation) || rawName || '[Candidate Name]';
  const displayDesignation = (data.designation || '').trim() || '[Designation]';
  const displayJoiningDate = formatOfferJoiningDate(data.joiningDate) || '[Joining Date]';
  const recruiterName = (data.recruiterName || 'Nisha').trim();
  const recruiterTitle = (data.recruiterTitle || 'Human Resources Recruiter').trim();
  const isAccepted = data.status === 'Accepted';
  const signedDate = data.signedAt ? new Date(data.signedAt).toLocaleDateString('en-GB') : '';

  // Resolve compensation components dynamically (supporting role structures + HR custom edits)
  const fallbackBasicMonthly = data.basicMonthly ?? data.salaryBreakup?.basicMonthly ?? 0;
  const fallbackPbvpMonthly = data.pbvpMonthly ?? 0;
  const fallbackRetentionMonthly = data.retentionBonusMonthly ?? 0;

  const activeComponents: CompensationLineItem[] =
    data.compensationComponents && data.compensationComponents.length > 0
      ? data.compensationComponents.filter(c => c.enabled)
      : [
          {
            id: 'comp-basic',
            code: 'basic',
            label: 'Basic',
            category: 'BASIC',
            monthlyAmount: fallbackBasicMonthly,
            yearlyAmount: data.basicYearly ?? fallbackBasicMonthly * 12,
            enabled: true,
          },
          {
            id: 'comp-pbvp',
            code: 'pbvp',
            label: 'PBVP',
            category: 'VARIABLE',
            monthlyAmount: fallbackPbvpMonthly,
            yearlyAmount: data.pbvpYearly ?? fallbackPbvpMonthly * 12,
            enabled: true,
          },
          {
            id: 'comp-retention',
            code: 'retention_bonus',
            label: 'Retention Bonus',
            category: 'VARIABLE',
            monthlyAmount: fallbackRetentionMonthly,
            yearlyAmount: data.retentionBonusYearly ?? fallbackRetentionMonthly * 12,
            enabled: true,
          },
        ];

  const compSummary = summarizeCompensationComponents(activeComponents, data.market || 'Gurgaon');
  const displayCtcFormatted = (data.ctcLpaFormatted || compSummary.ctcLpaFormatted).trim();
  const earningRows = activeComponents.filter(c => c.category !== 'DEDUCTION');
  const deductionRows = activeComponents.filter(c => c.category === 'DEDUCTION');

  // --- Typography Helpers matching CopyofSampleOfferLetter.html ---
  const pPage1Body = (runs: TextRun[], spacingAfter = 100, spacingBefore = 0) =>
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { before: spacingBefore, after: spacingAfter, line: 250 },
      children: runs,
    });

  const trBody = (text: string, bold = false, color = '333333', size = 17, italics = false) =>
    new TextRun({
      text,
      font: 'Arial',
      size, // 17 = 8.5pt
      bold,
      italics,
      color,
    });

  const sectionH2 = (title: string, color = '333333') =>
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      keepNext: true,
      spacing: { before: 200, after: 60, line: 276 },
      children: [
        new TextRun({
          text: title,
          font: 'Arial',
          size: 20, // 10pt
          bold: true,
          color,
        }),
      ],
    });

  const subSectionH3 = (title: string) =>
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      keepNext: true,
      spacing: { before: 120, after: 40, line: 276 },
      children: [
        new TextRun({
          text: title,
          font: 'Arial',
          size: 18, // 9pt
          bold: true,
          color: '333333',
        }),
      ],
    });

  const clauseParagraph = (text: string, after = 60) =>
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { before: 0, after, line: 276 },
      children: [trBody(text, false, '333333', 17)],
    });

  // Matches .c12 li-bullet-0 (margin-left: 36pt = 720 twips, hanging: 18pt = 360 twips)
  const bulletLevel0 = (boldLead: string, rest: string) => {
    const runs: TextRun[] = [trBody('●  ', false, '333333', 17)];
    if (boldLead) {
      runs.push(trBody(boldLead, true, '333333', 17));
    }
    runs.push(trBody(rest, false, '333333', 17));
    return new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      indent: { left: 720, hanging: 360 },
      spacing: { before: 0, after: 60, line: 276 },
      children: runs,
    });
  };

  // Matches .c38 sub-list (margin-left: 72pt = 1440 twips, hanging: 18pt = 360 twips)
  const subListItem = (marker: string, text: string) =>
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      indent: { left: 1440, hanging: 360 },
      spacing: { before: 0, after: 60, line: 276 },
      children: [trBody(`${marker}  `, false, '333333', 17), trBody(text, false, '333333', 17)],
    });

  // Dynamic renderer if HR customized a specific clause section in the modal
  const renderCustomSectionText = (rawText: string): Paragraph[] => {
    const paragraphs: Paragraph[] = [];
    const lines = rawText.split('\n');
    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;

      if (/^(\d+\.\d+\.?|ACKNOWLEDGEMENT AND ACCEPTANCE)/i.test(trimmed)) {
        paragraphs.push(subSectionH3(trimmed));
      } else if (trimmed.startsWith('●')) {
        const body = trimmed.replace(/^●\s*/, '');
        const colonIdx = body.indexOf(':');
        if (colonIdx > 0 && colonIdx < 65) {
          paragraphs.push(bulletLevel0(body.slice(0, colonIdx), body.slice(colonIdx)));
        } else {
          paragraphs.push(bulletLevel0('', body));
        }
      } else if (trimmed.startsWith('○')) {
        paragraphs.push(subListItem('○', trimmed.replace(/^○\s*/, '')));
      } else if (/^\d+\.\s+/.test(trimmed) && rawLine.startsWith(' ')) {
        const match = trimmed.match(/^(\d+\.)\s+(.*)$/);
        if (match) {
          paragraphs.push(subListItem(match[1], match[2]));
        } else {
          paragraphs.push(clauseParagraph(trimmed));
        }
      } else {
        paragraphs.push(clauseParagraph(trimmed));
      }
    }
    return paragraphs;
  };

  const isSectionModified = (sectionKey: string): boolean => {
    const custom = data.annexureSections?.[sectionKey];
    const orig = WCR_ORIGINAL_OFFER_SECTIONS[sectionKey]?.content;
    if (!custom || !orig) return false;
    return custom.trim() !== orig.trim();
  };

  // --- Signature Table Builder (Page 1 & Page 10) ---
  const buildSignatureBlock = (stampSizePx: number, isPage1: boolean): Table => {
    const leftColWidth = isPage1 ? 3100 : 4555;
    const rightColWidth = CONTENT_WIDTH_TWIPS - leftColWidth;

    const leftChildren: Paragraph[] = [];
    if (stampImgBuffer) {
      leftChildren.push(
        new Paragraph({
          spacing: { before: 40, after: 40 },
          children: [
            new ImageRun({
              data: stampImgBuffer,
              type: 'png',
              transformation: { width: stampSizePx, height: stampSizePx },
            }),
          ],
        })
      );
    } else {
      leftChildren.push(new Paragraph({ spacing: { before: 200, after: 200 }, children: [] }));
    }

    leftChildren.push(
      new Paragraph({
        spacing: { before: 80, after: 20, line: 200 },
        children: [trBody(isPage1 ? '___________________' : '________________', false, '333333', 15, isPage1)],
      }),
      new Paragraph({
        spacing: { before: 0, after: 20, line: 200 },
        children: [trBody(recruiterName, true, '1A1A1A', 18)],
      }),
      new Paragraph({
        spacing: { before: 0, after: 20, line: 200 },
        children: [trBody(recruiterTitle, false, '333333', 15)],
      }),
      new Paragraph({
        spacing: { before: 0, after: 40, line: 200 },
        children: [trBody('White Collar Realty', false, '333333', 15)],
      })
    );

    const rightIndentTwips = isPage1 ? 1500 : 0;
    const rightChildren: Paragraph[] = [
      new Paragraph({
        indent: { left: rightIndentTwips },
        spacing: { before: stampSizePx > 85 ? 920 : 820, after: 20, line: 200 },
        children: [
          isAccepted && data.candidateSignatureName
            ? trBody(data.candidateSignatureName, false, '1E3A8A', 18, true)
            : trBody(' ', false, '333333', 15),
        ],
      }),
      new Paragraph({
        indent: { left: rightIndentTwips },
        spacing: { before: 0, after: 20, line: 200 },
        children: [trBody(isPage1 ? '______________' : '____     __________', false, '333333', 15)],
      }),
      new Paragraph({
        indent: { left: rightIndentTwips },
        spacing: { before: 0, after: 20, line: 200 },
        children: [trBody(displaySalutationName, true, '1A1A1A', 18)],
      }),
      new Paragraph({
        indent: { left: rightIndentTwips },
        spacing: { before: 0, after: 20, line: 200 },
        children: [trBody('Employee', false, '333333', 15)],
      }),
      new Paragraph({
        indent: { left: rightIndentTwips },
        spacing: { before: 0, after: 40, line: 200 },
        children: [trBody(`Date: ${isAccepted && signedDate ? signedDate : ''}`, false, '333333', 15)],
      }),
    ];

    return new Table({
      width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      columnWidths: [leftColWidth, rightColWidth],
      borders: {
        ...NO_BORDERS,
        insideHorizontal: NONE_BORDER,
        insideVertical: NONE_BORDER,
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: leftColWidth, type: WidthType.DXA },
              borders: NO_BORDERS,
              verticalAlign: VerticalAlign.TOP,
              children: leftChildren,
            }),
            new TableCell({
              width: { size: rightColWidth, type: WidthType.DXA },
              borders: NO_BORDERS,
              verticalAlign: VerticalAlign.TOP,
              children: rightChildren,
            }),
          ],
        }),
      ],
    });
  };

  // --- Annexure 1.0 Compensation Table Builder ---
  const buildCompensationTable = (): Table => {
    const col1W = 3015; // ~160.7pt scaled cleanly across 6855 twips
    const col2W = 1920; // ~111pt
    const col3W = 1920; // ~111pt
    const cellBorder = { style: BorderStyle.SINGLE, size: 8, color: 'BBBBBB' };
    const allCellBorders = {
      top: cellBorder,
      bottom: cellBorder,
      left: cellBorder,
      right: cellBorder,
    };

    const makeCompRow = (
      col1Text: string,
      col2Text: string,
      col3Text: string,
      variant: 'HEADER' | 'ITEM' | 'SUMMARY'
    ): TableRow => {
      const fill = variant === 'HEADER' ? '1A1A1A' : variant === 'SUMMARY' ? 'E9E9E9' : 'FFFFFF';
      const textColor = variant === 'HEADER' ? 'FFFFFF' : '333333';
      const isBold = variant === 'HEADER' || variant === 'SUMMARY';

      const cell = (text: string, width: number) =>
        new TableCell({
          width: { size: width, type: WidthType.DXA },
          borders: allCellBorders,
          shading: { fill, type: ShadingType.CLEAR, color: 'auto' },
          margins: { top: 45, bottom: 45, left: 100, right: 80 },
          verticalAlign: VerticalAlign.TOP,
          children: [
            new Paragraph({
              alignment: AlignmentType.LEFT,
              spacing: { before: 0, after: 0, line: 220 },
              children: [trBody(text, isBold, textColor, 17)],
            }),
          ],
        });

      return new TableRow({
        children: [cell(col1Text, col1W), cell(col2Text, col2W), cell(col3Text, col3W)],
      });
    };

    const rows: TableRow[] = [
      makeCompRow('Salary Components', 'Monthly Segregation', 'Yearly Segregation', 'HEADER'),
    ];

    earningRows.forEach(item => {
      rows.push(
        makeCompRow(
          item.label,
          formatAmount(item.monthlyAmount, data.market),
          formatAmount(item.yearlyAmount, data.market),
          'ITEM'
        )
      );
    });

    rows.push(
      makeCompRow(
        'CTC',
        formatAmount(compSummary.monthlyCtc, data.market),
        formatAmount(compSummary.annualCtc, data.market),
        'SUMMARY'
      )
    );

    if (deductionRows.length > 0) {
      deductionRows.forEach(ded => {
        rows.push(
          makeCompRow(
            `Less: ${ded.label}`,
            formatAmount(ded.monthlyAmount, data.market),
            formatAmount(ded.yearlyAmount, data.market),
            'ITEM'
          )
        );
      });
      rows.push(
        makeCompRow(
          'Net Take-Home Pay (Approx.)',
          formatAmount(compSummary.netPayMonthly, data.market),
          formatAmount(compSummary.netPayYearly, data.market),
          'SUMMARY'
        )
      );
    }

    return new Table({
      width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      columnWidths: [col1W, col2W, col3W],
      rows,
    });
  };

  // --- Acknowledgement Table Builder (Page 9) ---
  const buildAcknowledgementTable = (): Table => {
    const col1W = 2350; // ~34.3%
    const col2W = CONTENT_WIDTH_TWIPS - col1W; // ~65.7%
    const ackBorder = { style: BorderStyle.SINGLE, size: 8, color: 'BFBFBF' };
    const ackBorders = {
      top: ackBorder,
      bottom: ackBorder,
      left: ackBorder,
      right: ackBorder,
    };
    const blankLine = '____________________________________________';

    const desigWithMeta = [
      data.designation?.trim(),
      data.department?.trim() ? `${data.department.trim()}` : '',
      data.employmentType?.trim() ? `${data.employmentType.trim()}` : '',
    ]
      .filter(Boolean)
      .join(' · ');

    const wl = (data.workLocation || '').trim();
    const pl = (data.place || '').trim();
    const resolvedPlace = wl
      ? pl && !wl.toLowerCase().includes(pl.split(',')[0].trim().toLowerCase())
        ? `${wl} (${pl})`
        : wl
      : pl;

    const ackData: Array<[string, string]> = [
      ['Employee Name', rawName ? displaySalutationName : blankLine],
      ['Designation', desigWithMeta || blankLine],
      ['Signature', isAccepted && data.candidateSignatureName ? data.candidateSignatureName : blankLine],
      ['Date', isAccepted && signedDate ? signedDate : blankLine],
      ['Place', resolvedPlace || blankLine],
    ];

    return new Table({
      width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      columnWidths: [col1W, col2W],
      rows: ackData.map(
        ([label, val]) =>
          new TableRow({
            height: { value: 424, rule: HeightRule.ATLEAST }, // 21.2pt
            children: [
              new TableCell({
                width: { size: col1W, type: WidthType.DXA },
                borders: ackBorders,
                margins: { top: 90, bottom: 90, left: 100, right: 100 },
                verticalAlign: VerticalAlign.CENTER,
                children: [
                  new Paragraph({
                    spacing: { before: 0, after: 0, line: 230 },
                    children: [trBody(label, true, '333333', 17)],
                  }),
                ],
              }),
              new TableCell({
                width: { size: col2W, type: WidthType.DXA },
                borders: ackBorders,
                margins: { top: 90, bottom: 90, left: 100, right: 100 },
                verticalAlign: VerticalAlign.CENTER,
                children: [
                  new Paragraph({
                    spacing: { before: 0, after: 0, line: 230 },
                    children: [trBody(val, false, '333333', 17)],
                  }),
                ],
              }),
            ],
          })
      ),
    });
  };

  // --- Assemble Document Body ---
  const docChildren: (Paragraph | Table)[] = [];

  // ==================== PAGE 1 ====================
  docChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      // Positions "Offer Letter" cleanly below the dark wave header of image2.png
      spacing: { before: 1280, after: 130, line: 240 },
      children: [
        new TextRun({
          text: 'Offer Letter',
          font: 'Arial',
          size: 30, // 15pt
          bold: true,
          color: '1A1A1A',
        }),
      ],
    }),
    pPage1Body([trBody(`Dear ${displaySalutationName},`, true, '333333', 17)], 100),
    pPage1Body(
      [
        trBody(
          'Congratulations! We are pleased to confirm that you have been selected to work for the position of '
        ),
        trBody(displayDesignation, true),
        trBody(' for '),
        trBody('White Collar Realty', true),
        trBody('.'),
      ],
      100
    ),
    pPage1Body(
      [
        trBody('We would like you to start work on '),
        trBody(displayJoiningDate, true),
        trBody(
          '. If this date is not acceptable, please contact us immediately. We are offering you a salary of '
        ),
        trBody(displayCtcFormatted, true),
        trBody('.'),
      ],
      100
    ),
    pPage1Body(
      [
        trBody(
          'Please sign this letter to indicate your acceptance of this offer. We are confident you will be able to make a significant contribution to the success of the organization and look forward to working with you.'
        ),
      ],
      100
    ),
    pPage1Body(
      [
        trBody(
          'This offer is conditional. The Company reserves the right to withdraw this offer at any time before your date of joining, without any liability, including where background verification is unsatisfactory, required documents are not submitted, or you do not join on the agreed start date. This offer, together with Annexure 1.0, forms the complete terms of your engagement.'
        ),
      ],
      100
    ),
    pPage1Body([trBody('Sincerely,')], 80, 80),
    buildSignatureBlock(92, true),
    new Paragraph({ spacing: { before: 120, after: 40 }, children: [] }),
    buildESignatureDashedTable(),
    new Paragraph({ children: [new PageBreak()] })
  );

  // ==================== PAGES 2–10 ====================
  docChildren.push(
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { before: 0, after: 120, line: 260 },
      children: [
        new TextRun({
          text: 'ANNEXURE 1.0 – COMPENSATION STRUCTURE',
          font: 'Arial',
          size: 20, // 10pt
          bold: true,
          color: '1A1A1A',
        }),
      ],
    }),
    buildCompensationTable()
  );

  // Section 1
  docChildren.push(sectionH2('1. Performance Based Variable Pay (PBVP)'));
  if (isSectionModified('section_1')) {
    docChildren.push(...renderCustomSectionText(data.annexureSections!.section_1));
  } else {
    docChildren.push(
      clauseParagraph(
        'PBVP is a performance-linked variable component of your CTC and is not a fixed monthly entitlement.'
      ),
      bulletLevel0('Eligibility', ': Becomes payable only if monthly revenue of AED 50,000 is earned.'),
      bulletLevel0(
        'Exclusions',
        ': Cancelled bookings, refunded bookings, fraudulent transactions, transactions violating Company policy, or bookings later found to be ineligible do not qualify.'
      ),
      bulletLevel0(
        'Verification & Discretion',
        ': PBVP shall be processed only after internal verification. The Company reserves the right to withhold, adjust, recover, or reverse PBVP in the event of cancellation, fraud, customer refund, policy violation, or duplicate claims. It does not create any permanent entitlement, and the Company’s decision shall be final and binding.'
      )
    );
  }

  // Section 2
  docChildren.push(sectionH2('2. Retention Bonus'));
  if (isSectionModified('section_2')) {
    docChildren.push(...renderCustomSectionText(data.annexureSections!.section_2));
  } else {
    docChildren.push(
      bulletLevel0(
        'Eligibility',
        ': Payable only after completion of one year of service, on yearly revenue of AED 5,00,000'
      ),
      bulletLevel0(
        'Exceptions & Notice Period',
        ': Employees who resign, abandon employment, or are terminated before completing one year will not be eligible. Employees serving a notice period beyond one year must satisfy all exit formalities and policy requirements.'
      ),
      bulletLevel0(
        'Forfeiture',
        ': Disciplinary proceedings, fraud, misconduct, policy violation, or financial liability towards the Company may result in withholding or forfeiture. The policy may be modified or discontinued prospectively.'
      )
    );
  }

  // Section 3
  docChildren.push(sectionH2('3. Sales Incentive Policy'));
  if (isSectionModified('section_3')) {
    docChildren.push(...renderCustomSectionText(data.annexureSections!.section_3));
  } else {
    docChildren.push(
      clauseParagraph(
        'The Employee shall become eligible for any Sales Incentive, Performance Bonus, Commission, or any other performance-linked payout only after the Company has successfully received its brokerage/commission from the respective transaction. Accordingly, no incentive, commission, or performance-linked payment shall be payable under, including but not limited to, the following circumstances:'
      ),
      bulletLevel0(
        '',
        'The customer cancels, terminates, withdraws, or fails to proceed with the booking/transaction for any reason whatsoever.'
      ),
      bulletLevel0(
        '',
        'The customer defaults, delays, or fails to make the payment(s) required under the payment plan or as demanded by the developer.'
      ),
      bulletLevel0('', 'The transaction is put on hold, remains incomplete, or is not successfully concluded.'),
      bulletLevel0(
        '',
        'The Company has not received its brokerage, commission, revenue share, or any other receivable from the developer, channel partner, or any other concerned party, irrespective of the reason.'
      ),
      bulletLevel0(
        '',
        'Any booking is subsequently reversed, refunded, cancelled, or declared ineligible by the developer or any competent authority.'
      ),
      clauseParagraph(
        'The Company’s records regarding receipt of brokerage/commission and the successful completion of the transaction shall be final and binding for determining the Employee’s eligibility for incentive payouts. No incentive shall accrue merely on the basis of booking generation or booking confirmation unless the Company’s brokerage/commission has been duly realized.'
      )
    );
  }

  // Section 4
  const probationText =
    data.probationMonths && data.probationMonths !== 6
      ? `${data.probationMonths} months`
      : 'six (6) months';
  docChildren.push(sectionH2('4. Review, Probation & Confirmation'));
  if (isSectionModified('section_4')) {
    docChildren.push(...renderCustomSectionText(data.annexureSections!.section_4));
  } else {
    docChildren.push(
      bulletLevel0(
        '10-Day Reviewal Period',
        ': You will be on a reviewal period for 10 days from your date of joining. Underperformance, inappropriate behavior, disciplinary issues, experience mismatch, false documents, or gross misconduct during this time may result in immediate termination without salary. Appointment letters are issued post-review.'
      ),
      bulletLevel0(
        'Probation Duration',
        `: Initially, you will be on probation for ${probationText}. Evaluation covers performance, attendance, conduct, technical learning, discipline, and communication skills.`
      ),
      bulletLevel0(
        'Confirmation & Extension',
        ': Confirmation is subject to satisfactory results and formal written approval; it is not automatic upon time completion. Probation may be extended if performance does not meet organizational standards.'
      ),
      bulletLevel0(
        'Performance Improvement Plan (PIP)',
        ': The Company may place an underperforming employee on a PIP. Failure to complete the PIP successfully within the prescribed timeline may result in termination.'
      ),
      bulletLevel0(
        'Termination During Probation',
        ': Notice for termination during probation is as stated under Section 9 (Termination & Summary Dismissal).'
      )
    );
  }

  // Section 5
  docChildren.push(sectionH2('5. Working Hours & Office Discipline'));
  if (isSectionModified('section_5')) {
    docChildren.push(...renderCustomSectionText(data.annexureSections!.section_5));
  } else {
    docChildren.push(
      bulletLevel0(
        'Schedule',
        ': Standard working hours are 10:00 AM to 7:00 PM, Tuesday to Sunday (6 days a week), inclusive of a 30-minute lunch break, a 15-minute morning break, and a 15-minute evening break.'
      ),
      bulletLevel0(
        'Weekly Off',
        ": The designated weekly off is Monday. If a client meeting, site visit, or transaction-related work falls on the weekly off, the employee shall attend as per the client's availability, at the office or on-site. Such attendance does not carry overtime. Compensatory off, if any, is at the reporting manager's discretion."
      ),
      bulletLevel0(
        'Flexibility & Overtime',
        ': Schedules may require working early, late, or occasionally on week-offs/holidays depending on business requirements. No overtime payment will be provided.'
      ),
      bulletLevel0('Dress Code / Formal Wear Policy', ': Formal business attire is mandatory during office hours.'),
      bulletLevel0(
        'Code of Conduct',
        ": Employees must maintain professional behavior, workplace ethics, business etiquette, and respect for colleagues/clients. Employees shall follow instructions from reporting managers and refrain from office politics, rumor spreading, disruptive behavior, discrimination, harassment, unauthorized photography/videography, or damaging the Company's reputation."
      )
    );
  }

  // Section 6
  docChildren.push(sectionH2('6. Late Entry & Early Leaving Policy'));
  if (isSectionModified('section_6')) {
    docChildren.push(...renderCustomSectionText(data.annexureSections!.section_6));
  } else {
    docChildren.push(
      bulletLevel0('Standard Reporting Time', ': Strictly 10:00 AM.'),
      bulletLevel0(
        'Late Penalty',
        ': Arrival after 10:15 AM results in a half-day leave deduction. There is no flexibility beyond 10:15 AM.'
      ),
      bulletLevel0(
        'Exceptions',
        ': A maximum of three (3) monthly exceptions for late entry/early exit are permitted, subject to department head approval.'
      ),
      bulletLevel0(
        'Procedure',
        ': Any late arrival requires written permission from the manager and an update in the designated group stating the reason and estimated time of arrival (ETA).'
      )
    );
  }

  // Section 7
  docChildren.push(sectionH2('7. Leave Policy'));
  if (isSectionModified('section_7')) {
    docChildren.push(...renderCustomSectionText(data.annexureSections!.section_7));
  } else {
    docChildren.push(
      subSectionH3('7.1. Casual Leave (CL)'),
      bulletLevel0(
        'Entitlement',
        ': 12 CLs per year (1 paid leave per month) awarded only after probation completion. This is inclusive of all casual and medical leaves.'
      ),
      subSectionH3('7.2. Carry Forward Leaves (CFL)'),
      bulletLevel0(
        'Carry Forward',
        ': Unused CL can be carried forward up to the end of that financial year. Leave encashment is available after the financial year completes. Taking CFL requires written approval from the manager 2 days prior.'
      ),
      subSectionH3('7.3. Probation Paid Leave'),
      bulletLevel0('', 'No paid leaves are granted during probation.'),
      subSectionH3('7.4. Emergency Leave'),
      bulletLevel0(
        '',
        'Must be informed and acknowledged before 10:00 AM on the same working day via call/official message to the Reporting Manager and HR.'
      ),
      bulletLevel0(
        '',
        'Intimation after office hours begin or absence without confirmation will be treated as unapproved leave. A written email with reason and proof must be submitted on the next working day.'
      ),
      subSectionH3('7.5. Sick Leave'),
      bulletLevel0(
        'Sick Leave',
        ' is availed from the Casual Leave entitlement under 7.1 (no separate sick-leave quota). Sick leave exceeding 2 days requires submission of medical records for approval.'
      ),
      subSectionH3('7.6. Unplanned Leave & Sandwich Policy'),
      bulletLevel0(
        'Sandwich Policy',
        ": Unplanned leave taken immediately before and/or after a weekly off (Monday)/holiday shall cause the weekly off/holiday to be counted as unpaid leave (2 days' deduction). Leave must be pre-approved via email at least 10 days in advance."
      ),
      bulletLevel0('Extended Absence', ': Absences exceeding 5 days void paid week-off salary.'),
      bulletLevel0(
        'Restricted Period',
        ': No leave is allowed for 3 days immediately before and after salary release; any taken will be marked unapproved.'
      ),
      bulletLevel0('Advance Notice Requirements', ':'),
      subListItem('○', '1 day leave: Apply at least 1–2 days prior.'),
      subListItem('○', '2 days leave: Apply at least 4 days in advance.'),
      subSectionH3('7.7. Planned Leave'),
      bulletLevel0(
        '',
        'Planned leaves (travel, marriage, exams) must be applied for at least 30 days in advance. Unapproved leaves are treated as unauthorized.'
      )
    );
  }

  // Section 8
  docChildren.push(sectionH2('8. Conflict of Interest, Non-Solicitation & Client Diversion'));
  if (isSectionModified('section_8')) {
    docChildren.push(...renderCustomSectionText(data.annexureSections!.section_8));
  } else {
    docChildren.push(
      bulletLevel0(
        'Exclusive Employment & Office-Hours Discipline',
        ': The employee shall devote full working time to the Company. Personal calls and personal WhatsApp/messaging are not permitted during office hours; any employee found engaged in personal calls or chats during office hours shall face disciplinary action. During the tenure of employment, the employee shall not freelance or take up any secondary work (paid or unpaid), and shall not book, close, route, or process any property transaction, booking, or payment outside the Company, whether directly with any developer or with any other broker or channel partner. Any such act shall be treated as a fundamental breach, and the Company may terminate employment with immediate effect, without notice, with forfeiture of all pending incentives.'
      ),
      bulletLevel0(
        'Professional Integrity & Client Relations',
        ': Diverting Company clients, enquiries, or leads to any external party or builder, or accepting any unauthorized external commission, is a breach of professional ethics and may lead to disciplinary action up to and including termination and legal measures.'
      ),
      bulletLevel0(
        'Non-Solicitation & Enforcement (Post-Separation)',
        ': For 12 months following separation, the former employee is strictly prohibited from contacting, soliciting, or servicing any clients, leads, or business contacts associated with White Collar Realty for personal gain or the benefit of any other entity. Any such misuse or diversion constitutes a material breach of this agreement. The Company reserves the right to seek injunctive relief and claim financial damages for any such breach.'
      ),
      bulletLevel0(
        'Client Communication Channels',
        ': All client, investor, and lead communication (calls, WhatsApp, messages, email) shall be conducted only through the Company-provided number, email, and CRM. Use of a personal mobile number, personal WhatsApp, or personal email for client contact is prohibited. All clients, contacts, and chat histories generated through Company work are Company property and shall be handed over in full, along with the Company number, on exit.'
      )
    );
  }

  // Section 9
  docChildren.push(sectionH2('9. Termination & Summary Dismissal'));
  if (isSectionModified('section_9')) {
    docChildren.push(...renderCustomSectionText(data.annexureSections!.section_9));
  } else {
    docChildren.push(
      bulletLevel0('Notice by the Company', ': Where the Company terminates employment (other than summary dismissal):'),
      subListItem('1.', "Regular Employees: 7 days' prior notice."),
      subListItem('2.', "Probationary Employees: 24 hours' notice."),
      bulletLevel0(
        'Performance Benchmark (First 3 Months)',
        ': Failure to achieve at least one (1) sales closure within the first three (3) months of joining entitles the Company to terminate employment immediately without further obligation.'
      ),
      bulletLevel0(
        'Summary Dismissal (Immediate Termination Without Notice)',
        ': Accumulating three (3) written warnings may trigger termination. However, immediate termination without notice may occur for:'
      ),
      subListItem('1.', 'Gross misconduct, gross negligence, or fundamental breach of contract.'),
      subListItem('2.', 'Unlawful communication of confidential Company business or data theft.'),
      subListItem('3.', 'Dishonesty, moral turpitude, or financial fraud/misconduct.'),
      subListItem('4.', 'Falsification or concealment of resume details or background documents.'),
      subListItem('5.', 'Physical or mental medical unfitness.'),
      subListItem('6.', 'Absconding or unauthorized absence as defined under Section 10 (Unannounced Absence Policy).'),
      subListItem(
        '7.',
        'Engaging in unauthorized side employment/business, freelancing, or routing any property transaction outside the Company (directly with a developer, broker, or channel partner).'
      ),
      subListItem(
        '8.',
        "Unethical behavior, harassment, violence, client diversion, or damaging the Company's image/reputation."
      ),
      subListItem('9.', 'Habitual indiscipline, repeated late reporting, or failure of PIP.')
    );
  }

  // Section 10
  docChildren.push(sectionH2('10. Unannounced Absence Policy'));
  if (isSectionModified('section_10')) {
    docChildren.push(...renderCustomSectionText(data.annexureSections!.section_10));
  } else {
    docChildren.push(
      bulletLevel0(
        'Definition',
        ': An absence of three (3) or more consecutive working days without prior approval or communication shall be treated as voluntary departure from the role. This includes failure to participate in transition responsibilities or leaving before the first salary credit during the initial training period.'
      ),
      bulletLevel0(
        'Consequences',
        ': Such departure shall be treated as job abandonment, resulting in termination of employment and forfeiture of pending dues and incentives. No relieving documentation shall be issued. All Company property must be returned within 7 days, failing which the Company may initiate legal recovery.'
      )
    );
  }

  // Section 11
  docChildren.push(sectionH2('11. Prevention of Sexual Harassment (POSH)'));
  if (isSectionModified('section_11')) {
    docChildren.push(...renderCustomSectionText(data.annexureSections!.section_11));
  } else {
    docChildren.push(
      clauseParagraph(
        'White Collar Realty enforces a strict zero-tolerance policy against workplace sexual harassment. Mandatory compliance with the Company’s POSH Policy and participation in POSH awareness training are required for all employees.'
      )
    );
  }

  // Section 12
  docChildren.push(sectionH2('12. Document Verification & Company Property'));
  if (isSectionModified('section_12')) {
    docChildren.push(...renderCustomSectionText(data.annexureSections!.section_12));
  } else {
    docChildren.push(
      bulletLevel0(
        'Document Verification',
        ': Employment is subject to satisfactory background verification of identity, education, experience, address, and employment history. Submitting false information will result in immediate offer withdrawal or termination.'
      ),
      bulletLevel0(
        'Return of Property',
        ": Upon resignation, termination, or exit clearance, the employee must return all Company assets including laptops, SIM cards, official emails, CRM access, keys, access cards, marketing materials, and physical files, in good working condition. If any Company asset is not returned, or is lost, stolen, broken, or damaged (beyond normal wear and tear) while in the employee's custody, the employee shall be liable to pay its replacement or repair cost as determined by the Company, and the Company may recover this amount from the employee's salary, incentives, or Full & Final settlement, to the extent permitted by law."
      )
    );
  }

  // Section 13
  const noticeDays = data.noticePeriodDays || 45;
  docChildren.push(sectionH2('13. Exit Process, Notice Period & Full & Final (F&F) Settlement'));
  if (isSectionModified('section_13')) {
    docChildren.push(...renderCustomSectionText(data.annexureSections!.section_13));
  } else {
    docChildren.push(
      bulletLevel0(
        'Notice by the Employee',
        `: Resigning employees must provide ${noticeDays} working days' written notice. No leaves are permitted during the notice period (granted leaves will extend the notice period by the same duration).`
      ),
      bulletLevel0(
        'Early Release & Buyout',
        `: Early release is solely at the Company's discretion, subject to deducting salary equivalent to the unserved days or charging ${noticeDays} working days' salary as compensation for financial loss.`
      ),
      bulletLevel0(
        'Garden Leave',
        ': The Company may place the employee on Garden Leave during the notice period, during which confidentiality and non-solicitation obligations remain active.'
      ),
      bulletLevel0(
        'F&F Settlement',
        `: Full and Final settlement is processed after ${noticeDays} working days from leaving, subject to complete exit clearance, department clearance, handover completion, and full asset return. Failure to serve the notice period, absconding, or failing to return Company assets gives the Company the right to withhold F&F settlements, relieving letters, and unpaid salaries.`
      )
    );
  }

  // Section 14
  docChildren.push(sectionH2('14. Confidentiality, Client data protection and non-disclosure obligations'));
  if (isSectionModified('section_14')) {
    docChildren.push(...renderCustomSectionText(data.annexureSections!.section_14));
  } else {
    docChildren.push(
      clauseParagraph(
        'As part of your role with White Collar Realty, you may be provided access to sensitive and confidential information relating to the Company, its clients, investors, prospects, employees, channel partners, developers, vendors and business operations. You acknowledge that such access is provided strictly for authorised Company work and is subject to the following obligations.'
      ),
      subSectionH3('14.1 Confidential Information'),
      clauseParagraph(
        '“Confidential Information” includes, without limitation, client and investor names, phone numbers, email addresses, contact details, identity information, investment history, properties owned or considered, budgets, transaction values, booking or payment information, portfolio information, investor classification, CRM records, lead databases, cold data, buyer data, spreadsheets, reports, dashboards, call notes, WhatsApp or email records, recordings, meeting notes, site-visit records, internal remarks, project-wise client lists, pricing intelligence, inventories, negotiated terms, brokerage information, business information, source data, analytics, formulas, scripts, system access details, credentials, internal procedures and any information that is marked confidential or would reasonably be understood to be confidential or non-public.'
      ),
      subSectionH3('14.2 Strict Need-to-Know Access and Internal Confidentiality'),
      clauseParagraph(
        'You shall access and use Confidential Information only to the minimum extent required for the task assigned to you. You shall not disclose, discuss, show, forward, copy or otherwise make Confidential Information available to any unauthorised person, including any colleague, intern, employee, manager, contractor or other person within the office unless that person is specifically authorised and requires the information for a legitimate assigned business purpose.'
      ),
      subSectionH3('14.3 No External Disclosure or Personal Use'),
      clauseParagraph(
        'You shall not share, disclose, transfer, sell, exploit or use Confidential Information for your own benefit or for the benefit of any relative, friend, competitor, broker, agent, employer, future employer, business, developer, channel partner, client or third party. You shall not independently contact, solicit, divert, approach, market to, transact with or attempt to monetise any Company client, investor, lead or prospect except where expressly instructed and authorised as part of your Company duties.'
      ),
      subSectionH3('14.4 No Unauthorised Copying, Downloading or Storage'),
      clauseParagraph(
        'Unless specifically authorised in writing by the Company, you shall not copy, export, download, print, photograph, screenshot, screen-record, email, WhatsApp, AirDrop, upload, sync, back up, transfer or store Confidential Information on any personal phone, personal laptop, personal email account, personal cloud drive, USB device, messaging application, external storage, public website or any other unapproved system.'
      ),
      subSectionH3('14.5 Use of AI Tools, Analytics Platforms and Third-Party Applications'),
      clauseParagraph(
        'You shall not upload, paste, enter or expose identifiable client or investor data, CRM exports, phone numbers, email addresses, financial or investment information, passwords, Company datasets or proprietary information into any public or unapproved artificial-intelligence tool, analytics platform, code repository, file-sharing service or third-party application. Any Company-approved tool may be used only within the scope and safeguards specifically authorised by the Company.'
      ),
      subSectionH3('14.6 Data Minimisation, Masking and Security'),
      clauseParagraph(
        'Where full client identity is not required for analysis or testing, you shall use masked, pseudonymised or dummy values as directed by the Company. You shall comply with all Company access controls, password requirements, security instructions and data-handling procedures and shall not attempt to bypass permissions or access data outside your assigned scope.'
      ),
      subSectionH3('14.7 No Unauthorised Client or Investor Contact'),
      clauseParagraph(
        'Client or investor contact details obtained through Company work shall not be used for personal calls, messages, social-media contact, referrals, introductions, independent sales, future business or any other purpose not expressly authorised by the Company.'
      ),
      subSectionH3('14.8 Immediate Reporting of Data or Security Incidents'),
      clauseParagraph(
        'You must immediately report to the Company any suspected or actual loss, unauthorised access, accidental disclosure, misdirected message or email, stolen or lost device, compromised password, unauthorised download or export, phishing incident or any other event that may affect Confidential Information. You shall preserve relevant evidence and fully cooperate with the Company in investigation, containment, remediation and any legal or compliance action.'
      ),
      subSectionH3('14.9 Return, Deletion and Cessation of Access'),
      clauseParagraph(
        'Upon completion of an assigned task, suspension, resignation, termination, expiry of employment, or whenever requested by the Company, you shall immediately cease access to Company systems, return all Company property and records, and permanently delete any Company data stored in any authorised temporary location. You shall not retain any copy, extract, summary, photograph, screenshot, client contact, report, dataset, derivative data, model or reconstruction of Company information and shall provide written confirmation of deletion or return if required.'
      ),
      subSectionH3('14.10 Continuing Obligation After Exit'),
      clauseParagraph(
        'These confidentiality and data-protection obligations shall continue during your employment and shall survive resignation, termination, completion or expiry of your engagement. You shall continue to protect client and investor information, credentials, trade secrets and other non-public Company information for so long as such information remains confidential, proprietary or legally protected.'
      ),
      subSectionH3('14.11 Ownership of Data and Work Product'),
      clauseParagraph(
        'All Company-provided data and all datasets, cleaned or merged files, analyses, dashboards, reports, findings, data dictionaries, scripts, queries, transformations, documentation and other work product created by you in the course of Company work shall belong to the Company to the extent permitted by applicable law and the terms of your engagement. You shall have no right to retain, reuse, publish, disclose, sell or commercially exploit such material.'
      ),
      subSectionH3('14.12 Breach, Disciplinary Action and Legal Remedies'),
      clauseParagraph(
        'Any actual or suspected breach of these obligations may result in immediate restriction or suspension of access, disciplinary action, termination of employment, preservation of digital evidence, internal investigation and legal action as permitted by applicable law. The Company may seek appropriate civil, contractual, statutory and equitable remedies, including injunctions or other preventive relief, recovery of legally recoverable losses or damages and any other remedy available under law.'
      ),
      subSectionH3('14.13 Indemnity'),
      clauseParagraph(
        'To the extent permitted by applicable law, you shall be responsible for and shall indemnify the Company against direct losses, liabilities, claims, costs and expenses actually arising from your wilful misconduct, fraud, unauthorised disclosure, unauthorised use, deliberate data misuse or material breach of these obligations, subject to determination under applicable law.'
      ),
      subSectionH3('14.14 Lawful Disclosures'),
      clauseParagraph(
        'Nothing in these obligations prevents a disclosure expressly required by applicable law, a binding order of a competent court or lawful authority, or a protected disclosure that cannot legally be restricted. Where legally permitted, you shall promptly inform the Company before such disclosure and shall disclose only the minimum information legally required.'
      ),
      subSectionH3('14.15 Future Employment'),
      clauseParagraph(
        'Nothing in these clauses is intended to prohibit you from pursuing lawful future employment, profession, trade or business. However, no future employment or engagement gives you any right to use, retain, disclose or exploit White Collar Realty’s Confidential Information, client or investor information, proprietary data or trade secrets.'
      ),
      subSectionH3('14.16 Applicable Law and Jurisdiction'),
      clauseParagraph(
        'You shall comply with applicable Indian data-protection, privacy, information-technology, cybersecurity and contractual requirements, together with Company policies and instructions. These obligations shall be governed by the laws of India and, subject to any dispute-resolution provision elsewhere in your offer letter or employment/internship terms, courts having competent jurisdiction at Gurugram, Haryana shall have jurisdiction.'
      )
    );
  }

  // Acknowledgement and Acceptance (Page 9)
  docChildren.push(
    subSectionH3('ACKNOWLEDGEMENT AND ACCEPTANCE'),
    clauseParagraph(
      'I confirm that I have read and understood the above Confidentiality, Client Data Protection and Non-Disclosure Obligations. I understand the sensitivity of the client, investor and Company information that may be made available to me and agree to comply fully with these obligations during and after my employment. I understand that access to Company and client data is conditional upon my continuing compliance with these obligations.',
      120
    ),
    buildAcknowledgementTable(),
    new Paragraph({ children: [new PageBreak()] })
  );

  // ==================== PAGE 10 ====================
  docChildren.push(sectionH2('15. Acceptance & Signatures', '1A1A1A'));
  if (isSectionModified('section_15')) {
    docChildren.push(...renderCustomSectionText(data.annexureSections!.section_15));
  } else {
    docChildren.push(
      clauseParagraph(
        'By signing below, the employee confirms that he has read, understood, and accepted all the terms and conditions of this offer letter.',
        200
      )
    );
  }
  docChildren.push(buildSignatureBlock(81, false));

  // --- Headers & Footers with Full-Bleed Master Backgrounds Behind Text ---
  const makeFullPageBackgroundHeader = (imgBuffer: Buffer | null) =>
    new Header({
      children: imgBuffer
        ? [
            new Paragraph({
              spacing: { before: 0, after: 0 },
              children: [
                new ImageRun({
                  data: imgBuffer,
                  type: 'png',
                  transformation: { width: 649, height: 932 },
                  floating: {
                    horizontalPosition: {
                      relative: HorizontalPositionRelativeFrom.PAGE,
                      offset: 0,
                    },
                    verticalPosition: {
                      relative: VerticalPositionRelativeFrom.PAGE,
                      offset: 0,
                    },
                    behindDocument: true,
                    allowOverlap: true,
                    lockAnchor: true,
                    wrap: { type: TextWrappingType.NONE },
                  },
                }),
              ],
            }),
          ]
        : [],
    });

  const firstPageFooter = new Footer({
    children: [],
  });

  const continuationFooter = new Footer({
    children: [buildESignatureDashedTable()],
  });

  const doc = new Document({
    creator: 'White Collar Realty HR System',
    title: `Offer Letter - ${displaySalutationName}`,
    description: 'Official 10-Page White Collar Realty Executive Offer Letter & Annexure 1.0',
    sections: [
      {
        properties: {
          titlePage: true,
          page: {
            size: {
              width: PAGE_WIDTH_TWIPS,
              height: PAGE_HEIGHT_TWIPS,
            },
            margin: {
              top: 1320, // 66pt
              bottom: 1180, // 59pt (leaves clean space for continuation footer)
              left: MARGIN_LR_TWIPS, // 72pt
              right: MARGIN_LR_TWIPS, // 72pt
              header: 0,
              footer: 320,
            },
          },
        },
        headers: {
          first: makeFullPageBackgroundHeader(page1BgBuffer),
          default: makeFullPageBackgroundHeader(page2BgBuffer),
        },
        footers: {
          first: firstPageFooter,
          default: continuationFooter,
        },
        children: docChildren,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}
