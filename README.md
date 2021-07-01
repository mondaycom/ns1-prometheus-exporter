## ns1-prometheus-exporter
A simple, unofficial gateway application for exposing NS1 queries/min metrics using the OpenMetrics format

### How it works
`ns1-prometheus-exporter` is a HTTP proxy application that listens on the `/metrics` HTTP endpoint, performs calls to the NS1 API and returns the results in the Prometheus-compatible OpenMetrics format.

Results that are fetched from the API are cached for 1 minute to prevent excessive external calls. Results can be retrieved and displayed either on a record-level, i.e.
```
ns1_record_queries_per_minute{zone="example.com",domain="www.example.com",type="CNAME"} 450 1625082420000
ns1_record_queries_per_minute{zone="example.com",domain="mx.example.com",type="MX"} 150 1625082420000
```
or, if you just need zone-level monitoring, can return the cumulative queries/min value for the whole zone:
```
ns1_record_queries_per_minute{zone="example.com"} 600 1625082420000
```

### Quick start
To run the exporter locally:
```bash
npm install
NS1_API_KEY=8H9sX... node index.js
```

To run the exporter using Docker:
```bash
docker run -d -p 3000:3000 -e NS1_API_KEY=8H9sX... dapulse/ns1-prometheus-exporter
```

To run the exporter as a Kubernetes deployment, including a `ServiceMonitor` object to instruct Prometheus to scrape the metrics endpoint, see the `example/` directory for YAML files.

### Environment variables
The exporter can be configured using the following environment variables:
| Variable | Description | Default |
|--|--|--|--|
| `NS1_API_KEY` | The API key to NS1 to use for data fetching | - (required) |
| `EXPORTER_GRANULARITY` | Whether to scrape `zone`-level data or `record`-level data | `record` |
| `MONITOR_ZONES` | A comma-separated list of zones to monitor (e.g. `foo.com,bar.com`). Leaving this unset will monitor all zones automatically | - |
| `SERVER_PORT` | The port the server will listen on | `3000` |
| `CLIENT_TIMEOUT` | The time, in milliseconds, for the HTTP client to wait for a response from NS1 | `3000` |
| `CLIENT_BATCH_SIZE` | The maximum number of parallel requests to send to the NS1 API | `10` |

### Exporter times and Prometheus timeouts
When calling the `/metrics` endpoint, the exporter fetches real-time data from the NS1 API, if such data was not fetched in the last minute (and can be returned from cache).

Depending on the amount of zones/records you monitor, the response from the endpoint may take several seconds to return. If you're running in Kubernetes and using a `ServiceMonitor` object,
you can adjust the `scrapeTimeout` property according to your needs:
```yaml
spec:
  endpoints:
    - interval: 30s
      path: /metrics
      scrapeTimeout: 15s
      ...
```

### NS1's API and rate limiting notes
NS1 has a rate limiting policy on their API which is specified [here](https://help.ns1.com/hc/en-us/articles/360020250573-About-API-rate-limiting).

To ensure you get the monitoring data you need, while minimizing API calls to NS1's backend, consider the following configurations while setting up the exporter:
- `MONITOR_ZONES` - if you have a lot of zones with many records, you might want to specify a subset of these zones to be monitored. This will eliminate API calls to zones you don't need to monitor
- `EXPORTER_GRANULARITY` - if you maintain large zones with hundreds/thousands of DNS records, consider setting this to `zone`. Zone-level monitoring requires a single API call, while record-level monitoring requires querying every one of your records individually to obtain the QPS metric data