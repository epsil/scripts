`meta.js`
=========

> *The trick is to learn the trick.<br>
> The key to the treasure is the treasure.<br>
> The name of the thing is the thing itself.<br>
> The name of the game is to name the game.*
>
> -- `metalinks --riddle`

**`metatag`** er et Node-skript som lagrer metadata om en fil i et YAML-dokument. **`metalinks`**  er et skript som genererer symbolske lenker basert på slike metadata. Skriptene kan brukes som verktøy for organisering og tagging av filer.

Installasjon
------------

Skriptene krever at [Node.js](http://nodejs.org/) er installert på systemet.

Last ned koden som en [Zip-fil](https://github.com/epsil/scripts/archive/master.zip) eller med [Git](http://git-scm.com/):

    git clone https://github.com/epsil/scripts.git

### `metatag`

Kjør:

    cd tag
    npm install
    [sudo] npm link

Dette gjør kommandoen `metatag` tilgjengelig fra kommandolinjen. (For hjelp, skriv `metatag --help`.)

Snarvei (Linux):

    cp MetaTag.desktop ~/.local/share/applications

Tjeneste (KDE):

    cp MetaTagService.desktop ~/.local/share/kservices5/ServiceMenus

På Windows kan man legge til `metatag` i "Send til"-menyen ved å åpne `shell:sendto` i Utforsker og lage en snarvei til `metatag-cli.bat`.

### `metalinks`

Kjør:

    cd links
    npm install
    [sudo] npm link

Dette gjør kommandoen `metalinks` tilgjengelig fra kommandolinjen. (For hjelp, skriv `metalinks --help`.)

Hjelp
-----

`metalinks` performs queries on files tagged with `metatag`. The files matching a query are listed in a "smart folder" containing symbolic links (or shortcuts on Windows).

Usage:

    metalinks [OPTIONS...] [QUERIES...]

Examples:

    metalinks
    metalinks "*"

These commands are identical. They create links for all tagged files in the current directory. The links are placed in the directory `_q/_/`:

    _q/
      _/
        file1.txt -> /path/to/file1.txt
        file2.txt -> /path/to/file2.txt

The default input directory is `.` (meaning the current directory). The default output directory is `_q` (where the `q` stands for "query"). If necessary, the `--input` and `--output` options can be used to specify different directories:

    metalinks --input "download" --output "_links" "*"

The following command performs a query for files tagged with both "`foo`" and "`bar`":

    metalinks "foo bar"

The links are placed in the directory `_q/foo bar/`:

    _q/
      foo bar/
        file3.txt -> /path/to/file3.txt
        file4.txt -> /path/to/file4.txt

The next command executes multiple queries in one go, which is faster since the metadata is read only once:

    metalinks "*" "foo bar"

To continually monitor a directory for metadata changes, use `--watch`:

    metalinks --watch "*" "foo bar"

Also, to split a long list of queries across multiple lines, it is useful to escape newlines with a backslash:

    metalinks --watch \
      "*" \
      "foo bar" \
      "baz quux"

Files can also be read from standard input. If `files.txt` is a text file containing a newline-separated list of files to process, then it can be piped to `metalinks`:

    cat files.txt | metalinks "foo bar"

`metalinks` is fully stream-enabled and will begin processing input as soon as it arrives. This makes it easy to combine with other utilities, such as `find` and `grep`.

Type `metalinks --version` to see the current version.

See also: `metatag`, `yarch`.

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
foo/
  .meta/
    .bar.txt.yml
  bar.txt
  baz/
    .meta/
      .quux.txt.yml
    quux.txt
```

Metadatafiler inneholder YAML, som er ren tekst. For eksempel:

```yaml
--- # fil.txt
tags:
  - bar
  - foo
categories:
  - quux
```

YAML-en bør være prefikset med `---`, som vist. Kommentaren på slutten av linjen, "`# fil.txt`", forteller brukeren hvilken fil metadataene tilhører, men dette er bare for lesbarhetens skyld og ignoreres av implementasjonen. *Filnavnet til originalfilen utledes* alltid *fra filnavnet til metadatafilen.*

Med en metadatafil kan man lagre *tagger* om en fil. Taggene listes i YAML-egenskapen `tags`. Navnet på en tagg består av de alfanumeriske tegnene `a-z` og `0-9`. Navnet kan også inneholde punktum, `.`, men det kan ikke være første tegn. Eksempler:

-   `foo`
-   `bar`
-   `foo.bar`

En *tagging* er resultatet av å sette en tagg på en fil, og kan formelt representeres som en tuppel (`tag`, `fil`). En fil kan ha mange tagginger.

En *kategori* har samme syntaks som en tagg, men er ment å gruppere filer på en mer overordnet måte (f.eks. ved å skille mellom ulike filtyper). Kategorier lagres i YAML-egenskapen `categories`.

En *kategorisering* er resultatet av å tilordne en fil en kategori. En fil kan ha mange kategoriseringer.

Man kan representere kombinasjonen av flere tagger med en *taggliste*. Tagglister kan representeres som lister i YAML:

```yaml
- bar
- baz
- foo
```

Det vil være nyttig å definere en kortere syntaks. For eksempel:

```
bar . baz . foo
```

Eller bare:

```
bar baz foo
```

Det ovenstående kan forstås som en syntaks for *taggspørringer*. Her er `bar foo` en spørring etter filer som er tagget med *både* `bar` og `foo`. Den betegner altså *snittet* (&cap;) av filer som er tagget med `bar` og filer som er tagget med `foo`, og kan leses som "`bar` *og* `foo`". Eksempler:

-   `foo`
-   `bar foo`
-   `bar foo quux.baz`

For å representere *unionen* (&cup;) av to tagger, kan man bruke syntaksen `bar, foo`, som kan leses som "`bar` *eller* `foo`". Her er `bar, foo` en spørring etter filer som er tagget med `bar` eller `foo` (eller begge deler).

Hvis man skriver {`foo`} for å referere til mengden av filer som matches av taggspørringen `foo`, så kan man definere syntaksen for taggspørringer som følger:

| Uttrykk | Betydning |
| ------- | --------- |
| `bar foo` | {`bar`} &cap; {`foo`} |
| `bar foo quux.baz` | {`bar`} &cap; {`foo`} &cap; {`quux.baz`} |
| `bar, foo` | {`bar`} &cup; {`foo`} |
| `bar, foo, quux.baz` | {`bar`} &cup; {`foo`} &cup; {`quux.baz`} |
| `bar foo, baz` | ({`bar`} &cap; {`foo`}) &cup; {`baz`} |
| `(bar, foo) (baz, quux)` | ({`bar`} &cup; {`foo`}) &cap; ({`baz`} &cup; {`quux`}) |

Man kan også legge til prefiksoperatorene `+` og `-`, slik at f.eks. `+foo -bar -baz` betegner alle filer som har taggen `foo`, og *ikke* har taggene `bar` og `baz`.

Hvis man vil spørre etter kategorier, kan man skrive `category:foo`, som vil returnere alle filer i kategorien `foo`. Uttrykket `foo category:bar` vil returnere alle filer med taggen `foo` i kategorien `bar`.

I tillegg definerer vi følgende *spesialspørringer*:

| Uttrykk | Betydning |
| ------- | --------- |
| `@` | Alle filer |
| `#` | Alle tagger |
| `+` | Alle brukertagger |
| `_` | Alle kategorier |
| `!` | Alle brukerspørringer |
| `*` | Alias for `_` |
| `%` | Taggtre, ett nivå |
| `**` | Udefinert |
| `__` | Udefinert |

Standard spørringer (hvis `metalinks` kjøres uten parametere) er `#` og `_`.

Ressurser
---------

### Artikler

-   [Designing better file organization around tags, not hierarchies](http://www.nayuki.io/page/designing-better-file-organization-around-tags-not-hierarchies)
-   [Gwern Branwen's tagging system](http://www.gwern.net/About#confidence-tags)
-   [Dotfile madness](https://0x46.net/thoughts/2019/02/01/dotfile-madness/)
-   [What the Hell is Going On?](http://www.perell.com/blog/what-the-hell-is-going-on#britannica-to-wikipedia)

#### Lignende prosjekter

-   [hydrus network](http://hydrusnetwork.github.io/hydrus/)
    -   [GitHub](https://github.com/hydrusnetwork/hydrus)
