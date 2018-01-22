#!/bin/bash
avi=$1
wav="${avi%.avi}.wav"
mp3="${avi%.avi}.mp3"
ffmpeg -i "$avi" "$wav"
lame -V 2 "$wav" "$mp3"
rm -f "$wav"
