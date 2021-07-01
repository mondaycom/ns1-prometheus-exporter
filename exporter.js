const { NS1Client, NS1Record } = require('./ns1');
const _ = require('lodash');
const SIXTY_SECONDS = 60000;
const GRANULARITY_RECORD = "record";
const GRANULARITY_ZONE = "zone";

class NS1Exporter {
  constructor(apiKey, zones = null, granularity = GRANULARITY_RECORD) {
    this.apiKey = apiKey;
    this.apiClient = new NS1Client(this.apiKey);
    this.zones = zones;
    this.granularity = granularity;
    this.cache = {};
  }

  /**
   * Initializes the exporter by loading metadata about zones and DNS records from the API
   */
  async initExporter() {
    console.log("Initializing exporter...");
    this.zones = this.zones || await this.apiClient.listZones();

    if(this.granularity === GRANULARITY_RECORD) {
      for (const zone of this.zones) {
        const records = await this.apiClient.listRecordsForZone(zone);

        for (const record of records) {
          this.cache[record.id] = record;
        }
      }
    } else {
      for(const zone of this.zones) {
        const zoneRecord = await this.apiClient.getZone(zone);
        this.cache[zoneRecord.id] = zoneRecord;
      }
    }

    console.log(`Initialization completed, monitoring ${this.zones.length} zones \
${this.granularity === GRANULARITY_RECORD ? `that contain ${Object.keys(this.cache).length} records` : ''}`);
  }

  /**
   * Returns an OpenMetrics-formatted string with metric data about all the monitored entities
   * This is the core function of the exporter, which both invokes API calls, stores data into the in-memory
   * cache to prevent excessive API calls and returns the data in a properly-formatted manner
   * @returns {String} the body of the /metrics response
   */
  async metrics() {
    await this.updateCachedMetrics();
    const updatedRecords = Object.values(this.cache);
    const prometheusMetrics = updatedRecords.map((r) => r.asPrometheusMetric());

    return [
      "# TYPE ns1_record_queries_per_minute gauge",
      ...prometheusMetrics,
      "# EOF"
    ].join("\n");
  }

  /**
   *
   * @returns {Promise<void>}
   */
  async updateCachedMetrics() {
    const recordsToUpdate = Object.values(this.cache).filter(isMetricStale);
    const recordBatches = _.chunk(recordsToUpdate, 10);
    for(const batch of recordBatches) {
      const updatePromises  = batch.map((r) => this.updateSingleRecordMetric(r));
      await Promise.all(updatePromises);
    }
  }

  async updateSingleRecordMetric(record) {
    const now = Date.now();
    try {
      const newValue = await this.apiClient.getRecordQps(record);
      this.cache[record.id].lastValue = newValue.toFixed(3);
      this.cache[record.id].lastTimestamp = Math.floor(now / SIXTY_SECONDS) * SIXTY_SECONDS;
    } catch(error) {
      console.log(`Failed to fetch record ${record.domain} (skipping): ${error.message}`);
    }
  }
}

/**
 * A predicate function which returns true if the last timestamp of a given record is older than 1 minute
 * @param record an NS1Record
 * @returns {boolean} whether the record's metrics should be updated
 */
function isMetricStale(record) {
  const now = Date.now();
  const nowMinute    = Math.floor(now / SIXTY_SECONDS);
  const recordMinute = Math.floor(record.lastTimestamp / SIXTY_SECONDS);

  return nowMinute > recordMinute;
}

module.exports = NS1Exporter;