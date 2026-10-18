import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';

/** Build a real PDF from the rendered report, independent of the browser print API. */
export function createReportPdf(report: HTMLElement): Blob {
  const tables = Array.from(report.querySelectorAll<HTMLTableElement>('.report-table'));
  if (!tables.length) throw new Error('Run the report before opening its PDF.');

  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const margin = 34;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  const bottom = doc.internal.pageSize.getHeight() - margin;
  let y = margin;

  function text(value: string, size: number, bold = false, centered = false): void {
    if (!value.trim()) return;
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(value.trim(), width) as string[];
    for (const line of lines) {
      if (y + size * 1.3 > bottom) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, centered ? margin + width / 2 : margin, y + size, {
        align: centered ? 'center' : 'left',
      });
      y += size * 1.3;
    }
    y += 5;
  }

  const title = report.querySelector('h2')?.textContent?.trim() || 'Report';
  doc.setProperties({ title });
  text(report.querySelector('.report-company')?.textContent || '', 14, true, true);
  text(report.querySelector('.report-place')?.textContent || '', 10, false, true);
  text(title, 12, true, true);
  text(report.querySelector('.report-subtitle')?.textContent || '', 9, false, true);
  y += 10;

  for (const table of tables) {
    const heading = table.closest('.ledger-group')?.querySelector('h3');
    if (heading) {
      // Leave room for the heading, column headers and at least one entry.
      if (y + 80 > bottom) {
        doc.addPage();
        y = margin;
      }
      text(Array.from(heading.childNodes, (node) => node.textContent?.trim()).join(' '), 11, true);
    }
    let finalY = y;
    autoTable(doc, {
      html: table,
      startY: y,
      margin: { top: margin, right: margin, bottom: margin, left: margin },
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
      headStyles: { fillColor: [238, 241, 243], fontStyle: 'bold' },
      footStyles: { fillColor: [244, 248, 247], fontStyle: 'bold' },
      showHead: 'everyPage',
      showFoot: 'lastPage',
      rowPageBreak: 'avoid',
      didParseCell: ({ cell, row }) => {
        const element = cell.raw;
        if (!(element instanceof HTMLTableCellElement)) return;
        if (element.classList.contains('num')) {
          cell.styles.halign = 'right';
          cell.styles.minCellWidth = doc.getTextWidth(cell.text.join(' ')) + 8;
        }
        const tr = element.parentElement;
        if (tr?.matches('.section-head, .section-total, .opening, .date-footer')) {
          cell.styles.fontStyle = 'bold';
          cell.styles.fillColor = [244, 248, 247];
        }
        if (row.section === 'body') cell.styles.lineColor = [226, 232, 237];
      },
      didDrawPage: ({ cursor }) => {
        finalY = cursor?.y ?? margin;
      },
    });
    y = finalY + 16;
  }
  for (const note of report.querySelectorAll<HTMLElement>('.report-note')) {
    text(note.textContent || '', 8);
  }
  return doc.output('blob');
}
