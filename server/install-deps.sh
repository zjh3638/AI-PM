#!/bin/sh
# Install Python deps with proxy vars cleared (host proxy leaks break pip)
env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY pip install --no-cache-dir \
  ${PIP_INDEX_URL:+--index-url "$PIP_INDEX_URL"} \
  ${PIP_TRUSTED_HOST:+--trusted-host "$PIP_TRUSTED_HOST"} \
  -r requirements.txt
