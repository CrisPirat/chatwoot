class Api::V2::Accounts::IntegrationSgcReportsController < Api::V1::Accounts::BaseController
  before_action :check_authorization

  def show
    render json: IntegrationSgc::ReportFetcher.new(**report_options).perform
  rescue IntegrationSgc::ReportFetcher::InvalidRangeError
    render json: { error: 'Invalid SGC report range' }, status: :unprocessable_entity
  rescue IntegrationSgc::ReportFetcher::InvalidResponseError, SafeFetch::Error => e
    Rails.logger.warn("[Integration SGC] Report fetch failed: #{e.class}")
    render json: { error: 'Unable to retrieve SGC report' }, status: :bad_gateway
  end

  private

  def check_authorization
    authorize :report, :view?
  end

  def report_options
    {
      from_date: params[:from_date],
      to_date: params[:to_date],
      all: ActiveModel::Type::Boolean.new.cast(params[:all]) || false
    }
  end
end
