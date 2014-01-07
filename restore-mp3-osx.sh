#!/bin/sh
rsync -av --delete --ignore-errors --progress --modify-window=1 --exclude="iTunes" /Volumes/Music/ /Users/vegard/Music
