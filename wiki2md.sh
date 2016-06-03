#!/bin/sh
name=$1
pandoc -f mediawiki -t markdown --columns=1000 --wrap=none -o "${name%.wiki}.md" "$name"
