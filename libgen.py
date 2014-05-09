#!/usr/bin/python

import bs4
import os
import sys
import urllib
import urlparse

urllib.URLopener.version = 'Mozilla/4.0 (compatible; MSIE 5.5; Windows NT 5.0; T312461)'

def download(url, path):
    """Create download script."""
    script = 'run.sh'
    try:
        input = urllib.urlopen(url)
        if not os.path.exists(path): os.mkdir(path)
        os.chdir(path)
        output = open(script, 'w')
        try:
            output.write('#!/bin/sh\n')
            soup = bs4.BeautifulSoup(input)
            table = soup.find('table', 'c')
            trs = table.findAll('tr')
            trs.pop(0)
            for tr in trs:
                tds = tr.findAll('td')
                id = tds[0].get_text()
                link = urlparse.urljoin(url,
                                       tds[9].find('a')['href'])
                ext = tds[8].get_text()
                wget = 'wget -t inf -T 10 -O %s.%s "%s"\n' % (id, ext, link)
                print(wget)
                output.write(wget)
        finally:
            input.close()
            output.close()
    except IOError:
        return
    os.system('chmod +x "%s"' % script)
    os.system('./%s' % script)

def main():
    path = sys.argv[1]
    url = sys.argv[2]
    download(url, path)

if __name__ == '__main__':
    main()
