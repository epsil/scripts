#!/bin/sh

url=$1
name=$2

wget -O "$name.html" "$url"
pandoc -f html -t markdown --columns=1000 --no-wrap -o "$name.md" "$name.html"
