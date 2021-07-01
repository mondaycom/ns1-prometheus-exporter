const axios = require('axios');

class NS1Client {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.axiosClient = axios.create({
      baseURL: "https://api.nsone.net",
      timeout: parseInt(process.env.CLIENT_TIMEOUT),
      headers: {'X-NSONE-Key': this.apiKey}
    });
  }

  /**
   * Returns a list of all the hosted zones
   * @returns {Array} a list of zones in the NS1 account
   */
  async listZones() {
    const resp = await this.axiosClient.get('/v1/zones');
    return resp.data.map((e) => e.zone);
  }

  /**
   * Verifies that a zone exists and returns an NS1Record instance including its ID
   * @param fqdn the FQDN of the zone
   * @returns {NS1Record} an NS1Record instance representing the zone
   */
  async getZone(fqdn) {
    const resp = await this.axiosClient.get(`/v1/zones/${fqdn}`);
    return new NS1Record(resp.data.id, fqdn);
  }

  /**
   * Returns a list of records under the given zone
   * @param fqdn the FQDN of the zone
   * @returns {Array} an array of NS1Record objects
   */
  async listRecordsForZone(fqdn) {
    const resp = await this.axiosClient.get(`/v1/zones/${fqdn}`);
    return resp.data.records.map((r) => new NS1Record(r.id, fqdn, r.domain, r.type));
  }

  /**
   * Returns the QPS metric value for a given NS1Record instance (either a zone or a DNS record)
   * @param ns1Record an NS1Record instance
   * @returns {Float} the value of the field "qps" from the API response
   */
  async getRecordQps(ns1Record) {
    const resp = await this.axiosClient.get(`/v1/stats/qps/${ns1Record.asUrlSuffix()}`);
    return resp.data.qps;
  }
}

/**
 * A data structure for storing a NS1 DNS record or zone, including fields for holding a snapshot
 * of the last known QPS values retrieved from the API
 */
class NS1Record {
  constructor(id, zone, domain = null, type = null) {
    this.zone = zone;
    this.domain = domain;
    this.type = type;
    this.lastTimestamp = 0;
    this.lastValue = null;
    this.id = id;
  }

  /**
   * A convenience method for appending the zone/record into NS1's API
   */
  asUrlSuffix() {
    if(this.domain && this.type) {
      return `${this.zone}/${this.domain}/${this.type}`;
    }
    return this.zone;
  }

  /**
   * Returns an OpenMetrics-formatted line with the current record data
   * NOTE: According to NS1's documentation, fetched QPS data is at a 5-minute constant delay
   * @returns {string} the OpenMetrics representation of the record with current data
   */
  asPrometheusMetric() {
    if(this.lastTimestamp === 0 || this.lastValue === null) return "";
    const actualTimestamp = this.lastTimestamp - (5 * 60000);
    const queriesPerMinute = Math.floor(this.lastValue * 60); // converted from QPS

    return [
      "ns1_record_queries_per_minute{",
      `zone="${this.zone}"`,
      this.domain ? `,domain="${this.domain}"` : '',
      this.type   ? `,type="${this.type}"` : '',
      `} ${queriesPerMinute} ${actualTimestamp}`
    ].join('');
  }
}

module.exports = {
  NS1Client,
  NS1Record
};