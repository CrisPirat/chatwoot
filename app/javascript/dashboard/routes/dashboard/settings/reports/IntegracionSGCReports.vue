<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ReportsAPI from 'dashboard/api/reports';
import { useAlert } from 'dashboard/composables';
import { useLiveRefresh } from 'dashboard/composables/useLiveRefresh';
import { useNumberFormatter } from 'shared/composables/useNumberFormatter';
import ReportHeader from './components/ReportHeader.vue';
import { exportIntegrationSgcReportPdf } from './helpers/integrationSgcReportPdf';

const FUNNEL_CENTER_X = 500;
const FUNNEL_MAX_WIDTH = 680;
const FUNNEL_MIN_WIDTH = 160;
const FUNNEL_STAGE_HEIGHT = 125;
const FUNNEL_STAGE_GAP = 15;
const REFRESH_INTERVAL = 60000;
const RANGE_MODES = {
  LIVE: 'live',
  LAST_30_DAYS: 'last_30_days',
  LAST_MONTH: 'last_month',
  CUSTOM: 'custom',
  ALL: 'all',
};
const STAGE_APPEARANCES = [
  'bg-n-blue-9 fill-n-blue-9',
  'bg-n-teal-9 fill-n-teal-9',
  'bg-n-amber-9 fill-n-amber-9',
  'bg-n-ruby-9 fill-n-ruby-9',
];

const { t, locale } = useI18n();
const { formatFullNumber } = useNumberFormatter();
const report = ref(null);
const isFetching = ref(true);
const hasError = ref(false);
const rangeMode = ref(RANGE_MODES.LIVE);
const customFromDate = ref('');
const customToDate = ref('');
const isLiveRefreshActive = ref(false);
const isExporting = ref(false);
let activeRequestController = null;

const localeCode = computed(() => locale?.value);
const isInitialLoading = computed(() => isFetching.value && !report.value);
const isCustomRangeValid = computed(() => {
  return (
    customFromDate.value &&
    customToDate.value &&
    customFromDate.value <= customToDate.value
  );
});
const statusLabel = computed(() => {
  if (isInitialLoading.value) return t('SGC_INTEGRATION_REPORTS.LOADING');
  if (isFetching.value) return t('SGC_INTEGRATION_REPORTS.REFRESHING');
  if (hasError.value) return t('SGC_INTEGRATION_REPORTS.STALE');

  return rangeMode.value === RANGE_MODES.LIVE
    ? t('SGC_INTEGRATION_REPORTS.LIVE')
    : t('SGC_INTEGRATION_REPORTS.FILTERS.HISTORICAL');
});

const toNumber = value => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const formatPercentage = value => {
  const formattedValue = new Intl.NumberFormat(localeCode.value, {
    maximumFractionDigits: 1,
  }).format(toNumber(value));

  return `${formattedValue}%`;
};

const formatDate = value => {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(localeCode.value, {
    day: 'numeric',
    month: 'short',
  }).format(date);
};

const formatDateInput = value => {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const initializeCustomRange = () => {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 6);
  customFromDate.value = formatDateInput(from);
  customToDate.value = formatDateInput(to);
};

const setPresetRange = range => {
  const today = new Date();
  let from = new Date(today);
  let to = new Date(today);

  if (range === RANGE_MODES.LAST_30_DAYS) {
    from.setDate(from.getDate() - 29);
  }

  if (range === RANGE_MODES.LAST_MONTH) {
    from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    to = new Date(today.getFullYear(), today.getMonth(), 0);
  }

  customFromDate.value = formatDateInput(from);
  customToDate.value = formatDateInput(to);
};

const formatGeneratedAt = (value, timezone) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const options = {
    dateStyle: 'medium',
    timeStyle: 'short',
  };

  if (timezone) options.timeZone = timezone;

  try {
    return new Intl.DateTimeFormat(localeCode.value, options).format(date);
  } catch {
    return new Intl.DateTimeFormat(localeCode.value, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }
};

const widthForRate = rate => {
  const normalizedRate = Math.min(Math.max(toNumber(rate), 0), 100);
  return Math.max(FUNNEL_MIN_WIDTH, (FUNNEL_MAX_WIDTH * normalizedRate) / 100);
};

const polygonPoints = (topWidth, bottomWidth, topY, bottomY) => {
  return [
    `${FUNNEL_CENTER_X - topWidth / 2},${topY}`,
    `${FUNNEL_CENTER_X + topWidth / 2},${topY}`,
    `${FUNNEL_CENTER_X + bottomWidth / 2},${bottomY}`,
    `${FUNNEL_CENTER_X - bottomWidth / 2},${bottomY}`,
  ].join(' ');
};

