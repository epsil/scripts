Miscellaneous scripts
=====================

Running shell scripts on Windows
--------------------------------

Install [MSYS](http://www.mingw.org/wiki/msys). Ensure that `sh.exe`
is globally available by appending MSYS' `bin/` directory to the `PATH`
environment variable.

Open a command prompt window and run the script:

    sh script.sh

If the script accepts parameters, just provide them at the end:

    sh script.sh --param1 val1 --param2 val2

You can also augment this setup with a complete installation of
[MinGW](http://www.mingw.org/) and
[GnuWin32](http://gnuwin32.sourceforge.net/), which provide further
Unix utilities. Append these to `PATH` after MSYS.

Running Python scripts on Windows
---------------------------------

Install [Python](http://www.python.org/). Ensure that `python.exe` is
in `PATH` (should be an option during the installation process;
otherwise, locate Python's installation directory and add it
manually).

Open a command prompt window and run the script:

    python script.py
