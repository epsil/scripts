#!/bin/bash
PARAM=$1
# HOME=/Users/vegard
HOME=/home/vegard
# BACKUP=/Volumes/Backup
BACKUP=/media/vegard/Backup
WINDOW=3600
PARAMS="--progress --modify-window=$WINDOW"
DELETE="-av --delete $PARAMS"
ARCHIVE="-avz $PARAMS"
CLOUD="vegardye@ananke.feralhosting.com:www/vegardye.ananke.feralhosting.com/public_html"

# Preparations
function prepare {
    echo "Preparing backup ..."
    rsync $ARCHIVE $HOME/wiki/ref/books/index.md $HOME/Calibre\ Library/Ukjent/Leseliste\ \(1700\)/Leseliste\ -\ Ukjent.txt
}

# Disk backup
function disk {
    if [ ! -e "$BACKUP" ]; then
        echo "Backup disk not found!"
    else
        echo "Backing up to disk ..."
        rsync $DELETE $HOME/Music $BACKUP
        rsync $DELETE $HOME/Calibre\ Library $BACKUP
        rsync $DELETE $HOME/Documents $BACKUP
        # rsync $ARCHIVE $HOME/.* $BACKUP
        rsync $DELETE $HOME/.[^.]* $BACKUP
        rsync $ARCHIVE $HOME/wiki $BACKUP
        rsync $ARCHIVE $HOME/Dropbox $BACKUP
        rsync $ARCHIVE $HOME/Movies $BACKUP
        rsync $ARCHIVE $HOME/Downloads $BACKUP
        rsync $ARCHIVE $HOME/Calibre\ Library $BACKUP/Downloads
        rsync $ARCHIVE $HOME/Music $BACKUP/Downloads
        rsync $ARCHIVE $HOME/.[^.]* $BACKUP/Downloads
        rsync $ARCHIVE $HOME/Documents/scripts/backup.sh $BACKUP
    fi
}

# Cloud backup
function cloud {
    echo "Backing up to cloud ..."
    # rsync $DELETE $HOME/GoogleDrive/ $CLOUD
    rsync $DELETE $HOME/Calibre\ Library/ "$CLOUD/Calibre\ Library"
    # rsync $DELETE $HOME/GoogleDrive/Documents/ $CLOUD/Documents
    rsync $DELETE $HOME/wiki/ $CLOUD/wiki
    # rsync $ARCHIVE $HOME/Downloads/stuff/stuff/ $CLOUD/stuff/stuff
    echo "Backup completed"
}

# Execute
if [ "$PARAM" == "--disk" ]; then
    prepare
    disk
elif [ "$PARAM" == "--cloud" ]; then
    prepare
    cloud
else
    prepare
    cloud
    disk
fi
