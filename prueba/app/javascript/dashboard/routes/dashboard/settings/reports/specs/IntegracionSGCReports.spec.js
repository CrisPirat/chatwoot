import { flushPromises, mount } from '@vue/test-utils';
import IntegracionSGCReports from '../IntegracionSGCReports.vue';

const translations = vi.hoisted(() => ({
  'SGC_INTEGRATION_REPORTS.HEADER': 'Integración SGC',
  'SGC_INTEGRATION_REPORTS.LIVE': 'En vivo',
  'SGC_INTEGRATION_REPORTS.LOADING': 'Cargando informe SGC...',
  'SGC_INTEGRATION_REPORTS.STALE': 'Datos sin actualizar',
  'SGC_INTEGRATION_REPORTS.STALE_DATA':
    'No se pudo actualizar. Se muestran los últimos datos disponibles.',
  'SGC_INTEGRATION_REPORTS.ERROR': 'No se pudo cargar el informe SGC.',
  'SGC_INTEGRATION_REPORTS.RETRY': 'Reintentar',
  'SGC_INTEGRATION_REPORTS.REFRESHING':
    'Actualizando el gráfico con los datos seleccionados...',
  'SGC_INTEGRATION_REPORTS.UPDATED_AT': 'Actualizado: {time}',
  'SGC_INTEGRATION_REPORTS.FILTERS.LABEL': 'Periodo',
  'SGC_INTEGRATION_REPORTS.FILTERS.LIVE': 'Últimos 7 días',
  'SGC_INTEGRATION_REPORTS.FILTERS.LAST_30_DAYS': 'Últimos 30 días',
  'SGC_INTEGRATION_REPORTS.FILTERS.LAST_MONTH': 'Último mes',
  'SGC_INTEGRATION_REPORTS.FILTERS.CUSTOM': 'Rango personalizado',
  'SGC_INTEGRATION_REPORTS.FILTERS.ALL': 'Todo el histórico',
  'SGC_INTEGRATION_REPORTS.FILTERS.FROM': 'Desde',
  'SGC_INTEGRATION_REPORTS.FILTERS.TO': 'Hasta',
  'SGC_INTEGRATION_REPORTS.FILTERS.APPLY': 'Aplicar',
  'SGC_INTEGRATION_REPORTS.FILTERS.HISTORICAL': 'Histórico',
  'SGC_INTEGRATION_REPORTS.EXPORT.ACTION': 'Exportar PDF',
  'SGC_INTEGRATION_REPORTS.EXPORT.GENERATING': 'Generando PDF...',
  'SGC_INTEGRATION_REPORTS.EXPORT.ERROR':
    'No se pudo generar el PDF. Inténtalo de nuevo.',
  'SGC_INTEGRATION_REPORTS.EXPORT.DOCUMENT_TITLE':
    'Informe de agendamientos',
  'SGC_INTEGRATION_REPORTS.EXPORT.CLIENT': 'Cliente',
  'SGC_INTEGRATION_REPORTS.EXPORT.CLIENT_NAME': 'Hyundai Ecuador',
  'SGC_INTEGRATION_REPORTS.EXPORT.CHANNEL': 'Agente y canal',
  'SGC_INTEGRATION_REPORTS.EXPORT.CHANNEL_NAME':
    'Baekho / WhatsApp Business',
  'SGC_INTEGRATION_REPORTS.EXPORT.TOTAL_CONVERSATIONS':
    'Total de conversaciones',
  'SGC_INTEGRATION_REPORTS.EXPORT.STEP_4': 'Agendamiento paso 4',
  'SGC_INTEGRATION_REPORTS.EXPORT.STEP_6': 'Agendamiento paso 6',
  'SGC_INTEGRATION_REPORTS.EXPORT.DISTRIBUTION': 'Distribución de etapas',
  'SGC_INTEGRATION_REPORTS.EXPORT.STAGE': 'Etapa',
  'SGC_INTEGRATION_REPORTS.EXPORT.CONVERSATIONS': 'Conversaciones',
  'SGC_INTEGRATION_REPORTS.EXPORT.CONVERSION': 'Conversión',
  'SGC_INTEGRATION_REPORTS.EXPORT.FUNNEL': 'Embudo de conversión',
  'SGC_INTEGRATION_REPORTS.EXPORT.GENERATED_AT': 'Generado',
  'SGC_INTEGRATION_REPORTS.SUMMARY': 'Resumen de conversaciones',
  'SGC_INTEGRATION_REPORTS.METRICS.OPEN': 'Abiertas',
  'SGC_INTEGRATION_REPORTS.METRICS.UNATTENDED': 'Desatendidas',
  'SGC_INTEGRATION_REPORTS.METRICS.UNASSIGNED': 'Sin asignar',
  'SGC_INTEGRATION_REPORTS.METRICS.PENDING': 'Pendientes',
  'SGC_INTEGRATION_REPORTS.FUNNEL.HEADER': 'Embudo por etiquetas',
  'SGC_INTEGRATION_REPORTS.FUNNEL.DATE_RANGE': 'Últimos 7 días · {from} - {to}',
  'SGC_INTEGRATION_REPORTS.FUNNEL.ALL_TIME': 'Todo el histórico',
  'SGC_INTEGRATION_REPORTS.FUNNEL.ARIA_LABEL':
    'Embudo por etiquetas de Integración SGC. {stages}',
  'SGC_INTEGRATION_REPORTS.FUNNEL.ARIA_STAGE':
    '{label}: {count}, {percentage} por ciento{loss}',
  'SGC_INTEGRATION_REPORTS.FUNNEL.ARIA_LOSS': ', pérdida de {count}',
}));

