#!/bin/sh
HOME=/Users/vegard
BACKUP=/Volumes/Backup
WINDOW=3600
PARAMS="--progress --modify-window=$WINDOW"
DELETE="-av --delete $PARAMS"
ARCHIVE="-avz $PARAMS"
rsync $ARCHIVE $HOME/wiki/Leseliste.md $HOME/GoogleDrive/Calibre\ Library/Ukjent/Leseliste\ \(1700\)/Leseliste\ -\ Ukjent.txt
rsync $DELETE $HOME/Music $BACKUP
rsync $DELETE $HOME/GoogleDrive/Calibre\ Library $BACKUP
rsync $DELETE $HOME/GoogleDrive/Documents $BACKUP
rsync $ARCHIVE $HOME/Movies $BACKUP
rsync $ARCHIVE $HOME/Downloads $BACKUP
rsync $ARCHIVE $HOME/GoogleDrive/Calibre\ Library $BACKUP/Downloads
rsync $ARCHIVE $HOME/Music $BACKUP/Downloads
rsync $ARCHIVE $HOME/Documents/scripts/backup.sh $BACKUP
