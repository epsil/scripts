#!/usr/bin/python

import bs4
import os
import re
import sys
import urllib
import urlparse

urllib.URLopener.version = 'Mozilla/4.0 (compatible; MSIE 5.5; Windows NT 5.0; T312461)'

def load(path):
    """Load a file from disk."""
    file = open(path, 'rU')
    xs = [unicode(line, 'utf-8').rstrip() for line in file]
    file.close
    return xs

def amazon(title):
    url = ('http://www.amazon.com/s/ref=nb_sb_noss/187-8228357-2788533?url=search-alias%%3Daps&field-keywords=%s' % urllib.quote_plus(title.encode('utf-8')))
    try:
        input = urllib.urlopen(url)
        try:
            soup = bs4.BeautifulSoup(input)
            div = soup.find('div', id='atfResults')
            if not div: return ""
            a = div.find('a', class_='a-link-normal')
            if not a: return ""
            return cleanup(urlparse.urljoin(url, a['href']))
        finally:
            input.close()
    except IOError:
        return ""

def amazon2(title):
    for i in range(0, 30):
        url = amazon(title)
        if url: return url
    return ""

def cleanup(url):
    match = re.search('/dp/([^/]+)', url)
    if not match: return url
    id = match.group(1)
    return 'http://www.amazon.com/dp/%s/' % id

def extract(line):
    title = line
    title = re.sub('^[ ]*-[ ]*', '', title)
    title = re.sub('\*', '', title)
    title = re.sub('~', '', title)
    title = re.sub('<!--', '', title)
    title = re.sub('-->', '', title)
    return title

def addurl(line, url):
    regexp = re.compile(ur'[*]([^*]+)[*]', re.UNICODE)
    match = re.search(regexp, line)
    if not match: return line
    title = match.group(1)
    repl = '*[%s](%s)*' % (title, url)
    return re.sub(regexp, repl, line)

def main():
    input = sys.argv[1]
    output = sys.argv[2]

    f = open(output, 'w')
    for line in load(input):
        url = amazon2(extract(line))
        newline = addurl(line, url)
        print(newline)
        f.write(newline.encode('utf-8') + '\n')
    f.close()

if __name__ == '__main__':
    main()
