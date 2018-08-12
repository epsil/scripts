#!/bin/sh
wget --mirror --convert-links --adjust-extension --page-requisites --no-parent --no-check-certificate "$@"
