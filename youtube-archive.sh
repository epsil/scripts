#!/bin/sh
URL=$1
youtube-dl --add-metadata --embed-thumbnail --all-subs --embed-subs --sub-format srt "$URL"
