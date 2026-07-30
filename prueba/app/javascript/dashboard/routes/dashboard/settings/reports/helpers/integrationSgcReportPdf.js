const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 16;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const COLORS = {
  navy: [13, 37, 57],
  blue: [48, 113, 184],
  teal: [26, 152, 143],
  amber: [221, 144, 26],
  slate: [78, 94, 108],
  lightSlate: [227, 232, 237],
  lighterSlate: [245, 248, 250],
  white: [255, 255, 255],
};

const DEFAULT_LABELS = {
  brand: 'EOS TECH',
  documentTitle: 'Informe de agendamientos',
  reportName: 'Integracion SGC',
  client: 'Cliente',
  clientName: 'Hyundai Ecuador',
  channel: 'Agente y canal',
  channelName: 'Baekho / WhatsApp Business',
  period: 'Periodo',
  totalConversations: 'Total de conversaciones',
  step4: 'Agendamiento paso 4',
  step6: 'Agendamiento paso 6',
  distribution: 'Distribucion de etapas',
  stage: 'Etapa',
  conversations: 'Conversaciones',
  conversion: 'Conversion',
  funnel: 'Embudo de conversion',
  generatedAt: 'Generado',
};

const toNumber = value => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const normalizedStageKey = stage => {
  return `${stage?.key || stage?.label || ''}`
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
};

const findStage = (stages, matcher) => {
  return stages.find(stage => matcher(normalizedStageKey(stage)));
};

const formatNumber = (value, locale) => {
  return new Intl.NumberFormat(locale || 'es-EC', {
    maximumFractionDigits: 0,
  }).format(toNumber(value));
};

const formatPercentage = (value, locale) => {
  return new Intl.NumberFormat(locale || 'es-EC', {
    maximumFractionDigits: 1,
  }).format(Math.max(0, Math.min(toNumber(value), 100)));
};

const trimText = (value, maxLength = 34) => {
  const text = `${value || ''}`;
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
};

const applyFill = (document, color) => document.setFillColor(...color);
const applyText = (document, color) => document.setTextColor(...color);
const applyDraw = (document, color) => document.setDrawColor(...color);

const drawMetricCard = (document, { x, label, value, rate, color }) => {
  applyFill(document, COLORS.lighterSlate);
  document.roundedRect(x, 110, 56.5, 30, 3, 3, 'F');
  applyFill(document, color);
  document.roundedRect(x, 110, 56.5, 3, 3, 3, 'F');

  applyText(document, COLORS.slate);
  document.setFont('helvetica', 'normal');
  document.setFontSize(7.5);
  document.text(trimText(label, 24), x + 5, 120);

  applyText(document, COLORS.navy);
  document.setFont('helvetica', 'bold');
  document.setFontSize(19);
  document.text(value, x + 5, 132);

  applyText(document, COLORS.slate);
  document.setFont('helvetica', 'normal');
  document.setFontSize(7.5);
  document.text(`${rate}%`, x + 51.5, 132, { align: 'right' });
};

export const getIntegrationSgcReportMetrics = stages => {
  const safeStages = Array.isArray(stages) ? stages : [];
  const total =
    findStage(safeStages, key => key === 'conversations') || safeStages[0];
  const step4 = findStage(safeStages, key => key.includes('step4'));
  const step6 = findStage(safeStages, key => key.includes('step6'));

  return { total, step4, step6 };
};

export const buildIntegrationSgcReportFilename = report => {
  const reportDate =
    report?.funnel?.to_date || report?.generated_at?.slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(reportDate || '')
    ? reportDate
    : 'reporte';

  return `informe-agendamientos-sgc-${date}.pdf`;
};

