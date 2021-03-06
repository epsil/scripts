#!/bin/bash
ORIG=$(pwd)
for dir in "$@";
do
	cd "$ORIG"; cd "$dir"
	echo "Setting directory permissions ..."
	sudo nice -n -20 find -type d -exec chmod 755 {} \;
	echo "Setting file permissions ..."
	sudo nice -n -20 find -type f -exec chmod 644 {} \;
	echo "Setting file ownership ..."
	sudo nice -n -20 find -exec chown vegard:vegard {} \;
done

# Exceptions
# sudo chown root:root /home/vegard/crontab
# sudo chmod 644 /home/vegard/crontab
# sudo chmod 777 /home/vegard/Nedlastinger/Upload
