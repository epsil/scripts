#!/usr/bin/python

import bs4
import os
import re
import sys
import urllib
import urlparse

urllib.URLopener.version = 'Mozilla/4.0 (compatible; MSIE 5.5; Windows NT 5.0; T312461)'

def download(url, path, ask=True, ext='sh'):
    """Create download script."""
    script = 'run.sh' if ext == 'sh' else 'run.bat'
    try:
        if not os.path.exists(path): os.mkdir(path)
        os.chdir(path)
        output = open(script, 'w')
        try:
            if ext == 'sh':
                output.write('#!/bin/sh\n')
                output.write('DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"\n')
                output.write('cd "$DIR"\n')
            else:
                output.write('@echo off\n')
        finally:
            output.close()
        while url:
            url = links(url, path, script)
    except IOError:
        return
    if ext == 'sh':
        os.system('chmod +x "%s"' % script)
    if ask and (ask == 'Y' or
                raw_input("Start downloading? (Y/N) ").upper() == 'Y'):
        if ext == 'sh':
            os.system('./%s' % script)
        else:
            os.system(script)

def links(url, path, script):
    """Add download links."""
    try:
        input = urllib.urlopen(url)
        output = open(script, 'a')
        try:
            soup = bs4.BeautifulSoup(input, "html.parser")
            table = soup.find('table', 'c')
            if not table: return
            trs = table.findAll('tr')
            if not trs: return
            trs.pop(0)
            for tr in trs:
                tds = tr.findAll('td')
                id = tds[0].get_text()
                fn = lambda x: x and re.compile("libgen.io").search(x)
                href = tr.find(href=fn)['href']
                link = urlparse.urljoin(url, href)
                link2 = link.replace("get_ads", "get")
                ext = tds[8].get_text()
                wget = ('wget -c -w 60 -t inf -T 10 -O "%s %s.%s" --referer "%s" "%s"\n' %
                        (id, path, ext, link, link2))
                print(wget)
                output.write(wget)
            a = soup.find('a', text=re.compile(u'\u25BA')) # >
            if a:
                url = urlparse.urljoin(url, a['href'])
            else:
                url = ''
        finally:
            input.close()
            output.close()
    except IOError:
        return
    return url

def main():
    ask = 'Y'
    open = False
    ext = 'bat' if os.name == 'nt' else 'sh'
    if sys.argv[1] == '-y':
        ask = True
        sys.argv.pop(1)
    elif sys.argv[1] == '-n':
        ask = False
        sys.argv.pop(1)
    elif sys.argv[1] == '-o':
        open = True
        sys.argv.pop(1)
    path = sys.argv[1]
    url = (sys.argv[2] if len(sys.argv) > 2 else
           'http://gen.lib.rus.ec/search.php?req=%s' %
           urllib.quote_plus(path))
    if open:
        os.system('open %s' % url)
    else:
        download(url, path, ask, ext)

if __name__ == '__main__':
    main()
