`meta.js`
=========

**`meta.js`** er et JavaScript-skript (kjøres med Node) som genererer symbolske lenker basert på metadata i YAML. Det kan brukes som et verktøy for tagging.

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
tags:
  - foo
  - bar
categories:
  - quux
```

YAML-en kan være omsluttet av `---` og `---`, eller utelate dem, som i eksemplet. Dette er valgfritt.

Med en metadatafil kan man lagre *tagger* om en fil. Taggene listes i YAML-egenskapen `tags`. Navnet på en tagg består av de alfanumeriske tegnene `a-z` og `0-9`. Navnet kan også inneholde punktum, `.`, men det kan ikke være første tegn. Eksempler:

-   `foo`
-   `bar`
-   `foo.bar`

En *kategori* har samme syntaks som en tagg, men er ment å gruppere filer på en mer overordnet måte (f.eks. ved å skille mellom ulike filtyper). Kategorier lagres i YAML-egenskapen `categories`.

Man kan representere kombinasjonen av flere tagger med en *taggliste*. En praktisk syntaks for tagglister er å representere dem som en streng hvor taggene er alfabetisk sortert og separert med mellomrom, f.eks.:

-   `bar foo`
-   `bar foo quux.baz`

Man kan forstå `bar foo` som en forespørsel om filer som er tagget med *både* `bar` og `foo`. Med andre ord: `bar foo` betegner *snittet* av filer som er tagget med `bar` og filer som er tagget med `foo`, og kan leses som "`bar` og `foo`".
