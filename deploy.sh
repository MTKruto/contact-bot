#!/bin/sh
rsync -rvc . u:/opt/contact-bot
ssh u "
cd /opt/contact-bot
docker compose up --build -d
"
echo "Deployed"
