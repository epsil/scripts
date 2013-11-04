#!/bin/bash

# Each line is of the form
#
# <a>;<b>;<c>;<d>;<e>;<f>;<g>;<h>;<i>
#
# where
#
# <a> is the item number in the playlist or folder (starting from zero)
# <b> is the "resume offset": bookmark 'time' in bytes
#                             (bytes from the beginning of the file)
# <c> is the "resume seed": (?)
# <d> is the "resume first index": (?)
# <e> is the timestamp of the bookmark, in milliseconds
# <f> is the repeat mode flag (0=no, 1=?, 2=?, ...)
# <g> is the shuffle flag (0=no, 1=yes)
# <h> is the playlist name or folder path
# <i> is the filename
#
# If you want to look at the code, you might try apps/bookmark.c
# around line 208.
#
# http://forums.rockbox.org/index.php?topic=23133

bookmarks=$1
playlist=$2

while read line
do
        head -n $line "$playlist" | tail -n 1
done < "$bookmarks"
