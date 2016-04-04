#!/bin/bash
rsync -av --delete --ignore-errors --progress --modify-window=1 --exclude="iTunes" /home/vegard/Musikk/ /media/Music
