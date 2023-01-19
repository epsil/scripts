#!/bin/bash
# echo "Hello from make-link-for.sh"
F=$1;
FA=`basename "$F"`;
ln -sinT "$F" "(01) $FA";

# if [[ $FA =~ .+\\..+ ]]; then
#     FE="_lnk."${FA##*.};
#     FN=${FA%.*};
# elif [[ $FA =~ ^\\..+ ]]; then
#     FE="_lnk";
#     FN=$FA;
# elif [[ ! $FA =~ \\. ]]; then
#     FE="_lnk";
#     FN=$FA;
# fi;
#ln -sinT $F "$FN$FE";

# ~% FILE="example.tar.gz"
#
# ~% echo "${FILE%%.*}"
# example
#
# ~% echo "${FILE%.*}"
# example.tar
#
# ~% echo "${FILE#*.}"
# tar.gz
#
# ~% echo "${FILE##*.}"
# gz

# ln -s "$F" "${FA%.*}.lnk.${FA##*.}"
