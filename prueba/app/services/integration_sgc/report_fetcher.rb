# frozen_string_literal: true

require 'date'
require 'json'
require 'uri'

class IntegrationSgc::ReportFetcher
  DEFAULT_REPORT_URL = 'https://hyundai.bkn.aigentss.cloud/webhook/sgc-report-chatwoot'
  REPORT_ACCOUNT_ID = 2
  MAX_RESPONSE_BYTES = 256.kilobytes

  class InvalidResponseError < StandardError; end
  class InvalidRangeError < StandardError; end

  def initialize(from_date: nil, to_date: nil, all: false)
    @from_date = from_date.presence
    @to_date = to_date.presence
    @all = all
    validate_range!
  end

  def perform
    report = nil

    SafeFetch.fetch(
      report_url,
      headers: { 'Accept' => 'application/json' },
      allowed_content_type_prefixes: [],
      allowed_content_types: ['application/json'],
      max_bytes: MAX_RESPONSE_BYTES,
      allow_private_network: allow_private_network?
    ) do |result|
      report = normalize(JSON.parse(result.tempfile.read))
    end

    report
  rescue JSON::ParserError
    raise InvalidResponseError, 'unexpected SGC report format'
  end

  private

  def normalize(report)
    invalid_response! unless report.is_a?(Hash)

    summary = report['conversation_summary']
    funnel = report['funnel']
    invalid_response! unless summary.is_a?(Hash) && funnel.is_a?(Hash)

    {
      'generated_at' => required_string(report, 'generated_at'),
      'timezone' => required_string(report, 'timezone'),
      'conversation_summary' => {
        'open' => non_negative_number(summary, 'open'),
        'unattended' => non_negative_number(summary, 'unattended'),
        'unassigned' => non_negative_number(summary, 'unassigned'),
        'pending' => non_negative_number(summary, 'pending')
      },
      'funnel' => {
        'from_date' => nullable_string(funnel, 'from_date'),
        'to_date' => nullable_string(funnel, 'to_date'),
        'stages' => normalize_stages(funnel)
      }
    }
  end

  def normalize_stages(funnel)
    stages = funnel['stages']
    invalid_response! unless stages.is_a?(Array) && stages.any?

    stages.map do |stage|
      invalid_response! unless stage.is_a?(Hash)

      {
        'key' => required_string(stage, 'key'),
        'label' => required_string(stage, 'label'),
        'count' => non_negative_number(stage, 'count'),
        'rate_from_start_pct' => non_negative_number(stage, 'rate_from_start_pct'),
        'rate_from_previous_pct' => nullable_non_negative_number(stage, 'rate_from_previous_pct'),
        'drop_off_from_previous' => nullable_number(stage, 'drop_off_from_previous')
      }
    end
  end

  def required_string(hash, key)
    value = hash[key]
    invalid_response! unless value.is_a?(String) && value.strip.present?

    value
  end

  def nullable_string(hash, key)
    return nil if hash[key].nil?

    required_string(hash, key)
  end

  def non_negative_number(hash, key)
    number = finite_number(hash, key)
    invalid_response! unless number >= 0

    number
  end

  def nullable_number(hash, key)
    return nil if hash[key].nil?

    finite_number(hash, key)
  end

  def nullable_non_negative_number(hash, key)
    return nil if hash[key].nil?

    non_negative_number(hash, key)
  end

  def finite_number(hash, key)
    number = hash[key]
    invalid_response! unless number.is_a?(Numeric) && number.finite?

    number
  end

  def invalid_response!
    raise InvalidResponseError, 'unexpected SGC report format'
  end

  def validate_range!
    raise InvalidRangeError, 'all history cannot include dates' if all? && dates_present?
    return if all? || default_range?

    raise InvalidRangeError, 'both dates are required' unless custom_range?

    validate_dates!
  end

  def validate_dates!
    from = Date.iso8601(@from_date)
    to = Date.iso8601(@to_date)
    raise InvalidRangeError, 'from date must precede to date' if from > to
  rescue Date::Error
    raise InvalidRangeError, 'dates must use ISO 8601 format'
  end

  def report_url
    source_url = ENV.fetch('URL_REPORT', DEFAULT_REPORT_URL).presence || DEFAULT_REPORT_URL
    query = if all?
              { account_id: REPORT_ACCOUNT_ID, all: true }
            elsif custom_range?
              { account_id: REPORT_ACCOUNT_ID, from_date: @from_date, to_date: @to_date }
            else
              {}
            end

    return source_url if query.empty?

    "#{source_url}?#{URI.encode_www_form(query)}"
  end

  def allow_private_network?
    ActiveModel::Type::Boolean.new.cast(ENV.fetch('URL_REPORT_ALLOW_PRIVATE_NETWORK', false))
  end

  def all?
    @all
  end

  def custom_range?
    @from_date.present? && @to_date.present?
  end

  def default_range?
    @from_date.blank? && @to_date.blank?
  end

  def dates_present?
    @from_date.present? || @to_date.present?
  end
end
