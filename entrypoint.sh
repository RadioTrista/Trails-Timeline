#!/bin/bash
set -e

HOST_UID=$(stat -c '%u' /app)
HOST_GID=$(stat -c '%g' /app)

if ! getent group "$HOST_GID" >/dev/null; then
  groupadd -g "$HOST_GID" appuser
fi
if ! id -u "$HOST_UID" >/dev/null 2>&1; then
  useradd -m -u "$HOST_UID" -g "$HOST_GID" appuser
fi

USER_HOME=$(getent passwd "$HOST_UID" | cut -d: -f6)

exec gosu "$HOST_UID":"$HOST_GID" env HOME="$USER_HOME" COREPACK_ENABLE_DOWNLOAD_PROMPT=0 "$@"