const mobileWidthClass = rate => {
  if (rate >= 75) return 'w-full';
  if (rate >= 50) return 'w-4/5';
  if (rate >= 25) return 'w-3/5';

  return 'w-2/5';
};

const funnelStages = computed(() => {
  const stages = report.value?.funnel?.stages || [];
  let previousWidth = FUNNEL_MAX_WIDTH;

  return stages.map((stage, index) => {
    const rate = toNumber(stage.rate_from_start_pct);
    const width = index === 0 ? FUNNEL_MAX_WIDTH : widthForRate(rate);
    const topY = 30 + index * (FUNNEL_STAGE_HEIGHT + FUNNEL_STAGE_GAP);
    const bottomY = topY + FUNNEL_STAGE_HEIGHT;
    const lossCount = toNumber(stage.drop_off_from_previous);
    const hasLoss = stage.drop_off_from_previous != null && lossCount > 0;
    const isFinalStage = index === stages.length - 1;
    const appearance =
      STAGE_APPEARANCES[index % STAGE_APPEARANCES.length] ||
      STAGE_APPEARANCES[0];
    const value = formatFullNumber(toNumber(stage.count));
    const percentage = formatPercentage(rate);
    const loss = hasLoss ? `-${formatFullNumber(lossCount)}` : null;
    const ariaLoss = hasLoss
      ? t('SGC_INTEGRATION_REPORTS.FUNNEL.ARIA_LOSS', {
          count: formatFullNumber(lossCount),
        })
      : '';

    const funnelStage = {
      label: stage.label,
      value,
      percentage,
      mobileValue: `${value} (${percentage})`,
      loss,
      colorClass: appearance,
      mobileWidthClass: mobileWidthClass(rate),
      points: polygonPoints(previousWidth, width, topY, bottomY),
      labelY: topY + 55,
      valueY: topY + 100,
      lossY: topY + 70,
      calloutY: topY + FUNNEL_STAGE_HEIGHT / 2,
      calloutStartX: FUNNEL_CENTER_X + width / 2 + 5,
      isFinalStage,
      labelClass:
        width <= FUNNEL_MIN_WIDTH
          ? 'fill-black text-xs font-medium'
          : 'fill-black text-lg font-medium',
      valueClass:
        width <= FUNNEL_MIN_WIDTH
          ? 'fill-black text-2xl font-medium'
          : 'fill-black text-4xl font-medium',
      ariaDescription: t('SGC_INTEGRATION_REPORTS.FUNNEL.ARIA_STAGE', {
        label: stage.label,
        count: value,
        percentage: formatFullNumber(rate),
        loss: ariaLoss,
      }),
    };

    previousWidth = width;
    return funnelStage;
  });
});

const funnelChartHeight = computed(() => {
  const stageHeight =
    30 + funnelStages.value.length * (FUNNEL_STAGE_HEIGHT + FUNNEL_STAGE_GAP);
  return Math.max(250, stageHeight);
});

const funnelAriaLabel = computed(() => {
  const stages = funnelStages.value
    .map(stage => stage.ariaDescription)
    .join('. ');

  return t('SGC_INTEGRATION_REPORTS.FUNNEL.ARIA_LABEL', { stages });
});

const dateRangeLabel = computed(() => {
  const funnel = report.value?.funnel;
  if (!funnel) return '';
  if (!funnel.from_date || !funnel.to_date) {
    return t('SGC_INTEGRATION_REPORTS.FUNNEL.ALL_TIME');
  }

  return t('SGC_INTEGRATION_REPORTS.FUNNEL.DATE_RANGE', {
    from: formatDate(funnel.from_date),
    to: formatDate(funnel.to_date),
  });
});

const lastUpdatedLabel = computed(() => {
  if (!report.value?.generated_at) return '';

  return t('SGC_INTEGRATION_REPORTS.UPDATED_AT', {
    time: formatGeneratedAt(report.value.generated_at, report.value.timezone),
  });
});

