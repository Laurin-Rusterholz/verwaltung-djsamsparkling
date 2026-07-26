#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Setzt die CORS-Konfiguration des Firebase-Storage-Buckets, damit der Browser
# den Bild-Upload aus dieser Verwaltung nicht blockiert.
#
# ACHTUNG: gsutil ersetzt die CORS-Konfiguration des ganzen Buckets. Die Liste
# in firebase/cors.json enthält deshalb auch die Origin von ai-sync
# (management-xo2-pro.netlify.app). Kommt die Verwaltung unter einer anderen
# Netlify-Adresse online, diese Adresse zuerst in cors.json ergänzen.
#
# Voraussetzung:
#   - gsutil (Google Cloud SDK): https://cloud.google.com/sdk/docs/install
#   - einmalig:  gcloud auth login   (Zugriff auf Projekt jupidu-36804)
# ---------------------------------------------------------------------------
set -euo pipefail
BUCKET="gs://jupidu-36804.firebasestorage.app"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORS_FILE="$DIR/cors.json"

if ! command -v gsutil >/dev/null 2>&1; then
  echo "gsutil nicht gefunden. Google Cloud SDK installieren:"
  echo "  https://cloud.google.com/sdk/docs/install"
  echo "Danach einmalig:  gcloud auth login"
  exit 1
fi

echo "-> Aktuelle Konfiguration:"
gsutil cors get "${BUCKET}" || true

echo "-> Setze CORS auf ${BUCKET} aus ${CORS_FILE} ..."
gsutil cors set "${CORS_FILE}" "${BUCKET}"
echo "OK. Prüfen mit:  gsutil cors get ${BUCKET}"