const getIntegrationSgcReport = vi.hoisted(() => vi.fn());
const startRefetching = vi.hoisted(() => vi.fn());
const stopRefetching = vi.hoisted(() => vi.fn());
const exportIntegrationSgcReportPdf = vi.hoisted(() => vi.fn());
const useAlert = vi.hoisted(() => vi.fn());
const useLiveRefresh = vi.hoisted(() =>
  vi.fn(() => ({ startRefetching, stopRefetching }))
);

const translate = (key, values = {}) => {
  return Object.entries(values).reduce(
    (message, [name, value]) => message.replace(`{${name}}`, value),
    translations[key] || key
  );
};

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: { value: 'en-US' },
    t: translate,
  }),
}));

vi.mock('dashboard/api/reports', () => ({
  default: { getIntegrationSgcReport },
}));

vi.mock('dashboard/composables/useLiveRefresh', () => ({
  useLiveRefresh,
}));

vi.mock('dashboard/composables', () => ({ useAlert }));

vi.mock('../helpers/integrationSgcReportPdf', () => ({
  exportIntegrationSgcReportPdf,
}));

vi.mock('shared/composables/useNumberFormatter', () => ({
  useNumberFormatter: () => ({
    formatFullNumber: value => new Intl.NumberFormat('en-US').format(value),
  }),
}));

vi.mock('../components/ReportHeader.vue', () => ({
  default: {
    name: 'ReportHeader',
    props: ['headerTitle'],
    template: '<h1 data-testid="report-header">{{ headerTitle }}</h1>',
  },
}));

const mountComponent = () =>
  mount(IntegracionSGCReports, {
    global: {
      mocks: {
        $t: translate,
      },
    },
  });

const report = {
  generated_at: '2026-07-17T08:03:44.993252-05:00',
  timezone: 'America/Guayaquil',
  conversation_summary: {
    open: 8,
    unattended: 5,
    unassigned: 3,
    pending: 1,
  },
  funnel: {
    from_date: '2026-07-11',
    to_date: '2026-07-17',
    stages: [
      {
        key: 'conversations',
        label: 'Número de conversaciones',
        count: 10,
        rate_from_start_pct: 100,
        drop_off_from_previous: null,
      },
      {
        key: 'vehicle_interest',
        label: 'Interés en vehículo',
        count: 4,
        rate_from_start_pct: 40,
        drop_off_from_previous: 6,
      },
      {
        key: 'appointment_step4',
        label: 'Agendamiento paso 4',
        count: 0,
        rate_from_start_pct: 0,
        drop_off_from_previous: 4,
      },
      {
        key: 'appointment_step6',
        label: 'Agendamiento paso 6',
        count: 0,
        rate_from_start_pct: 0,
        drop_off_from_previous: 0,
      },
    ],
  },
};

const allTimeReport = {
  ...report,
  funnel: {
    ...report.funnel,
    from_date: null,
    to_date: null,
  },
};

