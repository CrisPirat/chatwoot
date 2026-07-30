require 'rails_helper'

RSpec.describe 'Api::V2::Accounts::IntegrationSgcReports', type: :request do
  let(:account) { create(:account) }
  let(:admin) { create(:user, account: account, role: :administrator) }
  let(:agent) { create(:user, account: account, role: :agent) }
  let(:fetcher) { instance_double(IntegrationSgc::ReportFetcher) }
  let(:report) do
    {
      generated_at: '2026-07-17T08:03:44.993252-05:00',
      timezone: 'America/Guayaquil',
      conversation_summary: { open: 8, unattended: 5, unassigned: 3, pending: 1 },
      funnel: {
        from_date: '2026-07-11',
        to_date: '2026-07-17',
        stages: []
      }
    }
  end

  describe 'GET /api/v2/accounts/:account_id/integration_sgc_report' do
    it 'returns unauthorized when unauthenticated' do
      get "/api/v2/accounts/#{account.id}/integration_sgc_report"

      expect(response).to have_http_status(:unauthorized)
    end

    it 'does not expose the report to a non-administrator' do
      get "/api/v2/accounts/#{account.id}/integration_sgc_report",
          headers: agent.create_new_auth_token,
          as: :json

      expect(response).to have_http_status(:unauthorized)
    end

    it 'returns the normalized SGC report to an administrator' do
      allow(IntegrationSgc::ReportFetcher).to receive(:new).and_return(fetcher)
      allow(fetcher).to receive(:perform).and_return(report)

      get "/api/v2/accounts/#{account.id}/integration_sgc_report",
          headers: admin.create_new_auth_token,
          as: :json

      expect(response).to have_http_status(:success)
      expect(response.parsed_body).to eq(report.deep_stringify_keys)
    end

    it 'forwards a custom date range without accepting an inbox filter' do
      expect(IntegrationSgc::ReportFetcher).to receive(:new).with(
        from_date: '2026-07-01',
        to_date: '2026-07-29',
        all: false
      ).and_return(fetcher)
      allow(fetcher).to receive(:perform).and_return(report)

      get "/api/v2/accounts/#{account.id}/integration_sgc_report",
          params: {
            from_date: '2026-07-01',
            to_date: '2026-07-29',
            inbox_id: 9
          },
          headers: admin.create_new_auth_token,
          as: :json

      expect(response).to have_http_status(:success)
    end

    it 'forwards the all-history option' do
      expect(IntegrationSgc::ReportFetcher).to receive(:new).with(
        from_date: nil,
        to_date: nil,
        all: true
      ).and_return(fetcher)
      allow(fetcher).to receive(:perform).and_return(report)

      get "/api/v2/accounts/#{account.id}/integration_sgc_report",
          params: { all: true },
          headers: admin.create_new_auth_token,
          as: :json

      expect(response).to have_http_status(:success)
    end

    it 'returns an invalid range error' do
      allow(IntegrationSgc::ReportFetcher).to receive(:new).and_raise(
        IntegrationSgc::ReportFetcher::InvalidRangeError,
        'from date must precede to date'
      )

      get "/api/v2/accounts/#{account.id}/integration_sgc_report",
          params: { from_date: '2026-07-29', to_date: '2026-07-01' },
          headers: admin.create_new_auth_token,
          as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(response.parsed_body).to eq('error' => 'Invalid SGC report range')
    end

    it 'returns a generic gateway error when the webhook fails' do
      allow(IntegrationSgc::ReportFetcher).to receive(:new).and_return(fetcher)
      allow(fetcher).to receive(:perform).and_raise(SafeFetch::FetchError, 'timeout')

      get "/api/v2/accounts/#{account.id}/integration_sgc_report",
          headers: admin.create_new_auth_token,
          as: :json

      expect(response).to have_http_status(:bad_gateway)
      expect(response.parsed_body).to eq('error' => 'Unable to retrieve SGC report')
    end
  end
end
