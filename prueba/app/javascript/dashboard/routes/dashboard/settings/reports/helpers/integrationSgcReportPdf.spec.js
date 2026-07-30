const { jsPDF, pdfDocument } = vi.hoisted(() => {
  const document = {
    setFillColor: vi.fn(),
    setTextColor: vi.fn(),
    setDrawColor: vi.fn(),
    rect: vi.fn(),
    roundedRect: vi.fn(),
    line: vi.fn(),
    setFont: vi.fn(),
    setFontSize: vi.fn(),
    text: vi.fn(),
    save: vi.fn(),
  };

  return {
    jsPDF: vi.fn(function MockJsPdf() {
      return document;
    }),
    pdfDocument: document,
  };
});

vi.mock('jspdf', () => ({ jsPDF }));

import {
  buildIntegrationSgcReportFilename,
  exportIntegrationSgcReportPdf,
  getIntegrationSgcReportMetrics,
} from './integrationSgcReportPdf';

const report = {
  generated_at: '2026-07-17T08:03:44.993252-05:00',
  funnel: {
    from_date: '2026-07-11',
    to_date: '2026-07-17',
    stages: [
      {
        key: 'conversations',
        label: 'Número de conversaciones',
        count: 10,
        rate_from_start_pct: 100,
      },
      {
        key: 'sgc_step4',
        label: 'Agendamiento paso 4',
        count: 4,
        rate_from_start_pct: 40,
      },
      {
        key: 'sgc_step6',
        label: 'Agendamiento paso 6',
        count: 2,
        rate_from_start_pct: 20,
      },
    ],
  },
};

describe('integrationSgcReportPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('finds the required SGC stages by their keys', () => {
    const metrics = getIntegrationSgcReportMetrics(report.funnel.stages);

    expect(metrics.total.count).toBe(10);
    expect(metrics.step4.count).toBe(4);
    expect(metrics.step6.count).toBe(2);
  });

  it('uses the report end date in its filename', () => {
    expect(buildIntegrationSgcReportFilename(report)).toBe(
      'informe-agendamientos-sgc-2026-07-17.pdf'
    );
  });

  it('creates a PDF with the period and core funnel values', async () => {
    await exportIntegrationSgcReportPdf({
      report,
      period: 'Últimos 7 días · 11 jul - 17 jul',
      generatedAt: '17 jul 2026, 08:03',
      locale: 'es-EC',
    });

    expect(jsPDF).toHaveBeenCalledWith({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });
    expect(pdfDocument.save).toHaveBeenCalledWith(
      'informe-agendamientos-sgc-2026-07-17.pdf'
    );

    const text = pdfDocument.text.mock.calls.map(([value]) => value).join(' ');

    expect(text).toContain('Informe de agendamientos');
    expect(text).toContain('Últimos 7 días · 11 jul - 17 jul');
    expect(text).toContain('10');
    expect(text).toContain('4');
    expect(text).toContain('2');
  });
});
