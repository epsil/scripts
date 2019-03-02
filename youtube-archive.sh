#!/bin/bash

URLS="$@"
INPUT=""
if [ $# -eq 0 ]; then
    read INPUT
    URLS=" $INPUT"
fi

for URL in "$URLS"
do
    YOUTUBEDL="youtube-dl"
    OPTs="--add-metadata --embed-thumbnail --all-subs --embed-subs --sub-format srt --write-info-json"
    MP4="$YOUTUBEDL -f mp4 --add-metadata --embed-thumbnail --all-subs --embed-subs --sub-format srt --write-info-json --merge-output-format mp4 $URL"
    MKV="$YOUTUBEDL $OPTS --merge-output-format mkv $URL"
    DEF="$YOUTUBEDL $OPTS $URL"
    # $DEF
    $MP4
done
