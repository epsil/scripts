#!/bin/sh
name=$1
pandoc -f html -t markdown --columns=1000 --wrap=none -o "${name%.html}.md" "$name" && echo "Converted $name to ${name%.html}.md"
