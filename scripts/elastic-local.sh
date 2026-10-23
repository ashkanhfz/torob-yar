#!/usr/bin/env bash
set -euo pipefail
ELASTIC_IMAGE='elasticsearch@sha256:33cae13fc18ef105e960cdd32327d402fbd7c6d4376c0b879ad703ee289d45d8'
ELASTIC_CONTAINER='torob-elasticsearch'
owned_container(){ [[ "$(docker inspect -f '{{ index .Config.Labels "com.torob-yar.service" }}' "$ELASTIC_CONTAINER")" == elasticsearch ]] || { echo 'Container belongs to another service' >&2; exit 1; }; }
case "${1:-status}" in
 start)
  if docker inspect "$ELASTIC_CONTAINER" >/dev/null 2>&1; then owned_container; docker start "$ELASTIC_CONTAINER"; else
   docker run -d --name "$ELASTIC_CONTAINER" --label com.torob-yar.service=elasticsearch \
    --restart unless-stopped --memory 1536m --cpus 2 -p 127.0.0.1:9201:9200 \
    -v torob-elastic-data:/usr/share/elasticsearch/data \
    -e discovery.type=single-node -e xpack.security.enabled=false -e xpack.ml.enabled=false \
    -e xpack.license.self_generated.type=basic -e ingest.geoip.downloader.enabled=false \
    -e 'ES_JAVA_OPTS=-Xms512m -Xmx512m -XX:ActiveProcessorCount=2' "$ELASTIC_IMAGE"
  fi ;;
 stop) owned_container; docker stop "$ELASTIC_CONTAINER" ;;
 status) docker inspect -f '{{.State.Status}} · {{.Config.Image}}' "$ELASTIC_CONTAINER" ;;
 *) echo 'Usage: bash scripts/elastic-local.sh {start|stop|status}' >&2; exit 1 ;;
esac
