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
  convertInchesToTwip,
  ShadingType,
} from 'docx';
import fs from 'fs';
import path from 'path';
import { OfferLetterData } from '../src/types/index.js';

interface GenerateDocxOptions {
  assetsDir?: string;
}

export async function generateWcrOfferLetterDocx(
  data: OfferLetterData,
  options: GenerateDocxOptions = {}
): Promise<Buffer> {
  const assetsDir = options.assetsDir || path.resolve(process.cwd(), 'public/assets');

  // Load authorized image assets safely
  let headerImgBuffer: Buffer | null = null;
  let stampImgBuffer: Buffer | null = null;
  let footerImgBuffer: Buffer | null = null;

  try {
    const headerPath = path.join(assetsDir, 'wcr_header_banner.png');
    if (fs.existsSync(headerPath)) {
      headerImgBuffer = fs.readFileSync(headerPath);
    }
  } catch (e) {
    console.warn('[WordGenerator] Could not load header image:', e);
  }

  try {
    const stampPath = path.join(assetsDir, 'wcr_blue_stamp.png');
    if (fs.existsSync(stampPath)) {
      stampImgBuffer = fs.readFileSync(stampPath);
    }
  } catch (e) {
    console.warn('[WordGenerator] Could not load stamp image:', e);
  }

  try {
    const footerPath = path.join(assetsDir, 'wcr_footer_banner.png');
    if (fs.existsSync(footerPath)) {
      footerImgBuffer = fs.readFileSync(footerPath);
    }
  } catch (e) {
    console.warn('[WordGenerator] Could not load footer image:', e);
  }

  const candidateSalutationName =
    data.candidateName.startsWith('Mr.') ||
    data.candidateName.startsWith('Ms.') ||
    data.candidateName.startsWith('Dr.')
      ? data.candidateName
      : `Mr. ${data.candidateName}`;

  const isAccepted = data.status === 'Accepted';
  const signedDate = data.signedAt ? new Date(data.signedAt).toLocaleDateString('en-GB') : '';

  // Helpers for text styling
  const p = (text: string, options: { bold?: boolean; size?: number; italic?: boolean; spacingAfter?: number; alignment?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) => {
    return new Paragraph({
      alignment: options.alignment || AlignmentType.LEFT,
      spacing: { after: options.spacingAfter ?? 120, line: 260 },
      children: [
        new TextRun({
          text,
          font: 'Arial',
          size: options.size || 20, // 10pt
          bold: options.bold || false,
          italics: options.italic || false,
          color: '000000',
        }),
      ],
    });
  };

  const bullet = (boldPrefix: string, rest: string, level = 0) => {
    const children: TextRun[] = [];
    if (boldPrefix) {
      children.push(
        new TextRun({
          text: boldPrefix,
          font: 'Arial',
          size: 20,
          bold: true,
          color: '000000',
        })
      );
    }
    children.push(
      new TextRun({
        text: rest,
        font: 'Arial',
        size: 20,
        color: '000000',
      })
    );

    return new Paragraph({
      bullet: { level },
      spacing: { after: 100, line: 250 },
      children,
    });
  };

  const createESignatureBoxTable = () => {
    const border = {
      style: BorderStyle.DASHED,
      size: 1,
      color: '94a3b8',
    };

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: border,
        bottom: border,
        left: border,
        right: border,
        insideHorizontal: border,
        insideVertical: border,
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              shading: { fill: 'f8fafc', type: ShadingType.CLEAR },
              margins: { top: 120, bottom: 120, left: 160, right: 160 },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: 'HR RECRUITER E-SIGNATURE',
                      font: 'Arial',
                      bold: true,
                      size: 16,
                      color: '475569',
                    }),
                  ],
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: `${data.recruiterName || 'Nisha'} (${data.recruiterTitle || 'Human Resources Recruiter'})`,
                      font: 'Arial',
                      size: 16,
                      color: '64748b',
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              shading: { fill: 'f8fafc', type: ShadingType.CLEAR },
              margins: { top: 120, bottom: 120, left: 160, right: 160 },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: 'EMPLOYEE E-SIGNATURE',
                      font: 'Arial',
                      bold: true,
                      size: 16,
                      color: '475569',
                    }),
                  ],
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: `${data.candidateSignatureName || data.candidateName} · ${
                        isAccepted ? 'Signed & Verified' : 'Pending Formal Acceptance'
                      }`,
                      font: 'Arial',
                      size: 16,
                      color: '64748b',
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    });
  };

  // Build document children across all 10 pages
  const children: (Paragraph | Table)[] = [];

  // =========================================================================
  // PAGE 1: Offer Letter Preamble, Appointment, Salary, & Signatures
  // =========================================================================
  if (headerImgBuffer) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [
          new ImageRun({
            data: headerImgBuffer,
            transformation: { width: 560, height: 154 },
          }),
        ],
      })
    );
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 140 },
      children: [
        new TextRun({
          text: 'Offer Letter',
          font: 'Times New Roman',
          size: 32, // 16pt
          bold: true,
          color: '0f172a',
        }),
      ],
    })
  );

  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: `Ref: ${data.refNo}  |  Date: ${data.issueDate}`,
          font: 'Arial',
          size: 18,
          color: '64748b',
        }),
      ],
    })
  );

  children.push(
    new Paragraph({
      spacing: { before: 80, after: 120 },
      children: [
        new TextRun({
          text: `Dear ${candidateSalutationName},`,
          font: 'Arial',
          size: 21,
          bold: true,
          color: '000000',
        }),
      ],
    })
  );

  children.push(
    new Paragraph({
      spacing: { after: 120, line: 260 },
      children: [
        new TextRun({
          text: 'Congratulations! We are pleased to confirm that you have been selected to work for the position of ',
          font: 'Arial',
          size: 20,
          color: '000000',
        }),
        new TextRun({
          text: data.designation,
          font: 'Arial',
          size: 20,
          bold: true,
          color: '000000',
        }),
        new TextRun({
          text: ' for ',
          font: 'Arial',
          size: 20,
          color: '000000',
        }),
        new TextRun({
          text: 'White Collar Realty',
          font: 'Arial',
          size: 20,
          bold: true,
          color: '000000',
        }),
        new TextRun({
          text: '.',
          font: 'Arial',
          size: 20,
          color: '000000',
        }),
      ],
    })
  );

  children.push(
    new Paragraph({
      spacing: { after: 120, line: 260 },
      children: [
        new TextRun({
          text: 'We would like you to start work on ',
          font: 'Arial',
          size: 20,
          color: '000000',
        }),
        new TextRun({
          text: data.joiningDate,
          font: 'Arial',
          size: 20,
          bold: true,
          color: '000000',
        }),
        new TextRun({
          text: '. If this date is not acceptable, please contact us immediately. We are offering you a salary of ',
          font: 'Arial',
          size: 20,
          color: '000000',
        }),
        new TextRun({
          text: data.ctcLpaFormatted || 'Rs. 4.8 LPA',
          font: 'Arial',
          size: 20,
          bold: true,
          color: '000000',
        }),
        new TextRun({
          text: '.',
          font: 'Arial',
          size: 20,
          color: '000000',
        }),
      ],
    })
  );

  children.push(
    p(
      'Please sign this letter to indicate your acceptance of this offer. We are confident you will be able to make a significant contribution to the success of the organization and look forward to working with you.'
    )
  );

  children.push(
    p(
      'This offer is conditional. The Company reserves the right to withdraw this offer at any time before your date of joining, without any liability, including where background verification is unsatisfactory, required documents are not submitted, or you do not join on the agreed start date. This offer, together with Annexure 1.0, forms the complete terms of your engagement.'
    )
  );

  children.push(p('Sincerely,', { spacingAfter: 80 }));

  // Page 1 Signature block
  const sigTableBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  };

  const page1SigLeftParas: Paragraph[] = [];
  if (stampImgBuffer) {
    page1SigLeftParas.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: stampImgBuffer,
            transformation: { width: 75, height: 75 },
          }),
        ],
        spacing: { after: 40 },
      })
    );
  }
  page1SigLeftParas.push(
    new Paragraph({
      children: [new TextRun({ text: '___________________', font: 'Arial', size: 20, color: '334155' })],
      spacing: { after: 40 },
    }),
    new Paragraph({
      children: [new TextRun({ text: data.recruiterName || 'Nisha', font: 'Arial', size: 20, bold: true, color: '000000' })],
    }),
    new Paragraph({
      children: [new TextRun({ text: data.recruiterTitle || 'Human Resources Recruiter', font: 'Arial', size: 18, color: '475569' })],
    }),
    new Paragraph({
      children: [new TextRun({ text: 'White Collar Realty', font: 'Arial', size: 18, bold: true, color: '334155' })],
    })
  );

  const page1SigRightParas: Paragraph[] = [
    new Paragraph({
      children: [
        new TextRun({
          text: isAccepted && (data.candidateSignatureName || data.candidateName)
            ? data.candidateSignatureName || data.candidateName
            : ' ',
          font: 'Brush Script MT',
          size: 24,
          italics: true,
          color: '1e3a8a',
        }),
      ],
      spacing: { after: 40 },
    }),
    new Paragraph({
      children: [new TextRun({ text: '______________', font: 'Arial', size: 20, color: '334155' })],
      spacing: { after: 40 },
    }),
    new Paragraph({
      children: [new TextRun({ text: candidateSalutationName, font: 'Arial', size: 20, bold: true, color: '000000' })],
    }),
    new Paragraph({
      children: [new TextRun({ text: 'Employee', font: 'Arial', size: 18, color: '475569' })],
    }),
    new Paragraph({
      children: [new TextRun({ text: `Date: ${signedDate || ''}`, font: 'Arial', size: 18, color: '64748b' })],
    }),
  ];

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: sigTableBorders,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 60, type: WidthType.PERCENTAGE },
              children: page1SigLeftParas,
            }),
            new TableCell({
              width: { size: 40, type: WidthType.PERCENTAGE },
              children: page1SigRightParas,
            }),
          ],
        }),
      ],
    })
  );

  children.push(new Paragraph({ spacing: { before: 100, after: 100 } }));
  children.push(createESignatureBoxTable());

  if (footerImgBuffer) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 80 },
        children: [
          new ImageRun({
            data: footerImgBuffer,
            transformation: { width: 560, height: 160 },
          }),
        ],
      })
    );
  }

  // End of Page 1
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // =========================================================================
  // PAGE 2: ANNEXURE 1.0 COMPENSATION STRUCTURE & SECTIONS 1 - 3
  // =========================================================================
  children.push(
    p('ANNEXURE 1.0 – COMPENSATION STRUCTURE', { bold: true, size: 24, spacingAfter: 140 })
  );

  // Compensation Table
  const tableBorder = {
    style: BorderStyle.SINGLE,
    size: 1,
    color: 'cbd5e1',
  };

  const headerBorder = {
    style: BorderStyle.SINGLE,
    size: 1,
    color: '0f172a',
  };

  const compTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: tableBorder,
      bottom: tableBorder,
      left: tableBorder,
      right: tableBorder,
      insideHorizontal: tableBorder,
      insideVertical: tableBorder,
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 40, type: WidthType.PERCENTAGE },
            shading: { fill: '0f172a', type: ShadingType.CLEAR },
            margins: { top: 120, bottom: 120, left: 140, right: 140 },
            children: [
              new Paragraph({
                children: [new TextRun({ text: 'Salary Components', font: 'Arial', bold: true, size: 20, color: 'FFFFFF' })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 30, type: WidthType.PERCENTAGE },
            shading: { fill: '0f172a', type: ShadingType.CLEAR },
            margins: { top: 120, bottom: 120, left: 140, right: 140 },
            children: [
              new Paragraph({
                children: [new TextRun({ text: 'Monthly Segregation', font: 'Arial', bold: true, size: 20, color: 'FFFFFF' })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 30, type: WidthType.PERCENTAGE },
            shading: { fill: '0f172a', type: ShadingType.CLEAR },
            margins: { top: 120, bottom: 120, left: 140, right: 140 },
            children: [
              new Paragraph({
                children: [new TextRun({ text: 'Yearly Segregation', font: 'Arial', bold: true, size: 20, color: 'FFFFFF' })],
              }),
            ],
          }),
        ],
      }),
      // Basic
      new TableRow({
        children: [
          new TableCell({
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [new Paragraph({ children: [new TextRun({ text: 'Basic', font: 'Arial', size: 20, color: '000000' })] })],
          }),
          new TableCell({
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [new Paragraph({ children: [new TextRun({ text: (data.basicMonthly || 30000).toLocaleString('en-IN'), font: 'Arial', size: 20, color: '000000' })] })],
          }),
          new TableCell({
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [new Paragraph({ children: [new TextRun({ text: (data.basicYearly || 360000).toLocaleString('en-IN'), font: 'Arial', size: 20, color: '000000' })] })],
          }),
        ],
      }),
      // PBVP
      new TableRow({
        children: [
          new TableCell({
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [new Paragraph({ children: [new TextRun({ text: 'PBVP', font: 'Arial', size: 20, color: '000000' })] })],
          }),
          new TableCell({
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [new Paragraph({ children: [new TextRun({ text: (data.pbvpMonthly || 5000).toLocaleString('en-IN'), font: 'Arial', size: 20, color: '000000' })] })],
          }),
          new TableCell({
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [new Paragraph({ children: [new TextRun({ text: (data.pbvpYearly || 60000).toLocaleString('en-IN'), font: 'Arial', size: 20, color: '000000' })] })],
          }),
        ],
      }),
      // Retention Bonus
      new TableRow({
        children: [
          new TableCell({
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [new Paragraph({ children: [new TextRun({ text: 'Retention Bonus', font: 'Arial', size: 20, color: '000000' })] })],
          }),
          new TableCell({
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [new Paragraph({ children: [new TextRun({ text: (data.retentionBonusMonthly || 5000).toLocaleString('en-IN'), font: 'Arial', size: 20, color: '000000' })] })],
          }),
          new TableCell({
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [new Paragraph({ children: [new TextRun({ text: (data.retentionBonusYearly || 60000).toLocaleString('en-IN'), font: 'Arial', size: 20, color: '000000' })] })],
          }),
        ],
      }),
      // CTC Total
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: 'f1f5f9', type: ShadingType.CLEAR },
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [new Paragraph({ children: [new TextRun({ text: 'CTC', font: 'Arial', bold: true, size: 20, color: '000000' })] })],
          }),
          new TableCell({
            shading: { fill: 'f1f5f9', type: ShadingType.CLEAR },
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: (
                      (data.basicMonthly || 30000) +
                      (data.pbvpMonthly || 5000) +
                      (data.retentionBonusMonthly || 5000)
                    ).toLocaleString('en-IN'),
                    font: 'Arial',
                    bold: true,
                    size: 20,
                    color: '000000',
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            shading: { fill: 'f1f5f9', type: ShadingType.CLEAR },
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: (
                      (data.basicYearly || 360000) +
                      (data.pbvpYearly || 60000) +
                      (data.retentionBonusYearly || 60000)
                    ).toLocaleString('en-IN'),
                    font: 'Arial',
                    bold: true,
                    size: 20,
                    color: '000000',
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  children.push(compTable);
  children.push(new Paragraph({ spacing: { after: 120 } }));

  // Section 1
  children.push(p('1. Performance Based Variable Pay (PBVP)', { bold: true, size: 21 }));
  children.push(p('PBVP is a performance-linked variable component of your CTC and is not a fixed monthly entitlement.'));
  children.push(bullet('Eligibility: ', 'Becomes payable only if monthly revenue of AED 50,000 is earned.'));
  children.push(bullet('Exclusions: ', 'Cancelled bookings, refunded bookings, fraudulent transactions, transactions violating Company policy, or bookings later found to be ineligible do not qualify.'));
  children.push(bullet('Verification & Discretion: ', 'PBVP shall be processed only after internal verification. The Company reserves the right to withhold, adjust, recover, or reverse PBVP in the event of cancellation, fraud, customer refund, policy violation, or duplicate claims. It does not create any permanent entitlement, and the Company’s decision shall be final and binding.'));

  // Section 2
  children.push(p('2. Retention Bonus', { bold: true, size: 21, spacingAfter: 80 }));
  children.push(bullet('Eligibility: ', 'Payable only after completion of one year of service, on yearly revenue of AED 5,00,000'));
  children.push(bullet('Exceptions & Notice Period: ', 'Employees who resign, abandon employment, or are terminated before completing one year will not be eligible. Employees serving a notice period beyond one year must satisfy all exit formalities and policy requirements.'));
  children.push(bullet('Forfeiture: ', 'Disciplinary proceedings, fraud, misconduct, policy violation, or financial liability towards the Company may result in withholding or forfeiture. The policy may be modified or discontinued prospectively.'));

  // Section 3
  children.push(p('3. Sales Incentive Policy', { bold: true, size: 21, spacingAfter: 80 }));
  children.push(p('The Employee shall become eligible for any Sales Incentive, Performance Bonus, Commission, or any other performance-linked payout only after the Company has successfully received its brokerage/commission from the respective transaction. Accordingly, no incentive, commission, or performance-linked payment shall be payable under, including but not limited to, the following circumstances:'));
  children.push(bullet('', 'The customer cancels, terminates, withdraws, or fails to proceed with the booking/transaction for any reason whatsoever.'));
  children.push(bullet('', 'The customer defaults, delays, or fails to make the payment(s) required under the payment plan or as demanded by the developer.'));
  children.push(bullet('', 'The transaction is put on hold, remains incomplete, or is not successfully concluded.'));

  children.push(new Paragraph({ spacing: { before: 80, after: 80 } }));
  children.push(createESignatureBoxTable());

  // End of Page 2
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // =========================================================================
  // PAGE 3: SECTIONS 3 (CONTD), 4 & 5
  // =========================================================================
  children.push(bullet('', 'The Company has not received its brokerage, commission, revenue share, or any other receivable from the developer, channel partner, or any other concerned party, irrespective of the reason.'));
  children.push(bullet('', 'Any booking is subsequently reversed, refunded, cancelled, or declared ineligible by the developer or any competent authority.'));
  children.push(p('The Company’s records regarding receipt of brokerage/commission and the successful completion of the transaction shall be final and binding for determining the Employee’s eligibility for incentive payouts. No incentive shall accrue merely on the basis of booking generation or booking confirmation unless the Company’s brokerage/commission has been duly realized.'));

  // Section 4
  children.push(p('4. Review, Probation & Confirmation', { bold: true, size: 21, spacingAfter: 80 }));
  children.push(bullet('10-Day Reviewal Period: ', 'You will be on a reviewal period for 10 days from your date of joining. Underperformance, inappropriate behavior, disciplinary issues, experience mismatch, false documents, or gross misconduct during this time may result in immediate termination without salary. Appointment letters are issued post-review.'));
  children.push(bullet('Probation Duration: ', 'Initially, you will be on probation for six (6) months. Evaluation covers performance, attendance, conduct, technical learning, discipline, and communication skills.'));
  children.push(bullet('Confirmation & Extension: ', 'Confirmation is subject to satisfactory results and formal written approval; it is not automatic upon time completion. Probation may be extended if performance does not meet organizational standards.'));
  children.push(bullet('Performance Improvement Plan (PIP): ', 'The Company may place an underperforming employee on a PIP. Failure to complete the PIP successfully within the prescribed timeline may result in termination.'));
  children.push(bullet('Termination During Probation: ', 'Notice for termination during probation is as stated under Section 9 (Termination & Summary Dismissal).'));

  // Section 5
  children.push(p('5. Working Hours & Office Discipline', { bold: true, size: 21, spacingAfter: 80 }));
  children.push(bullet('Schedule: ', 'Standard working hours are 10:00 AM to 7:00 PM, Tuesday to Sunday (6 days a week), inclusive of a 30-minute lunch break, a 15-minute morning break, and a 15-minute evening break.'));
  children.push(bullet('Weekly Off: ', "The designated weekly off is Monday. If a client meeting, site visit, or transaction-related work falls on the weekly off, the employee shall attend as per the client's availability, at the office or on-site. Such attendance does not carry overtime. Compensatory off, if any, is at the reporting manager's discretion."));
  children.push(bullet('Flexibility & Overtime: ', 'Schedules may require working early, late, or occasionally on week-offs/holidays depending on business requirements. No overtime payment will be provided.'));
  children.push(bullet('Dress Code / Formal Wear Policy: ', 'Formal business attire is mandatory during office hours.'));
  children.push(bullet('Code of Conduct: ', "Employees must maintain professional behavior, workplace ethics, business etiquette, and respect for colleagues/clients. Employees shall follow instructions from reporting managers and refrain from office politics, rumor spreading, disruptive behavior, discrimination, harassment, unauthorized photography/videography, or damaging the Company's reputation."));

  children.push(new Paragraph({ spacing: { before: 80, after: 80 } }));
  children.push(createESignatureBoxTable());

  // End of Page 3
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // =========================================================================
  // PAGE 4: SECTIONS 6 & 7 (LEAVE POLICY)
  // =========================================================================
  children.push(p('6. Late Entry & Early Leaving Policy', { bold: true, size: 21, spacingAfter: 80 }));
  children.push(bullet('Standard Reporting Time: ', 'Strictly 10:00 AM.'));
  children.push(bullet('Late Penalty: ', 'Arrival after 10:15 AM results in a half-day leave deduction. There is no flexibility beyond 10:15 AM.'));
  children.push(bullet('Exceptions: ', 'A maximum of three (3) monthly exceptions for late entry/early exit are permitted, subject to department head approval.'));
  children.push(bullet('Procedure: ', 'Any late arrival requires written permission from the manager and an update in the designated group stating the reason and estimated time of arrival (ETA).'));

  children.push(p('7. Leave Policy', { bold: true, size: 21, spacingAfter: 80 }));
  children.push(p('7.1. Casual Leave (CL)', { bold: true, size: 20 }));
  children.push(bullet('Entitlement: ', '12 CLs per year (1 paid leave per month) awarded only after probation completion. This is inclusive of all casual and medical leaves.'));

  children.push(p('7.2. Carry Forward Leaves (CFL)', { bold: true, size: 20 }));
  children.push(bullet('Carry Forward: ', 'Unused CL can be carried forward up to the end of that financial year. Leave encashment is available after the financial year completes. Taking CFL requires written approval from the manager 2 days prior.'));

  children.push(p('7.3. Probation Paid Leave', { bold: true, size: 20 }));
  children.push(bullet('', 'No paid leaves are granted during probation.'));

  children.push(p('7.4. Emergency Leave', { bold: true, size: 20 }));
  children.push(bullet('', 'Must be informed and acknowledged before 10:00 AM on the same working day via call/official message to the Reporting Manager and HR.'));
  children.push(bullet('', 'Intimation after office hours begin or absence without confirmation will be treated as unapproved leave. A written email with reason and proof must be submitted on the next working day.'));

  children.push(p('7.5. Sick Leave', { bold: true, size: 20 }));
  children.push(bullet('', 'Sick Leave is availed from the Casual Leave entitlement under 7.1 (no separate sick-leave quota). Sick leave exceeding 2 days requires submission of medical records for approval.'));

  children.push(p('7.6. Unplanned Leave & Sandwich Policy', { bold: true, size: 20 }));
  children.push(bullet('Sandwich Policy: ', "Unplanned leave taken immediately before and/or after a weekly off (Monday)/holiday shall cause the weekly off/holiday to be counted as unpaid leave (2 days' deduction). Leave must be pre-approved via email at least 10 days in advance."));
  children.push(bullet('Extended Absence: ', 'Absences exceeding 5 days void paid week-off salary.'));
  children.push(bullet('Restricted Period: ', 'No leave is allowed for 3 days immediately before and after salary release; any taken will be marked unapproved.'));
  children.push(bullet('Advance Notice Requirements: ', ''));
  children.push(bullet('1 day leave: ', 'Apply at least 1–2 days prior.', 1));
  children.push(bullet('2 days leave: ', 'Apply at least 4 days in advance.', 1));

  children.push(new Paragraph({ spacing: { before: 80, after: 80 } }));
  children.push(createESignatureBoxTable());

  // End of Page 4
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // =========================================================================
  // PAGE 5: SECTIONS 7.7, 8 & 9 (TERMINATION)
  // =========================================================================
  children.push(p('7.7. Planned Leave', { bold: true, size: 20 }));
  children.push(bullet('', 'Planned leaves (travel, marriage, exams) must be applied for at least 30 days in advance. Unapproved leaves are treated as unauthorized.'));

  children.push(p('8. Conflict of Interest, Non-Solicitation & Client Diversion', { bold: true, size: 21, spacingAfter: 80 }));
  children.push(bullet('Exclusive Employment & Office-Hours Discipline: ', 'The employee shall devote full working time to the Company. Personal calls and personal WhatsApp/messaging are not permitted during office hours; any employee found engaged in personal calls or chats during office hours shall face disciplinary action. During the tenure of employment, the employee shall not freelance or take up any secondary work (paid or unpaid), and shall not book, close, route, or process any property transaction, booking, or payment outside the Company, whether directly with any developer or with any other broker or channel partner. Any such act shall be treated as a fundamental breach, and the Company may terminate employment with immediate effect, without notice, with forfeiture of all pending incentives.'));
  children.push(bullet('Professional Integrity & Client Relations: ', 'Diverting Company clients, enquiries, or leads to any external party or builder, or accepting any unauthorized external commission, is a breach of professional ethics and may lead to disciplinary action up to and including termination and legal measures.'));
  children.push(bullet('Non-Solicitation & Enforcement (Post-Separation): ', 'For 12 months following separation, the former employee is strictly prohibited from contacting, soliciting, or servicing any clients, leads, or business contacts associated with White Collar Realty for personal gain or the benefit of any other entity. Any such misuse or diversion constitutes a material breach of this agreement. The Company reserves the right to seek injunctive relief and claim financial damages for any such breach.'));
  children.push(bullet('Client Communication Channels: ', 'All client, investor, and lead communication (calls, WhatsApp, messages, email) shall be conducted only through the Company-provided number, email, and CRM. Use of a personal mobile number, personal WhatsApp, or personal email for client contact is prohibited. All clients, contacts, and chat histories generated through Company work are Company property and shall be handed over in full, along with the Company number, on exit.'));

  children.push(p('9. Termination & Summary Dismissal', { bold: true, size: 21, spacingAfter: 80 }));
  children.push(p('Notice by the Company: Where the Company terminates employment (other than summary dismissal):', { bold: true }));
  children.push(p('1. Regular Employees: 7 days’ prior notice.', { spacingAfter: 40 }));
  children.push(p('2. Probationary Employees: 24 hours’ notice.', { spacingAfter: 80 }));
  children.push(p('Performance Benchmark (First 3 Months): Failure to achieve at least one (1) sales closure within the first three (3) months of joining entitles the Company to terminate employment immediately without further obligation.'));
  children.push(p('Summary Dismissal (Immediate Termination Without Notice): Accumulating three (3) written warnings may trigger termination. However, immediate termination without notice may occur for:'));
  children.push(p('1. Gross misconduct, gross negligence, or fundamental breach of contract.', { spacingAfter: 40 }));
  children.push(p('2. Unlawful communication of confidential Company business or data theft.', { spacingAfter: 80 }));

  children.push(new Paragraph({ spacing: { before: 80, after: 80 } }));
  children.push(createESignatureBoxTable());

  // End of Page 5
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // =========================================================================
  // PAGE 6: SECTION 9 (CONTD), 10, 11, 12, 13 (EXIT PROCESS)
  // =========================================================================
  children.push(p('3. Dishonesty, moral turpitude, or financial fraud/misconduct.', { spacingAfter: 40 }));
  children.push(p('4. Falsification or concealment of resume details or background documents.', { spacingAfter: 40 }));
  children.push(p('5. Physical or mental medical unfitness.', { spacingAfter: 40 }));
  children.push(p('6. Absconding or unauthorized absence as defined under Section 10 (Unannounced Absence Policy).', { spacingAfter: 40 }));
  children.push(p('7. Engaging in unauthorized side employment/business, freelancing, or routing any property transaction outside the Company (directly with a developer, broker, or channel partner).', { spacingAfter: 40 }));
  children.push(p('8. Unethical behavior, harassment, violence, client diversion, or damaging the Company’s image/reputation.', { spacingAfter: 40 }));
  children.push(p('9. Habitual indiscipline, repeated late reporting, or failure of PIP.', { spacingAfter: 120 }));

  children.push(p('10. Unannounced Absence Policy', { bold: true, size: 21, spacingAfter: 80 }));
  children.push(bullet('Definition: ', 'An absence of three (3) or more consecutive working days without prior approval or communication shall be treated as voluntary departure from the role. This includes failure to participate in transition responsibilities or leaving before the first salary credit during the initial training period.'));
  children.push(bullet('Consequences: ', 'Such departure shall be treated as job abandonment, resulting in termination of employment and forfeiture of pending dues and incentives. No relieving documentation shall be issued. All Company property must be returned within 7 days, failing which the Company may initiate legal recovery.'));

  children.push(p('11. Prevention of Sexual Harassment (POSH)', { bold: true, size: 21, spacingAfter: 80 }));
  children.push(p('White Collar Realty enforces a strict zero-tolerance policy against workplace sexual harassment. Mandatory compliance with the Company’s POSH Policy and participation in POSH awareness training are required for all employees.'));

  children.push(p('12. Document Verification & Company Property', { bold: true, size: 21, spacingAfter: 80 }));
  children.push(bullet('Document Verification: ', 'Employment is subject to satisfactory background verification of identity, education, experience, address, and employment history. Submitting false information will result in immediate offer withdrawal or termination.'));
  children.push(bullet('Return of Property: ', 'Upon resignation, termination, or exit clearance, the employee must return all Company assets including laptops, SIM cards, official emails, CRM access, keys, access cards, marketing materials, and physical files, in good working condition. If any Company asset is not returned, or is lost, stolen, broken, or damaged (beyond normal wear and tear) while in the employee’s custody, the employee shall be liable to pay its replacement or repair cost as determined by the Company, and the Company may recover this amount from the employee’s salary, incentives, or Full & Final settlement, to the extent permitted by law.'));

  children.push(p('13. Exit Process, Notice Period & Full & Final (F&F) Settlement', { bold: true, size: 21, spacingAfter: 80 }));
  children.push(bullet('Notice by the Employee: ', "Resigning employees must provide 45 working days' written notice. No leaves are permitted during the notice period (granted leaves will extend the notice period by the same duration)."));

  children.push(new Paragraph({ spacing: { before: 80, after: 80 } }));
  children.push(createESignatureBoxTable());

  // End of Page 6
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // =========================================================================
  // PAGE 7: SECTION 13 (CONTD), 14 (CONFIDENTIALITY & NDA 14.1 - 14.4)
  // =========================================================================
  children.push(bullet('Early Release & Buyout: ', "Early release is solely at the Company's discretion, subject to deducting salary equivalent to the unserved days or charging 45 working days' salary as compensation for financial loss."));
  children.push(bullet('Garden Leave: ', 'The Company may place the employee on Garden Leave during the notice period, during which confidentiality and non-solicitation obligations remain active.'));
  children.push(bullet('F&F Settlement: ', 'Full and Final settlement is processed after 45 working days from leaving, subject to complete exit clearance, department clearance, handover completion, and full asset return. Failure to serve the notice period, absconding, or failing to return Company assets gives the Company the right to withhold F&F settlements, relieving letters, and unpaid salaries.'));

  children.push(p('14. Confidentiality, Client data protection and non-disclosure obligations', { bold: true, size: 21, spacingAfter: 80 }));
  children.push(p('As part of your role with White Collar Realty, you may be provided access to sensitive and confidential information relating to the Company, its clients, investors, prospects, employees, channel partners, developers, vendors and business operations. You acknowledge that such access is provided strictly for authorised Company work and is subject to the following obligations.'));

  children.push(p('14.1 Confidential Information', { bold: true, size: 20 }));
  children.push(p('“Confidential Information” includes, without limitation, client and investor names, phone numbers, email addresses, contact details, identity information, investment history, properties owned or considered, budgets, transaction values, booking or payment information, portfolio information, investor classification, CRM records, lead databases, cold data, buyer data, spreadsheets, reports, dashboards, call notes, WhatsApp or email records, recordings, meeting notes, site-visit records, internal remarks, project-wise client lists, pricing intelligence, inventories, negotiated terms, brokerage information, business information, source data, analytics, formulas, scripts, system access details, credentials, internal procedures and any information that is marked confidential or would reasonably be understood to be confidential or non-public.'));

  children.push(p('14.2 Strict Need-to-Know Access and Internal Confidentiality', { bold: true, size: 20 }));
  children.push(p('You shall access and use Confidential Information only to the minimum extent required for the task assigned to you. You shall not disclose, discuss, show, forward, copy or otherwise make Confidential Information available to any unauthorised person, including any colleague, intern, employee, manager, contractor or other person within the office unless that person is specifically authorised and requires the information for a legitimate assigned business purpose.'));

  children.push(p('14.3 No External Disclosure or Personal Use', { bold: true, size: 20 }));
  children.push(p('You shall not share, disclose, transfer, sell, exploit or use Confidential Information for your own benefit or for the benefit of any relative, friend, competitor, broker, agent, employer, future employer, business, developer, channel partner, client or third party. You shall not independently contact, solicit, divert, approach, market to, transact with or attempt to monetise any Company client, investor, lead or prospect except where expressly instructed and authorised as part of your Company duties.'));

  children.push(p('14.4 No Unauthorised Copying, Downloading or Storage', { bold: true, size: 20 }));
  children.push(p('Unless specifically authorised in writing by the Company, you shall not copy, export, download, print, photograph, screenshot, screen-record, email, WhatsApp, AirDrop, upload, sync, back up, transfer or store Confidential Information on any personal phone, personal laptop, personal email account, personal cloud drive, USB device, messaging application, external storage, public website or any other unapproved system.'));

  children.push(new Paragraph({ spacing: { before: 80, after: 80 } }));
  children.push(createESignatureBoxTable());

  // End of Page 7
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // =========================================================================
  // PAGE 8: SECTION 14.5 - 14.12 (AI TOOLS, INCIDENTS, REMEDIES)
  // =========================================================================
  children.push(p('14.5 Use of AI Tools, Analytics Platforms and Third-Party Applications', { bold: true, size: 20 }));
  children.push(p('You shall not upload, paste, enter or expose identifiable client or investor data, CRM exports, phone numbers, email addresses, financial or investment information, passwords, Company datasets or proprietary information into any public or unapproved artificial-intelligence tool, analytics platform, code repository, file-sharing service or third-party application. Any Company-approved tool may be used only within the scope and safeguards specifically authorised by the Company.'));

  children.push(p('14.6 Data Minimisation, Masking and Security', { bold: true, size: 20 }));
  children.push(p('Where full client identity is not required for analysis or testing, you shall use masked, pseudonymised or dummy values as directed by the Company. You shall comply with all Company access controls, password requirements, security instructions and data-handling procedures and shall not attempt to bypass permissions or access data outside your assigned scope.'));

  children.push(p('14.7 No Unauthorised Client or Investor Contact', { bold: true, size: 20 }));
  children.push(p('Client or investor contact details obtained through Company work shall not be used for personal calls, messages, social-media contact, referrals, introductions, independent sales, future business or any other purpose not expressly authorised by the Company.'));

  children.push(p('14.8 Immediate Reporting of Data or Security Incidents', { bold: true, size: 20 }));
  children.push(p('You must immediately report to the Company any suspected or actual loss, unauthorised access, accidental disclosure, misdirected message or email, stolen or lost device, compromised password, unauthorised download or export, phishing incident or any other event that may affect Confidential Information. You shall preserve relevant evidence and fully cooperate with the Company in investigation, containment, remediation and any legal or compliance action.'));

  children.push(p('14.9 Return, Deletion and Cessation of Access', { bold: true, size: 20 }));
  children.push(p('Upon completion of an assigned task, suspension, resignation, termination, expiry of employment, or whenever requested by the Company, you shall immediately cease access to Company systems, return all Company property and records, and permanently delete any Company data stored in any authorised temporary location. You shall not retain any copy, extract, summary, photograph, screenshot, client contact, report, dataset, derivative data, model or reconstruction of Company information and shall provide written confirmation of deletion or return if required.'));

  children.push(p('14.10 Continuing Obligation After Exit', { bold: true, size: 20 }));
  children.push(p('These confidentiality and data-protection obligations shall continue during your employment and shall survive resignation, termination, completion or expiry of your engagement. You shall continue to protect client and investor information, credentials, trade secrets and other non-public Company information for so long as such information remains confidential, proprietary or legally protected.'));

  children.push(p('14.11 Ownership of Data and Work Product', { bold: true, size: 20 }));
  children.push(p('All Company-provided data and all datasets, cleaned or merged files, analyses, dashboards, reports, findings, data dictionaries, scripts, queries, transformations, documentation and other work product created by you in the course of Company work shall belong to the Company to the extent permitted by applicable law and the terms of your engagement. You shall have no right to retain, reuse, publish, disclose, sell or commercially exploit such material.'));

  children.push(p('14.12 Breach, Disciplinary Action and Legal Remedies', { bold: true, size: 20 }));
  children.push(p('Any actual or suspected breach of these obligations may result in immediate restriction or suspension of access, disciplinary action, termination of employment, preservation of digital evidence, internal investigation and legal action as permitted by applicable law. The Company may seek appropriate'));

  children.push(new Paragraph({ spacing: { before: 80, after: 80 } }));
  children.push(createESignatureBoxTable());

  // End of Page 8
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // =========================================================================
  // PAGE 9: SECTIONS 14.13 - 14.16 & ACKNOWLEDGEMENT TABLE
  // =========================================================================
  children.push(p('civil, contractual, statutory and equitable remedies, including injunctions or other preventive relief, recovery of legally recoverable losses or damages and any other remedy available under law.'));

  children.push(p('14.13 Indemnity', { bold: true, size: 20 }));
  children.push(p('To the extent permitted by applicable law, you shall be responsible for and shall indemnify the Company against direct losses, liabilities, claims, costs and expenses actually arising from your wilful misconduct, fraud, unauthorised disclosure, unauthorised use, deliberate data misuse or material breach of these obligations, subject to determination under applicable law.'));

  children.push(p('14.14 Lawful Disclosures', { bold: true, size: 20 }));
  children.push(p('Nothing in these obligations prevents a disclosure expressly required by applicable law, a binding order of a competent court or lawful authority, or a protected disclosure that cannot legally be restricted. Where legally permitted, you shall promptly inform the Company before such disclosure and shall disclose only the minimum information legally required.'));

  children.push(p('14.15 Future Employment', { bold: true, size: 20 }));
  children.push(p('Nothing in these clauses is intended to prohibit you from pursuing lawful future employment, profession, trade or business. However, no future employment or engagement gives you any right to use, retain, disclose or exploit White Collar Realty’s Confidential Information, client or investor information, proprietary data or trade secrets.'));

  children.push(p('14.16 Applicable Law and Jurisdiction', { bold: true, size: 20 }));
  children.push(p('You shall comply with applicable Indian data-protection, privacy, information-technology, cybersecurity and contractual requirements, together with Company policies and instructions. These obligations shall be governed by the laws of India and, subject to any dispute-resolution provision elsewhere in your offer letter or employment/internship terms, courts having competent jurisdiction at Gurugram, Haryana shall have jurisdiction.'));

  children.push(p('ACKNOWLEDGEMENT AND ACCEPTANCE', { bold: true, size: 22, spacingAfter: 80 }));
  children.push(p('I confirm that I have read and understood the above Confidentiality, Client Data Protection and Non-Disclosure Obligations. I understand the sensitivity of the client, investor and Company information that may be made available to me and agree to comply fully with these obligations during and after my employment. I understand that access to Company and client data is conditional upon my continuing compliance with these obligations.'));

  // Acknowledgement 5-row table
  const ackTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: tableBorder,
      bottom: tableBorder,
      left: tableBorder,
      right: tableBorder,
      insideHorizontal: tableBorder,
      insideVertical: tableBorder,
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 35, type: WidthType.PERCENTAGE },
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [new Paragraph({ children: [new TextRun({ text: 'Employee Name', font: 'Arial', bold: true, size: 20, color: '000000' })] })],
          }),
          new TableCell({
            width: { size: 65, type: WidthType.PERCENTAGE },
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [new Paragraph({ children: [new TextRun({ text: data.candidateName, font: 'Arial', size: 20, color: '000000' })] })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [new Paragraph({ children: [new TextRun({ text: 'Designation', font: 'Arial', bold: true, size: 20, color: '000000' })] })],
          }),
          new TableCell({
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [new Paragraph({ children: [new TextRun({ text: data.designation, font: 'Arial', size: 20, color: '000000' })] })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [new Paragraph({ children: [new TextRun({ text: 'Signature', font: 'Arial', bold: true, size: 20, color: '000000' })] })],
          }),
          new TableCell({
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: isAccepted && (data.candidateSignatureName || data.candidateName)
                      ? data.candidateSignatureName || data.candidateName
                      : '___________________________________________',
                    font: isAccepted ? 'Brush Script MT' : 'Arial',
                    size: 20,
                    color: isAccepted ? '1e3a8a' : '64748b',
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [new Paragraph({ children: [new TextRun({ text: 'Date', font: 'Arial', bold: true, size: 20, color: '000000' })] })],
          }),
          new TableCell({
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: signedDate || '___________________________________________',
                    font: 'Arial',
                    size: 20,
                    color: signedDate ? '000000' : '64748b',
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [new Paragraph({ children: [new TextRun({ text: 'Place', font: 'Arial', bold: true, size: 20, color: '000000' })] })],
          }),
          new TableCell({
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: data.market === 'Dubai' ? 'Dubai, UAE' : 'Gurugram, Haryana',
                    font: 'Arial',
                    size: 20,
                    color: '000000',
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  children.push(ackTable);
  children.push(new Paragraph({ spacing: { before: 80, after: 80 } }));
  children.push(createESignatureBoxTable());

  // End of Page 9
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // =========================================================================
  // PAGE 10: SECTION 15 (ACCEPTANCE & SIGNATURES)
  // =========================================================================
  children.push(p('15. Acceptance & Signatures', { bold: true, size: 24, spacingAfter: 80 }));
  children.push(
    p('By signing below, the employee confirms that he has read, understood, and accepted all the terms and conditions of this offer letter.', {
      spacingAfter: 160,
    })
  );

  const page10SigLeftParas: Paragraph[] = [];
  if (stampImgBuffer) {
    page10SigLeftParas.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: stampImgBuffer,
            transformation: { width: 85, height: 85 },
          }),
        ],
        spacing: { after: 40 },
      })
    );
  }
  page10SigLeftParas.push(
    new Paragraph({
      children: [new TextRun({ text: '________________', font: 'Arial', size: 20, color: '334155' })],
      spacing: { after: 40 },
    }),
    new Paragraph({
      children: [new TextRun({ text: data.recruiterName || 'Nisha', font: 'Arial', size: 20, bold: true, color: '000000' })],
    }),
    new Paragraph({
      children: [new TextRun({ text: data.recruiterTitle || 'Human Resources Recruiter', font: 'Arial', size: 18, color: '475569' })],
    }),
    new Paragraph({
      children: [new TextRun({ text: 'White Collar Realty', font: 'Arial', size: 18, bold: true, color: '334155' })],
    })
  );

  const page10SigRightParas: Paragraph[] = [
    new Paragraph({
      children: [
        new TextRun({
          text: isAccepted && (data.candidateSignatureName || data.candidateName)
            ? data.candidateSignatureName || data.candidateName
            : ' ',
          font: 'Brush Script MT',
          size: 24,
          italics: true,
          color: '1e3a8a',
        }),
      ],
      spacing: { after: 40 },
    }),
    new Paragraph({
      children: [new TextRun({ text: '__________', font: 'Arial', size: 20, color: '334155' })],
      spacing: { after: 40 },
    }),
    new Paragraph({
      children: [new TextRun({ text: candidateSalutationName, font: 'Arial', size: 20, bold: true, color: '000000' })],
    }),
    new Paragraph({
      children: [new TextRun({ text: 'Employee', font: 'Arial', size: 18, color: '475569' })],
    }),
    new Paragraph({
      children: [new TextRun({ text: `Date: ${signedDate || ''}`, font: 'Arial', size: 18, color: '64748b' })],
    }),
  ];

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: sigTableBorders,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 60, type: WidthType.PERCENTAGE },
              children: page10SigLeftParas,
            }),
            new TableCell({
              width: { size: 40, type: WidthType.PERCENTAGE },
              children: page10SigRightParas,
            }),
          ],
        }),
      ],
    })
  );

  children.push(new Paragraph({ spacing: { before: 140, after: 100 } }));
  children.push(createESignatureBoxTable());

  // Construct Document
  const doc = new Document({
    title: `White Collar Realty Offer Letter - ${data.candidateName}`,
    description: `Official White Collar Realty Offer Letter for ${data.candidateName} (${data.designation})`,
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.65),
              bottom: convertInchesToTwip(0.65),
              left: convertInchesToTwip(0.9),
              right: convertInchesToTwip(0.9),
            },
          },
        },
        children,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}
