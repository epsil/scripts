#!/bin/bash
URL=""
if [ $# -eq 0 ]; then
    read URL
else
    URL=$1
fi
YOUTUBEDL="youtube-dl"
OPTs="--add-metadata --embed-thumbnail --all-subs --embed-subs --sub-format srt"
MP4="$YOUTUBEDL -f mp4 --add-metadata --embed-thumbnail --all-subs --embed-subs --sub-format srt --merge-output-format mp4 $URL"
MKV="$YOUTUBEDL $OPTS --merge-output-format mkv $URL"
DEF="$YOUTUBEDL $OPTS $URL"
# $DEF
$MP4
