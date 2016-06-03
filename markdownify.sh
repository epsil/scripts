#!/bin/sh

url=$1
name=$2
agent="Mozilla/5.0 (Windows NT 5.1; rv:10.0.2) Gecko/20100101 Firefox/10.0.2"

wget --convert-links -U "$agent" -O "$name.html" "$url"
pandoc -f html -t markdown --columns=1000 --wrap=none -o "$name.md" "$name.html" && echo "Converted $name.html to $name.md"