describe('IntegracionSGCReports.vue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T12:00:00'));
    getIntegrationSgcReport.mockImplementation(({ all }) => {
      return Promise.resolve({ data: all ? allTimeReport : report });
    });
    exportIntegrationSgcReportPdf.mockResolvedValue();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('renders only the live funnel and starts a 60-second refresh', async () => {
    const wrapper = mountComponent();
    await flushPromises();

    expect(wrapper.find('[data-testid="report-header"]').text()).toBe(
      'Integración SGC'
    );
    expect(wrapper.findAll('[data-testid="sgc-summary-metric"]')).toHaveLength(
      0
    );
    expect(wrapper.find('[data-testid="sgc-range-mode"]').element.value).toBe(
      'live'
    );
    expect(wrapper.text()).not.toContain('Resumen de conversaciones');
    expect(wrapper.text()).toContain('En vivo');
    expect(wrapper.text()).toContain('Actualizado:');
    expect(getIntegrationSgcReport).toHaveBeenCalledOnce();
    expect(useLiveRefresh).toHaveBeenCalledWith(expect.any(Function), 60000);
    expect(startRefetching).toHaveBeenCalledOnce();

    wrapper.unmount();
  });

  it('requests custom and historical funnel ranges without live refresh', async () => {
    const wrapper = mountComponent();
    await flushPromises();

    await wrapper
      .find('[data-testid="sgc-range-mode"]')
      .setValue('last_30_days');
    await flushPromises();

    expect(getIntegrationSgcReport).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fromDate: '2026-06-30',
        toDate: '2026-07-29',
      })
    );

    await wrapper.find('[data-testid="sgc-range-mode"]').setValue('last_month');
    await flushPromises();

    expect(getIntegrationSgcReport).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fromDate: '2026-06-01',
        toDate: '2026-06-30',
      })
    );

    await wrapper.find('[data-testid="sgc-range-mode"]').setValue('all');
    await flushPromises();

    expect(getIntegrationSgcReport).toHaveBeenLastCalledWith(
      expect.objectContaining({ all: true })
    );
    expect(wrapper.text()).toContain('Todo el histórico');
    expect(stopRefetching).toHaveBeenCalled();

    await wrapper.find('[data-testid="sgc-range-mode"]').setValue('custom');
    await flushPromises();
    await wrapper.find('[data-testid="sgc-range-from"]').setValue('2026-07-01');
    await wrapper.find('[data-testid="sgc-range-to"]').setValue('2026-07-29');
    await wrapper.find('[data-testid="sgc-range-apply"]').trigger('click');
    await flushPromises();

    expect(getIntegrationSgcReport).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fromDate: '2026-07-01',
        toDate: '2026-07-29',
      })
    );

    wrapper.unmount();
  });

  it('shows a chart refresh state while filtered data loads', async () => {
    let resolveRequest;
    const updatePromise = new Promise(resolve => {
      resolveRequest = resolve;
    });
    getIntegrationSgcReport
      .mockResolvedValueOnce({ data: report })
      .mockReturnValueOnce(updatePromise);

    const wrapper = mountComponent();
    await flushPromises();

    await wrapper.find('[data-testid="sgc-range-mode"]').setValue('all');
    await flushPromises();

    expect(wrapper.find('[data-testid="sgc-funnel-refreshing"]').text()).toBe(
      'Actualizando el gráfico con los datos seleccionados...'
    );

    resolveRequest({ data: allTimeReport });
    await flushPromises();

    expect(wrapper.find('[data-testid="sgc-funnel-refreshing"]').exists()).toBe(
      false
    );

    wrapper.unmount();
  });

  it('renders endpoint labels and values in the funnel chart', async () => {
    const wrapper = mountComponent();
    await flushPromises();
    const chart = wrapper.find('[data-testid="sgc-funnel-chart"]');

    expect(chart.attributes('aria-label')).toContain(
      'Número de conversaciones: 10'
    );
    expect(chart.attributes('aria-label')).toContain('pérdida de 6');
    expect(wrapper.findAll('[data-testid="sgc-funnel-stage"]')).toHaveLength(4);
    expect(chart.findAll('polygon')).toHaveLength(4);
    expect(chart.text()).toContain('10');
    expect(chart.text()).toContain('4');
    expect(chart.text()).toContain('-6');
    expect(chart.text()).toContain('-4');
    expect(
      wrapper.findAll('[data-testid="sgc-funnel-stage-mobile"]')
    ).toHaveLength(4);
    expect(
      wrapper.findAll('[data-testid="sgc-funnel-loss-mobile"]')
    ).toHaveLength(2);
    expect(wrapper.text()).toContain('Número de conversaciones');
    expect(wrapper.text()).toContain('Agendamiento paso 6');
    expect(wrapper.text()).toContain('Últimos 7 días · Jul 11 - Jul 17');

    wrapper.unmount();
  });

  it('exports the selected report as a PDF', async () => {
    const wrapper = mountComponent();
    await flushPromises();

    expect(wrapper.find('[data-testid="sgc-export-pdf"]').text()).toContain(
      'Exportar PDF'
    );

    await wrapper.find('[data-testid="sgc-export-pdf"]').trigger('click');
    await flushPromises();

    expect(exportIntegrationSgcReportPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        report,
        period: 'Últimos 7 días · Jul 11 - Jul 17',
        locale: 'en-US',
        labels: expect.objectContaining({
          documentTitle: 'Informe de agendamientos',
          totalConversations: 'Total de conversaciones',
          step4: 'Agendamiento paso 4',
          step6: 'Agendamiento paso 6',
        }),
      })
    );

    wrapper.unmount();
  });

  it('shows a retry state when the report cannot be loaded', async () => {
    getIntegrationSgcReport.mockRejectedValueOnce(new Error('Request failed'));
    const wrapper = mountComponent();
    await flushPromises();

    expect(wrapper.find('[data-testid="sgc-report-error"]').text()).toContain(
      'No se pudo cargar el informe SGC.'
    );
    expect(wrapper.find('button').text()).toBe('Reintentar');

    await wrapper.find('button').trigger('click');
    await flushPromises();

    expect(getIntegrationSgcReport).toHaveBeenCalledTimes(2);
    expect(wrapper.findAll('[data-testid="sgc-funnel-stage"]')).toHaveLength(4);

    wrapper.unmount();
  });
});
