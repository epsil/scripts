#!/bin/bash
mp4=$1
wav="${mp4%.mp4}.wav"
mp3="${mp4%.mp4}.mp3"
ffmpeg -i "$mp4" "$wav"
lame -V 2 "$wav" "$mp3"
rm -f "$wav"