const exportReport = async () => {
  if (!report.value || isExporting.value) return;

  isExporting.value = true;

  try {
    await exportIntegrationSgcReportPdf({
      report: report.value,
      period: dateRangeLabel.value,
      generatedAt: formatGeneratedAt(
        report.value.generated_at,
        report.value.timezone
      ),
      locale: localeCode.value,
      labels: {
        documentTitle: t('SGC_INTEGRATION_REPORTS.EXPORT.DOCUMENT_TITLE'),
        reportName: t('SGC_INTEGRATION_REPORTS.HEADER'),
        client: t('SGC_INTEGRATION_REPORTS.EXPORT.CLIENT'),
        clientName: t('SGC_INTEGRATION_REPORTS.EXPORT.CLIENT_NAME'),
        channel: t('SGC_INTEGRATION_REPORTS.EXPORT.CHANNEL'),
        channelName: t('SGC_INTEGRATION_REPORTS.EXPORT.CHANNEL_NAME'),
        period: t('SGC_INTEGRATION_REPORTS.FILTERS.LABEL'),
        totalConversations: t(
          'SGC_INTEGRATION_REPORTS.EXPORT.TOTAL_CONVERSATIONS'
        ),
        step4: t('SGC_INTEGRATION_REPORTS.EXPORT.STEP_4'),
        step6: t('SGC_INTEGRATION_REPORTS.EXPORT.STEP_6'),
        distribution: t('SGC_INTEGRATION_REPORTS.EXPORT.DISTRIBUTION'),
        stage: t('SGC_INTEGRATION_REPORTS.EXPORT.STAGE'),
        conversations: t('SGC_INTEGRATION_REPORTS.EXPORT.CONVERSATIONS'),
        conversion: t('SGC_INTEGRATION_REPORTS.EXPORT.CONVERSION'),
        funnel: t('SGC_INTEGRATION_REPORTS.EXPORT.FUNNEL'),
        generatedAt: t('SGC_INTEGRATION_REPORTS.EXPORT.GENERATED_AT'),
      },
    });
  } catch {
    useAlert(t('SGC_INTEGRATION_REPORTS.EXPORT.ERROR'));
  } finally {
    isExporting.value = false;
  }
};

const isAbortError = error =>
  error?.name === 'AbortError' ||
  error?.name === 'CanceledError' ||
  error?.code === 'ERR_CANCELED';

const abortActiveRequest = () => {
  activeRequestController?.abort();
  activeRequestController = null;
};

const reportRequest = () => {
  if (rangeMode.value === RANGE_MODES.ALL) return { all: true };
  if (
    [
      RANGE_MODES.CUSTOM,
      RANGE_MODES.LAST_30_DAYS,
      RANGE_MODES.LAST_MONTH,
    ].includes(rangeMode.value)
  ) {
    return {
      fromDate: customFromDate.value,
      toDate: customToDate.value,
    };
  }

  return {};
};

const fetchReport = async () => {
  if (activeRequestController) return;

  const controller = new AbortController();
  activeRequestController = controller;
  isFetching.value = true;
  hasError.value = false;

  try {
    const { data } = await ReportsAPI.getIntegrationSgcReport({
      ...reportRequest(),
      signal: controller.signal,
    });

    if (!Array.isArray(data?.funnel?.stages)) {
      throw new Error('Invalid SGC report response');
    }

    report.value = data;
  } catch (error) {
    if (!isAbortError(error)) hasError.value = true;
  } finally {
    if (activeRequestController === controller) {
      activeRequestController = null;
      isFetching.value = false;
    }
  }
};

const { startRefetching, stopRefetching } = useLiveRefresh(
  fetchReport,
  REFRESH_INTERVAL
);

const startLiveRefresh = () => {
  if (isLiveRefreshActive.value) return;

  startRefetching();
  isLiveRefreshActive.value = true;
};

const stopLiveRefresh = () => {
  stopRefetching();
  isLiveRefreshActive.value = false;
};

const applyRange = async () => {
  if (rangeMode.value === RANGE_MODES.CUSTOM && !isCustomRangeValid.value) {
    return;
  }

  stopLiveRefresh();
  abortActiveRequest();
  await fetchReport();

  if (rangeMode.value === RANGE_MODES.LIVE) startLiveRefresh();
};

const onRangeModeChange = () => {
  if (rangeMode.value === RANGE_MODES.CUSTOM && !customFromDate.value) {
    initializeCustomRange();
  }

  if (
    [RANGE_MODES.LAST_30_DAYS, RANGE_MODES.LAST_MONTH].includes(rangeMode.value)
  ) {
    setPresetRange(rangeMode.value);
  }

  applyRange();
};

onMounted(() => {
  initializeCustomRange();
  applyRange();
});

onBeforeUnmount(() => {
  stopLiveRefresh();
  abortActiveRequest();
});
</script>

