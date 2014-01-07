#!/bin/bash
for dir in "$@";
do
	cd ~; cd "$dir"
	echo "Setting directory permissions ..."
	# chmod 700 .
	sudo find . -type d -exec chmod 755 {} \;
	echo "Setting file permissions ..."
	sudo find . -type f -exec chmod 644 {} \;
	echo "Setting file ownership ..."
	sudo find . -exec chown vegard:staff {} \;
done

# Exceptions
# sudo chown root:root /home/vegard/crontab
# sudo chmod 644 /home/vegard/crontab
# sudo chmod 777 /home/vegard/Nedlastinger/Upload
