require 'rails_helper'

RSpec.describe IntegrationSgc::ReportFetcher do
  let(:payload) do
    {
      generated_at: '2026-07-17T08:03:44.993252-05:00',
      timezone: 'America/Guayaquil',
      scope: { account_id: 2, inbox_id: nil },
      conversation_summary: {
        range: 'live',
        open: 8,
        unattended: 5,
        unassigned: 3,
        pending: 1
      },
      funnel: {
        range: 'last_7_calendar_days',
        from_date: '2026-07-11',
        to_date: '2026-07-17',
        stages: [
          {
            key: 'conversations',
            label: 'Número de conversaciones',
            count: 10,
            rate_from_start_pct: 100,
            rate_from_previous_pct: nil,
            drop_off_from_previous: nil
          },
          {
            key: 'vehicle_interest',
            label: 'Interés en vehículo',
            count: 4,
            rate_from_start_pct: 40,
            rate_from_previous_pct: 40,
            drop_off_from_previous: 6
          }
        ]
      },
      methodology: { count_unit: 'distinct_chatwoot_conversations' }
    }.to_json
  end
  let(:tempfile) { instance_double(Tempfile, read: payload) }
  let(:result) { instance_double(SafeFetch::Result, tempfile: tempfile) }

  describe '#perform' do
    it 'fetches and normalizes the fixed SGC report response' do
      expect(SafeFetch).to receive(:fetch).with(
        described_class::REPORT_URL,
        headers: { 'Accept' => 'application/json' },
        allowed_content_type_prefixes: [],
        allowed_content_types: ['application/json'],
        max_bytes: described_class::MAX_RESPONSE_BYTES
      ).and_yield(result)

      expect(described_class.new.perform).to eq(
        {
          'generated_at' => '2026-07-17T08:03:44.993252-05:00',
          'timezone' => 'America/Guayaquil',
          'conversation_summary' => {
            'open' => 8,
            'unattended' => 5,
            'unassigned' => 3,
            'pending' => 1
          },
          'funnel' => {
            'from_date' => '2026-07-11',
            'to_date' => '2026-07-17',
            'stages' => [
              {
                'key' => 'conversations',
                'label' => 'Número de conversaciones',
                'count' => 10,
                'rate_from_start_pct' => 100,
                'rate_from_previous_pct' => nil,
                'drop_off_from_previous' => nil
              },
              {
                'key' => 'vehicle_interest',
                'label' => 'Interés en vehículo',
                'count' => 4,
                'rate_from_start_pct' => 40,
                'rate_from_previous_pct' => 40,
                'drop_off_from_previous' => 6
              }
            ]
          }
        }
      )
    end

    it 'rejects malformed JSON responses' do
      allow(tempfile).to receive(:read).and_return('{')
      allow(SafeFetch).to receive(:fetch).and_yield(result)

      expect { described_class.new.perform }.to raise_error(
        described_class::InvalidResponseError,
        'unexpected SGC report format'
      )
    end

    it 'requests a custom range with the fixed external account' do
      expected_url = "#{described_class::REPORT_URL}?account_id=2&from_date=2026-07-01&to_date=2026-07-29"

      expect(SafeFetch).to receive(:fetch).with(
        expected_url,
        headers: { 'Accept' => 'application/json' },
        allowed_content_type_prefixes: [],
        allowed_content_types: ['application/json'],
        max_bytes: described_class::MAX_RESPONSE_BYTES
      ).and_yield(result)

      described_class.new(from_date: '2026-07-01', to_date: '2026-07-29').perform
    end

    it 'requests all history and accepts null funnel dates' do
      report = JSON.parse(payload)
      report['funnel']['from_date'] = nil
      report['funnel']['to_date'] = nil
      allow(tempfile).to receive(:read).and_return(report.to_json)

      expected_url = "#{described_class::REPORT_URL}?account_id=2&all=true"
      expect(SafeFetch).to receive(:fetch).with(
        expected_url,
        headers: { 'Accept' => 'application/json' },
        allowed_content_type_prefixes: [],
        allowed_content_types: ['application/json'],
        max_bytes: described_class::MAX_RESPONSE_BYTES
      ).and_yield(result)

      response = described_class.new(all: true).perform

      expect(response.dig('funnel', 'from_date')).to be_nil
      expect(response.dig('funnel', 'to_date')).to be_nil
    end

    it 'allows a negative drop-off when a downstream event count increases' do
      report = JSON.parse(payload)
      report['funnel']['stages'][1]['drop_off_from_previous'] = -1
      allow(tempfile).to receive(:read).and_return(report.to_json)
      allow(SafeFetch).to receive(:fetch).and_yield(result)

      expect(described_class.new.perform.dig('funnel', 'stages', 1, 'drop_off_from_previous')).to eq(-1)
    end

    it 'rejects invalid ranges before fetching' do
      expect do
        described_class.new(from_date: '2026-07-29', to_date: '2026-07-01')
      end.to raise_error(described_class::InvalidRangeError, 'from date must precede to date')

      expect do
        described_class.new(from_date: '2026-07-01', all: true)
      end.to raise_error(described_class::InvalidRangeError, 'all history cannot include dates')
    end

    it 'rejects responses without the expected report shape' do
      allow(tempfile).to receive(:read).and_return({ conversation_summary: {} }.to_json)
      allow(SafeFetch).to receive(:fetch).and_yield(result)

      expect { described_class.new.perform }.to raise_error(
        described_class::InvalidResponseError,
        'unexpected SGC report format'
      )
    end
  end
end
