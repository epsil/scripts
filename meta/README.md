`meta.js`
=========

**`meta.js`** er et JavaScript-skript (kjøres med Node) som genererer symbolske lenker basert på metadata i YAML. Det kan brukes som et verktøy for tagging.

Installasjon
------------

### `metalinks`

Biblioteker (prøv `npm run reinstall` hvis noe går galt):

    cd links
    npm install

Kommandolinje:

    npm link

Dette gjør kommandoen `metalinks` tilgjengelig fra kommandolinjen.

### `metatag`

Biblioteker:

    cd tag
    npm install

Kommandolinje:

    npm link

Snarvei:

    cp MetaTag.desktop ~/.local/share/applications

Tjeneste:

    cp MetaTagService.desktop ~/.local/share/kservices5/ServiceMenus

Spesifikasjon
-------------

En *metadatafil* inneholder metadata for en *originalfil*. Filnavnet til metadatafilen er avledet av navnet til originalfilen, men er prefikset med punktum, `.`, og har endelsen `.yml`. Metadatafilen ligger i undermappen `.meta`:

| Originalfil | Metadatafil          |
| ----------- | -------------------- |
| `foo.txt`   | `.meta/.foo.txt.yml` |
| `bar`       | `.meta/.bar.yml`     |
| `.baz`      | `.meta/..baz.yml`    |

Mappen `.meta` er alltid en undermappe av mappen som originalfilen ligger i. Det er altså én `.meta`-mappe per mappe. Et mappehierarki kan se slik ut:

```
.
|-- .meta/
|   `-- .foo.txt.yml
|-- foo.txt
`-- quux/
    |-- .meta/
    |   `-- .bar.txt.yml
    `-- bar.txt
```

Metadatafiler inneholder YAML, som er ren tekst. For eksempel:

```yaml
---
tags:
  - bar
  - foo
categories:
  - quux
```

YAML-en bør være prefikset med `---`, som vist.

Med en metadatafil kan man lagre *tagger* om en fil. Taggene listes i YAML-egenskapen `tags`. Navnet på en tagg består av de alfanumeriske tegnene `a-z` og `0-9`. Navnet kan også inneholde punktum, `.`, men det kan ikke være første tegn. Eksempler:

-   `foo`
-   `bar`
-   `foo.bar`

En *kategori* har samme syntaks som en tagg, men er ment å gruppere filer på en mer overordnet måte (f.eks. ved å skille mellom ulike filtyper). Kategorier lagres i YAML-egenskapen `categories`.

Man kan representere kombinasjonen av flere tagger med en *taggliste*. Tagglister kan representeres som lister i YAML, slik det er vist i YAML-eksemplet over, men det er ofte praktisk å benytte en egen syntaks hvor taggene er alfabetisk sortert og separert med mellomrom. Eksempler:

-   `foo`
-   `bar foo`
-   `bar foo quux.baz`

Dette kan også forstås som en syntaks for *taggspørringer*. Her er `bar foo` en spørring etter filer som er tagget med *både* `bar` og `foo`. Den betegner altså *snittet* (&cap;) av filer som er tagget med `bar` og filer som er tagget med `foo`, og kan leses som "`bar` *og* `foo`".

Ressurser
---------

### Artikler

-   [Designing better file organization around tags, not hierarchies](http://www.nayuki.io/page/designing-better-file-organization-around-tags-not-hierarchies)
-   [Gwern Branwen's tagging system](http://www.gwern.net/About#confidence-tags)
-   [Dotfile madness](https://0x46.net/thoughts/2019/02/01/dotfile-madness/)

### Lignende prosjekter

-   [hydrus network](http://hydrusnetwork.github.io/hydrus/) ([GitHub](https://github.com/hydrusnetwork/hydrus))