<template>
  <ReportHeader :header-title="$t('SGC_INTEGRATION_REPORTS.HEADER')" />

  <div class="flex flex-col gap-4 pb-6">
    <section
      v-if="isInitialLoading"
      data-testid="sgc-report-loading"
      class="rounded-xl bg-n-solid-2 px-5 py-12 text-center shadow outline outline-1 outline-n-container sm:px-6"
    >
      <p class="mb-0 text-sm text-n-slate-11">
        {{ $t('SGC_INTEGRATION_REPORTS.LOADING') }}
      </p>
    </section>

    <section
      v-else-if="hasError && !report"
      data-testid="sgc-report-error"
      class="rounded-xl bg-n-solid-2 px-5 py-12 text-center shadow outline outline-1 outline-n-container sm:px-6"
    >
      <p class="mb-4 text-sm text-n-slate-11" role="alert">
        {{ $t('SGC_INTEGRATION_REPORTS.ERROR') }}
      </p>
      <button
        type="button"
        class="rounded-lg bg-n-brand px-4 py-2 text-sm font-medium text-white"
        @click="fetchReport"
      >
        {{ $t('SGC_INTEGRATION_REPORTS.RETRY') }}
      </button>
    </section>

    <section
      v-else-if="report"
      class="rounded-xl bg-n-solid-2 px-5 py-6 shadow outline outline-1 outline-n-container sm:px-6"
    >
      <div
        class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
      >
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="text-heading-2 text-n-slate-12">
                {{ $t('SGC_INTEGRATION_REPORTS.FUNNEL.HEADER') }}
              </h2>
              <p class="mb-0 mt-2 text-sm text-n-slate-10">
                {{ dateRangeLabel }}
              </p>
            </div>
            <button
              data-testid="sgc-export-pdf"
              type="button"
              class="flex shrink-0 items-center gap-2 rounded-lg border border-n-strong px-3 py-2 text-sm font-medium text-n-slate-12 hover:bg-n-solid-3 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="isExporting"
              @click="exportReport"
            >
              <i class="i-lucide-download size-4" />
              {{
                isExporting
                  ? $t('SGC_INTEGRATION_REPORTS.EXPORT.GENERATING')
                  : $t('SGC_INTEGRATION_REPORTS.EXPORT.ACTION')
              }}
            </button>
          </div>
          <div class="mt-3 flex flex-wrap items-end gap-2">
            <label class="flex flex-col gap-1">
              <span class="text-xs font-medium text-n-slate-11">
                {{ $t('SGC_INTEGRATION_REPORTS.FILTERS.LABEL') }}
              </span>
              <select
                v-model="rangeMode"
                data-testid="sgc-range-mode"
                class="rounded-lg border border-n-strong bg-n-solid-2 px-3 py-2 text-sm text-n-slate-12 outline-none focus:border-n-brand"
                @change="onRangeModeChange"
              >
                <option :value="RANGE_MODES.LIVE">
                  {{ $t('SGC_INTEGRATION_REPORTS.FILTERS.LIVE') }}
                </option>
                <option :value="RANGE_MODES.LAST_30_DAYS">
                  {{ $t('SGC_INTEGRATION_REPORTS.FILTERS.LAST_30_DAYS') }}
                </option>
                <option :value="RANGE_MODES.LAST_MONTH">
                  {{ $t('SGC_INTEGRATION_REPORTS.FILTERS.LAST_MONTH') }}
                </option>
                <option :value="RANGE_MODES.CUSTOM">
                  {{ $t('SGC_INTEGRATION_REPORTS.FILTERS.CUSTOM') }}
                </option>
                <option :value="RANGE_MODES.ALL">
                  {{ $t('SGC_INTEGRATION_REPORTS.FILTERS.ALL') }}
                </option>
              </select>
            </label>

            <template v-if="rangeMode === RANGE_MODES.CUSTOM">
              <label class="flex flex-col gap-1">
                <span class="text-xs font-medium text-n-slate-11">
                  {{ $t('SGC_INTEGRATION_REPORTS.FILTERS.FROM') }}
                </span>
                <input
                  v-model="customFromDate"
                  data-testid="sgc-range-from"
                  type="date"
                  :max="customToDate"
                  class="rounded-lg border border-n-strong bg-n-solid-2 px-3 py-2 text-sm text-n-slate-12 outline-none focus:border-n-brand"
                />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-xs font-medium text-n-slate-11">
                  {{ $t('SGC_INTEGRATION_REPORTS.FILTERS.TO') }}
                </span>
                <input
                  v-model="customToDate"
                  data-testid="sgc-range-to"
                  type="date"
                  :min="customFromDate"
                  class="rounded-lg border border-n-strong bg-n-solid-2 px-3 py-2 text-sm text-n-slate-12 outline-none focus:border-n-brand"
                />
              </label>
              <button
                data-testid="sgc-range-apply"
                type="button"
                class="rounded-lg bg-n-brand px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="!isCustomRangeValid || isFetching"
                @click="applyRange"
              >
                {{ $t('SGC_INTEGRATION_REPORTS.FILTERS.APPLY') }}
              </button>
            </template>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-2 text-sm font-medium">
          <span
            class="size-2 rounded-full"
            :class="hasError ? 'bg-n-amber-9' : 'bg-n-teal-9'"
          />
          <div>
            <p
              data-testid="sgc-report-status"
              class="mb-0"
              :class="hasError ? 'text-n-amber-10' : 'text-n-teal-10'"
            >
              {{ statusLabel }}
            </p>
            <p v-if="lastUpdatedLabel" class="mb-0 text-xs text-n-slate-10">
              {{ lastUpdatedLabel }}
            </p>
          </div>
        </div>
      </div>

      <p
        v-if="hasError"
        data-testid="sgc-report-stale-data"
        class="mb-0 mt-3 text-sm text-n-amber-10"
        role="status"
      >
        {{ $t('SGC_INTEGRATION_REPORTS.STALE_DATA') }}
      </p>

      <div class="relative">
        <div
          v-if="isFetching"
          data-testid="sgc-funnel-refreshing"
          class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-lg bg-n-solid-2/90 text-center backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <span class="size-3 animate-pulse rounded-full bg-n-brand" />
          <p class="mb-0 text-sm font-medium text-n-slate-11">
            {{ $t('SGC_INTEGRATION_REPORTS.REFRESHING') }}
          </p>
        </div>

        <div class="hidden mt-6 overflow-x-auto md:block">
          <svg
            data-testid="sgc-funnel-chart"
            class="h-auto min-w-[720px] w-full"
            :viewBox="`0 0 1000 ${funnelChartHeight}`"
            role="img"
            :aria-label="funnelAriaLabel"
          >
            <g
              v-for="stage in funnelStages"
              :key="stage.label"
              data-testid="sgc-funnel-stage"
            >
              <polygon :points="stage.points" :class="stage.colorClass" />

              <template v-if="stage.isFinalStage">
                <line
                  :x1="stage.calloutStartX"
                  :y1="stage.calloutY"
                  x2="695"
                  :y2="stage.calloutY"
                  class="stroke-n-container"
                  stroke-width="2"
                />
                <text
                  x="715"
                  :y="stage.calloutY - 12"
                  class="fill-n-ruby-10 text-sm font-medium"
                >
                  {{ stage.label }}
                </text>
                <text
                  x="715"
                  :y="stage.calloutY + 26"
                  class="fill-n-slate-12 text-3xl font-medium"
                >
                  {{ stage.value }}
                </text>
              </template>
              <template v-else>
                <text
                  x="500"
                  :y="stage.labelY"
                  text-anchor="middle"
                  :class="stage.labelClass"
                >
                  {{ stage.label }}
                </text>
                <text
                  x="500"
                  :y="stage.valueY"
                  text-anchor="middle"
                  :class="stage.valueClass"
                >
                  {{ stage.value }}
                </text>
              </template>

              <text
                x="900"
                :y="
                  stage.isFinalStage ? stage.calloutY + 18 : stage.labelY + 10
                "
                text-anchor="middle"
                class="fill-n-slate-10 text-lg"
              >
                {{ stage.percentage }}
              </text>
              <text
                v-if="stage.loss"
                x="80"
                :y="stage.lossY"
                text-anchor="middle"
                class="fill-n-slate-10 text-lg"
              >
                {{ stage.loss }}
              </text>
            </g>
          </svg>
        </div>

        <div class="flex flex-col items-center gap-2 mt-6 md:hidden">
          <div
            v-for="stage in funnelStages"
            :key="stage.label"
            class="flex flex-col items-center w-full gap-1"
          >
            <span
              v-if="stage.loss"
              data-testid="sgc-funnel-loss-mobile"
              class="w-full text-xs font-medium text-left text-n-slate-10"
            >
              {{ stage.loss }}
            </span>
            <div
              data-testid="sgc-funnel-stage-mobile"
              class="rounded-lg px-3 py-3 text-center !text-black-900"
              :class="[stage.colorClass, stage.mobileWidthClass]"
            >
              <p class="mb-1 text-sm font-medium">{{ stage.label }}</p>
              <p class="mb-0 text-2xl font-medium">
                {{ stage.mobileValue }}
              </p>
            </div>
          </div>
        </div>

        <div
          class="flex flex-wrap gap-x-5 gap-y-2 mt-6 pt-5 border-t border-n-container"
        >
          <div
            v-for="stage in funnelStages"
            :key="`legend-${stage.label}`"
            class="flex items-center gap-2 text-sm text-n-slate-11"
          >
            <span class="size-3 rounded-sm" :class="stage.colorClass" />
            {{ stage.label }}
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
