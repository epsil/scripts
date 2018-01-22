#!/bin/bash
flv=$1
wav="${flv%.flv}.wav"
mp3="${flv%.flv}.mp3"
ffmpeg -i "$flv" "$wav"
lame -V 2 "$wav" "$mp3"
rm -f "$wav"
