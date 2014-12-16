#!/bin/sh
name=$1
pandoc -f mediawiki -t markdown --columns=1000 --no-wrap -o "${name%.wiki}.md" "$name"
