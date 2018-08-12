#!/bin/sh
URL=$1
YOUTUBEDL="youtube-dl"
OPTs="--add-metadata --embed-thumbnail --all-subs --embed-subs --sub-format srt"
MP4="$YOUTUBEDL --add-metadata --embed-thumbnail --all-subs --embed-subs --sub-format srt --merge-output-format mp4 $URL"
MKV="$YOUTUBEDL $OPTS --merge-output-format mkv $URL"
DEF="$YOUTUBEDL $OPTS $URL"
$DEF
