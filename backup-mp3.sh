#!/bin/bash
rsync -av --delete --progress --modify-window=1 --exclude="iTunes" /home/vegard/Musikk/ /media/Musikk
