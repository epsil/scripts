#!/bin/sh
name=$1
pandoc -f html -t markdown --columns=1000 --no-wrap -o "${name%.html}.md" "$name"
