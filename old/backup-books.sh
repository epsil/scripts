#!/bin/sh

# echo Setting permissions ...
# ./fix-permissions.sh Bibliotek
# echo Uploading to uio.no ...
# echo Uploading to hekta.org ...
# rsync -avz --delete Bibliotek/ vegardoy@hekta.org:public_html/temp/books

dir=~/GoogleDrive/Calibre\ Library
backup=/Volumes/SanDisk

find "$dir" -iname "*ds_store*" -exec rm {} \;
find "$dir" -iname "*\[conflict*" -exec rm {} \;
find "$dir" -empty -exec rm -r {} \;
rsync -avz --progress --delete --ignore-errors --modify-window=3600 "$dir" "$backup"