export const exportIntegrationSgcReportPdf = async ({
  report,
  period,
  generatedAt,
  locale,
  labels = {},
}) => {
  const { jsPDF: JsPdf } = await import('jspdf');
  const document = new JsPdf({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  const copy = { ...DEFAULT_LABELS, ...labels };
  const stages = Array.isArray(report?.funnel?.stages)
    ? report.funnel.stages
    : [];
  const { total, step4, step6 } = getIntegrationSgcReportMetrics(stages);
  const exportStages = [total, step4, step6].filter(
    (stage, index, items) => stage && items.indexOf(stage) === index
  );
  const metrics = [
    {
      label: copy.totalConversations,
      stage: total,
      color: COLORS.blue,
    },
    { label: copy.step4, stage: step4, color: COLORS.teal },
    { label: copy.step6, stage: step6, color: COLORS.amber },
  ];

  applyFill(document, COLORS.navy);
  document.rect(0, 0, PAGE_WIDTH, 47, 'F');
  applyFill(document, COLORS.teal);
  document.rect(0, 0, PAGE_WIDTH, 3, 'F');

  applyText(document, COLORS.white);
  document.setFont('helvetica', 'bold');
  document.setFontSize(12);
  document.text(copy.brand, MARGIN, 16);
  document.setFontSize(19);
  document.text(copy.documentTitle, MARGIN, 29);
  document.setFont('helvetica', 'normal');
  document.setFontSize(10);
  document.text(copy.reportName, MARGIN, 37);
  document.setFontSize(8);
  document.text('SGC / HYUNDAI', PAGE_WIDTH - MARGIN, 16, { align: 'right' });

  applyFill(document, COLORS.white);
  applyDraw(document, COLORS.lightSlate);
  document.roundedRect(MARGIN, 57, CONTENT_WIDTH, 31, 3, 3, 'FD');
  applyDraw(document, COLORS.lightSlate);
  document.line(75, 62, 75, 83);
  document.line(131, 62, 131, 83);

  [
    { label: copy.client, value: copy.clientName, x: 22, maxWidth: 48 },
    { label: copy.channel, value: copy.channelName, x: 81, maxWidth: 44 },
    { label: copy.period, value: period, x: 137, maxWidth: 51 },
  ].forEach(item => {
    applyText(document, COLORS.slate);
    document.setFont('helvetica', 'bold');
    document.setFontSize(7.5);
    document.text(item.label.toUpperCase(), item.x, 66);
    applyText(document, COLORS.navy);
    document.setFont('helvetica', 'normal');
    document.setFontSize(9);
    document.text(`${item.value || ''}`, item.x, 76, {
      maxWidth: item.maxWidth,
    });
  });

  applyText(document, COLORS.navy);
  document.setFont('helvetica', 'bold');
  document.setFontSize(12);
  document.text(copy.totalConversations, MARGIN, 102);

  metrics.forEach((metric, index) => {
    const stage = metric.stage || {};
    drawMetricCard(document, {
      x: MARGIN + index * 60.75,
      label: metric.label,
      value: formatNumber(stage.count, locale),
      rate: formatPercentage(stage.rate_from_start_pct, locale),
      color: metric.color,
    });
  });

  applyText(document, COLORS.navy);
  document.setFont('helvetica', 'bold');
  document.setFontSize(12);
  document.text(copy.distribution, MARGIN, 151);

  applyFill(document, COLORS.navy);
  document.roundedRect(MARGIN, 157, CONTENT_WIDTH, 9, 2, 2, 'F');
  applyText(document, COLORS.white);
  document.setFont('helvetica', 'bold');
  document.setFontSize(7.5);
  document.text(copy.stage.toUpperCase(), 22, 163);
  document.text(copy.conversations.toUpperCase(), 160, 163, { align: 'right' });
  document.text(copy.conversion.toUpperCase(), 188, 163, { align: 'right' });

  exportStages.forEach((stage, index) => {
    const y = 176 + index * 13;
    const color = [COLORS.blue, COLORS.teal, COLORS.amber][index];
    const rate = Math.max(
      0,
      Math.min(toNumber(stage.rate_from_start_pct), 100)
    );

    applyFill(document, COLORS.lighterSlate);
    document.roundedRect(MARGIN, y - 7, CONTENT_WIDTH, 10, 1.5, 1.5, 'F');
    applyFill(document, color);
    document.roundedRect(22, y - 3, 70 * (rate / 100), 2, 1, 1, 'F');

    applyText(document, COLORS.navy);
    document.setFont('helvetica', 'normal');
    document.setFontSize(8.5);
    document.text(trimText(stage.label, 30), 22, y - 1);
    document.setFont('helvetica', 'bold');
    document.text(formatNumber(stage.count, locale), 160, y - 1, {
      align: 'right',
    });
    document.text(`${formatPercentage(rate, locale)}%`, 188, y - 1, {
      align: 'right',
    });
  });

  const funnelY = 166 + exportStages.length * 13 + 19;
  applyText(document, COLORS.navy);
  document.setFont('helvetica', 'bold');
  document.setFontSize(12);
  document.text(copy.funnel, MARGIN, funnelY);

  exportStages.forEach((stage, index) => {
    const rate = Math.max(
      0,
      Math.min(toNumber(stage.rate_from_start_pct), 100)
    );
    const width = Math.max(46, 154 * (rate / 100));
    const x = (PAGE_WIDTH - width) / 2;
    const y = funnelY + 8 + index * 13;
    const color = [COLORS.blue, COLORS.teal, COLORS.amber][index];

    applyFill(document, color);
    document.roundedRect(x, y, width, 9, 2, 2, 'F');
    applyText(document, COLORS.white);
    document.setFont('helvetica', 'bold');
    document.setFontSize(8.5);
    document.text(
      `${trimText(stage.label, 28)}  ${formatNumber(stage.count, locale)}`,
      PAGE_WIDTH / 2,
      y + 5.8,
      { align: 'center' }
    );
  });

  applyDraw(document, COLORS.lightSlate);
  document.line(
    MARGIN,
    PAGE_HEIGHT - 18,
    PAGE_WIDTH - MARGIN,
    PAGE_HEIGHT - 18
  );
  applyText(document, COLORS.slate);
  document.setFont('helvetica', 'normal');
  document.setFontSize(7.5);
  document.text(
    generatedAt ? `${copy.generatedAt}: ${generatedAt}` : copy.generatedAt,
    MARGIN,
    PAGE_HEIGHT - 12
  );
  document.text(copy.brand, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 12, {
    align: 'right',
  });

  document.save(buildIntegrationSgcReportFilename(report));
};
