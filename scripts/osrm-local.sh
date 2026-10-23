#!/usr/bin/env bash
set -euo pipefail
# Data stays outside the repository and Liara image.
OSRM_DATA_DIR="${OSRM_DATA_DIR:-$HOME/.local/share/torob-osrm}"
OSRM_DATA_NAME="${OSRM_DATA_NAME:-iran}"
OSRM_IMAGE='ghcr.io/project-osrm/osrm-backend@sha256:55dbfd47d984c2cacd64e32901b4321c86b5ec761438e69aa053dc78698a786f'
OSRM_CONTAINER='torob-osrm'
[[ "$OSRM_DATA_NAME" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo 'Invalid data name' >&2; exit 1; }
owned_container() {
  [[ "$(docker inspect -f '{{ index .Config.Labels "com.torob-yar.service" }}' "$OSRM_CONTAINER")" == osrm ]] || { echo 'Container name belongs to another service' >&2; exit 1; }
}
case "${1:-status}" in
  prepare)
    test -f "$OSRM_DATA_DIR/$OSRM_DATA_NAME.osm.pbf"
    docker image inspect "$OSRM_IMAGE" >/dev/null 2>&1 || docker pull "$OSRM_IMAGE"
    for phase in extract partition customize; do
      args=("osrm-$phase" --threads 2 "/data/$OSRM_DATA_NAME.osrm")
      if [[ "$phase" == extract ]]; then args=(osrm-extract --threads 2 -p /opt/car.lua "/data/$OSRM_DATA_NAME.osm.pbf"); fi
      docker run --rm --cpus 2 --memory 6g --user "$(id -u):$(id -g)" \
        -v "$OSRM_DATA_DIR:/data" "$OSRM_IMAGE" "${args[@]}"
    done
    ;;
  start)
    test -f "$OSRM_DATA_DIR/$OSRM_DATA_NAME.osrm.mldgr"
    if docker inspect "$OSRM_CONTAINER" >/dev/null 2>&1; then
      owned_container
      docker start "$OSRM_CONTAINER"
    else
      docker run -d --name "$OSRM_CONTAINER" --label com.torob-yar.service=osrm \
        --restart unless-stopped --cpus 2 --memory 2g --read-only --tmpfs /tmp:size=32m \
        --user "$(id -u):$(id -g)" -p 127.0.0.1:5001:5000 -v "$OSRM_DATA_DIR:/data:ro" \
        "$OSRM_IMAGE" osrm-routed --verbosity WARNING --algorithm mld --threads 2 "/data/$OSRM_DATA_NAME.osrm"
    fi
    ;;
  stop) owned_container; docker stop "$OSRM_CONTAINER" ;;
  status) docker inspect -f '{{.State.Status}} · {{.Config.Image}}' "$OSRM_CONTAINER" ;;
  *) echo 'Usage: bash scripts/osrm-local.sh {prepare|start|stop|status}' >&2; exit 1 ;;
esac
