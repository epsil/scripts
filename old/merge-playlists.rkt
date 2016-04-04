#! /usr/bin/racket
#lang racket

;; Merge two or more M3U playlists together. Concatenate, interleave
;; or shuffle the tracks.
;;
;; Usage:
;;
;;     ./merge-playlists.rkt in1.m3u in2.m3u > out.m3u
;;
;; Or with the -o option:
;;
;;     ./merge-playlists.rkt -o out.m3u in1.m3u in2.m3u
;;
;; The -m option is used to select the merging algorithm.
;; The default is MERGE-SHUFFLE.
;;
;;     ./merge-playlists.rkt -m JOIN in1.m3u in2.m3u > out.m3u
;;     ./merge-playlists.rkt -m SHUFFLE in1.m3u in2.m3u > out.m3u
;;     ./merge-playlists.rkt -m MERGE in1.m3u in2.m3u > out.m3u
;;     ./merge-playlists.rkt -m UNION in1.m3u in2.m3u > out.m3u
;;     ./merge-playlists.rkt -m OVERLAY in1.m3u in2.m3u > out.m3u
;;
;; To install: chmod +x, symlink to /usr/local/bin/merge-playlists
;; and invoke without the .rkt suffix. Last.fm sorting requires
;; the eyeD3 command-line library (sudo apt-get install eyed3).

(require srfi/13)       ; string-prefix-length
(require net/url)       ; string->url
(require net/uri-codec) ; uri-encode
(require xml)           ; read-xml
(require xml/path)      ; se-path*
(require data/heap)     ; heap-sort!

;; Chain playlists together
(define (playlists-join . xss)
  (apply append xss))

;; Create a randomized playlist
(define (playlists-shuffle . xss)
  (let ((xs (apply playlists-join xss)))
    (shuffle-fairly xs)))

;; Interleave playlists by alternating between them
(define (playlists-merge . xss)
  (playlists-perform-merge 0 0 #f xss))

;; Interleave playlists by randomly alternating between them
(define (playlists-merge-shuffle . xss)
  (playlists-perform-merge 0 0 #t xss))

;; Interleave n tracks from m playlists
(define (playlists-merge-window m n . xss)
  (playlists-perform-merge m n #f xss))

;; Randomly interleave n tracks from m playlists
(define (playlists-merge-window-shuffle m n . xss)
  (playlists-perform-merge m n #t xss))

;; Merge five artists at a time
(define (playlists-merge-5x5 . xss)
  (apply playlists-merge-window-shuffle 5 5 xss))

;; "Normalize" a mixed playlist by merging five artists at a time
(define (playlists-normalize . xss)
  (apply playlists-merge-5x5 (apply playlists-split xss)))

;; Sort by Last.fm playcount
(define (playlists-lastfm . xss)
  (let* ((xs (apply playlists-join xss))
         (total (length xs))
         (num 1)
         (rating 1)
         (ratings (list->vector
                   (map (lambda (track)
                          (echo (format "Track ~a/~a" num total))
                          (set! rating (lastfm-rating track))
                          (echo (format "~a\n" rating))
                          (set! num (+ num 1))
                          (cons rating track))
                        xs))))
    (heap-sort! (lambda (x y) (> (car x) (car y))) ratings)
    (map cdr (vector->list ratings))))

;; Sort by Last.fm playcount and normalize
(define (playlists-lastfm-normalize . xss)
  (playlists-normalize (apply playlists-lastfm xss)))

;; Fair random generator
(define random-generator%
  (class object% (super-new)

    (define outcomes '()) ; list of outcomes
    (define history '())  ; list of previous outcomes

    ;; get a random outcome
    (define/public (generator-random)
      (let ((len (length outcomes)))
        (cond
         ((= len 0)
          #f)
         ((<= len 2)
          (list-ref outcomes (random len)))
         (else
          (let ((outcome (list-ref outcomes (random len))))
            (do () ((<= (length history) (/ len 2)))
              (set! history (cdr history)))
            (do () ((not (member outcome history)))
              (set! outcome (list-ref outcomes (random len))))
            (set! history (append history (list outcome)))
            outcome)))))

    ;; add an outcome
    (define/public (generator-insert outcome)
      (set! outcomes (cons outcome outcomes)))

    ;; remove an outcome
    (define/public (generator-remove outcome)
      (set! history (remove outcome history))
      (set! outcomes (remove outcome outcomes)))

    ;; update an outcome
    (define/public (generator-update x y)
      (define (replace elt)
        (if (equal? elt x) y elt))
      (set! history (map replace history))
      (set! outcomes (map replace outcomes)))))

;; Merge n tracks from m playlists by interleaving or random choice
(define (playlists-perform-merge m n random xss)
  (let ((random (if (equal? random #t)
                    (new random-generator%)
                    random)))
    (define (merge window queue random acc)
      (cond
       ;; remove empty playlist from window
       ((memf (lambda (x) (null? (car x))) window)
        (when random (send random generator-remove '()))
        (merge (filter (lambda (x) (not (null? (car x)))) window)
               queue random acc))
       ;; put playlist back in queue when n tracks has been taken
       ((and (> n 0)
             (not (null? queue))
             (memf (lambda (x) (>= (cdr x) n)) window))
        (let* ((elt (findf (lambda (x) (>= (cdr x) n)) window))
               (window (remove elt window)))
          (when random (send random generator-remove (car elt)))
          (merge window (append queue (list (car elt))) random acc)))
       ;; insert playlist into window
       ((and (not (null? queue))
             (or (<= m 0) (< (length window) m)))
        (let* ((lst (car queue))
               (queue (cdr queue)))
          (when random (send random generator-insert lst))
          (merge (append window (list (cons lst 0)))
                 queue random acc)))
       ;; add track to accumulator
       ((not (null? window))
        (let* ((choice (if random
                           (send random generator-random)
                           (car (car window))))
               (track (car choice))
               (window (map (lambda (x)
                              (if (equal? (car x) choice)
                                  (cons (cdr (car x)) (+ (cdr x) 1))
                                  x))
                            (if random window
                                (append (cdr window)
                                        (list (car window)))))))
          (when random
            (send random generator-update choice (cdr choice)))
          (merge window queue random (cons track acc))))
       ;; return accumulator
       (else
        (reverse acc))))
    (merge '() xss random '())))

;; Split a playlist into several playlists (artists, albums, etc.)
(define (playlists-split . xss)
  (let* ((xs (apply playlists-join xss))
         (prefix (string-prefix xs)))
    (define (find-key str)
      (let ((regexp (format "^~a([^/]+)" (regexp-quote prefix))))
        (match (regexp-match regexp str)
          [(list prefix key matches ...)
           key]
          [_ ""])))
    (define (insert lst key val)
      (if (assoc key lst)
          (map (lambda (pair)
                 (if (equal? (car pair) key)
                     (cons key (cons val (cdr pair)))
                     pair))
               lst)
          (cons (cons key (list val)) lst)))
    (define (split xs acc)
      (if (null? xs)
          (map (lambda (lst) (reverse (cdr lst))) (reverse acc))
          (let* ((x (car xs))
                 (xs (cdr xs))
                 (key (find-key x)))
            (split xs (insert acc key x)))))
    (split xs '())))

;; Delete duplicates across playlists
(define (playlists-delete-duplicates . xss)
  (define (list->set xs)
    (define (convert xs acc)
      (cond
       ((null? xs)
        (reverse acc))
       ((member (car xs) acc)
        (convert (cdr xs) acc))
       (else
        (convert (cdr xs) (cons (car xs) acc)))))
    (convert xs '()))
  (define (delete xss acc)
    (cond
     ((null? xss)
      (reverse acc))
     (else
      (let* ((xs  (car xss))
             (xss (cdr xss)))
        (delete (map (lambda (l) (foldl remove l xs)) xss)
                (cons xs acc))))))
  (delete (map list->set xss) '()))

;; Interleave the union of two playlists.
;; Elements unique to XS are picked over elements unique to YS,
;; which are picked over common elements. Common elements are
;; picked from XS and removed from YS. The general case is a left fold,
;; i.e., (merge (merge (merge xs ys) zs) ...).
;;
;; Pseudo-code:
;;
;; -- unique x
;; merge (x:xs) ys =
;; x:merge xs ys
;;
;; -- unique y
;; merge xs y:ys =
;; x:merge xs ys
;;
;; -- common element
;; merge (x:xs) (ys1 ++ [x] ++ ys2) =
;; x:merge xs (ys1 ++ ys2)
(define (playlists-union . xss)
  (define (union ys-orig xs-orig)
    (define (union2 xs ys)
      (cond
       ((null? xs)
        ys)
       ((null? ys)
        xs)
       ;; unique xs element
       ((not (member (car xs) ys-orig))
        (cons (car xs)
              (union2 (cdr xs) ys)))
       ;; unique ys element
       ((not (member (car ys) xs))
        (cons (car ys)
              (union2 xs (cdr ys))))
       ;; common element
       (else
        (cons (car xs)
              (union2 (cdr xs)
                      (remove (car xs) ys))))))
    (union2 xs-orig ys-orig))
  (foldl union '() xss))

;; Interleave the intersection of playlists
(define (playlists-intersection . xss)
  (define (intersect xs ys)
    (cond
     ((null? xs)
      ys)
     ((null? ys)
      xs)
     ;; common element
     ((member (car xs) ys)
      (cons (car xs)
            (intersect (cdr xs) (remove (car xs) ys))))
     ;; unique element
     (else
      (intersect (cdr xs) ys))))
  (foldl (lambda (v l) (intersect l v)) '() xss))

;; Interleave the symmetric difference of playlists
(define (playlists-symmetric-difference . xss)
  (define (diff ys-orig xs-orig)
    (define (diff2 xs ys)
      (cond
       ((null? xs)
        ys)
       ((null? ys)
        xs)
       ;; unique xs element
       ((not (member (car xs) ys-orig))
        (cons (car xs)
              (diff2 (cdr xs) ys)))
       ;; unique ys element
       ((not (member (car ys) xs))
        (cons (car ys)
              (diff2 xs (cdr ys))))
       ;; common element
       (else
        (diff2 (cdr xs) (remove (car xs) ys)))))
    (diff2 xs-orig ys-orig))
  (foldl diff '() xss))

;; Calculate the difference between two playlists
(define (playlists-difference . xss)
  (define (diff xs ys)
    (cond
     ((null? xs)
      '())
     ;; unique xs element
     ((not (member (car xs) ys))
      (cons (car xs) (diff (cdr xs) ys)))
     ;; common element
     (else
      (diff (cdr xs) ys))))
  (foldl (lambda (v l) (diff l v)) (car xss) (cdr xss)))

;; Interleave two playlists by overlaying unique elements.
;; Elements from YS are only picked if they are unique.
;; Non-unique YS elements are ignored, and an element
;; from XS is picked instead. Thus, the unique elements of YS
;; are "overlaid" onto XS. The general case is a left fold,
;; i.e., (merge (merge (merge xs ys) zs) ...).
;;
;; Pseudo-code:
;;
;; -- unique y
;; merge xs y:ys =
;; x:merge xs ys
;;
;; -- common element
;; merge (x:xs) (x:xs)
;; x:merge xs ys
(define (playlists-merge-overlay . xss)
  (define (overlay ys-orig xs-orig)
    (define (overlay2 xs ys)
      (cond
       ((null? xs)
        ys)
       ((null? ys)
        xs)
       ;; unique ys element
       ((not (member (car ys) xs-orig))
        (cons (car ys) (overlay2 xs (cdr ys))))
       ;; common element
       (else
        (cons (car xs) (overlay2 (cdr xs) (cdr ys))))))
    (overlay2 xs-orig ys-orig))
  (foldl overlay '() xss))

;; Utility functions

(define (echo str)
  ;; don't mess up the output if we are
  ;; writing the playlist to stdout
  (if (null? (output-file)) #f (display str)))

;; Scan directory for tracks
(define (directory->playlist path)
  (let* ((cmd (format "find \"~a\" -iname \"*.mp3\" | sort" path))
         (out (with-output-to-string (lambda () (system cmd)))))
    (string-split out "\n")))

;; Randomly permute the elements of LST.
;; Ensure that a different list is returned.
(define (shuffle-fairly lst)
  (define (fair-shuffle lst)
    (let ((newlst (shuffle lst)))
      (if (equal? newlst lst)
          (fair-shuffle lst)
          newlst)))
  ;; ignore two-element lists since the only possible output is
  ;; (a b) => (b a), i.e., fair but not random
  (if (<= (length lst) 2)
      (shuffle lst)
      (fair-shuffle lst)))

;; Find the common string prefix of a list of strings.
(define (string-prefix lst)
  (cond
   ((null? lst)
    "")
   ((eq? (length lst) 1)
    (car lst))
   (else
    (foldl (lambda (str1 str2)
             (cond
              ((equal? str1 "")
               str2)
              ((equal? str2 "")
               str1)
              (else
               (let ((len (string-prefix-length str1 str2)))
                 (if (> len 0)
                     (substring str1 0 len)
                     "")))))
           "" lst))))

;; Return artist and track title of MP3 file
(define (id3 file)
  ;; out of mp3info, id3, id3v2, id3info and eyeD3,
  ;; eyeD3 seems to be the only handling special characters
  (let* ((cmd (format "eyeD3 --no-color \"~a\"" file))
         (out (with-output-to-string (lambda () (system cmd))))
         (regex #rx"title: ([^\n]*)\t\tartist: ([^\n]*)")
         (matches (regexp-match regex out))
         (artist (if matches (list-ref matches 2) ""))
         (track (if matches (list-ref matches 1) "")))
    (values artist track)))

;; Return Last.fm playcount for track
(define (lastfm-playcount artist track)
  (let* ((api "http://ws.audioscrobbler.com/2.0/?method=track.getInfo")
         (key "803d3cbea0bbe50c61ab81c4fe5fe20f")
         (artist (uri-encode artist))
         (track (uri-encode track))
         (url (format "~a&api_key=~a&artist=~a&track=~a"
                      api key artist track))
         (port (get-pure-port (string->url url)))
         (xml (xml->xexpr (document-element (read-xml port))))
         (node (se-path* '(track playcount) xml))
         (count (if node (string->number node) 0)))
    (close-input-port port)
    count))

;; Return Last.fm playcount for MP3 file
(define sleep-timer 0)
(define (lastfm-rating file)
  (let-values (((artist title) (id3 file)))
    (echo (format " (~a - ~a)... " artist title))
    ;; don't make more than 5 requests per second
    ;; (averaged over a 5 minute period)
    (cond
     ((>= sleep-timer 100)
      (set! sleep-timer 0)
      (sleep 10))
     (else
      (set! sleep-timer (+ sleep-timer 1))))
    (lastfm-playcount artist title)))

;; Command line parsing

(define (merge-func)
  (match (string-downcase (merge-arg))
    [(or "insert" "append" "concat" "concatenate" "join")
     playlists-join]
    [(or "random" "randomize" "shuffle")
     playlists-shuffle]
    [(or "interleave" "merge")
     playlists-merge]
    [(or "shuffle-merge" "shuffle-interleave" "interleave-shuffle" "merge-shuffle")
     playlists-merge-shuffle]
    [(or "union" "merge-union" "unique-merge" "unique-interleave" "interleave-unique" "merge-unique")
     playlists-union]
    [(or "intersection" "merge-intersection" "intersect")
     playlists-intersection]
    [(or "symmetric-difference")
     playlists-symmetric-difference]
    [(or "difference")
     playlists-difference]
    [(or "overlay" "overlay-merge" "overlay-interleave" "interleave-overlay" "merge-overlay")
     playlists-merge-overlay]
    [(or "5x5")
     playlists-merge-5x5]
    [(or "normalize" "norm")
     playlists-normalize]
    [(or "lastfm" "last.fm" "last")
     playlists-lastfm]
    [(or "lastfm-normalize" "last.fm-normalize" "last-normalize"
         "lastfm-norm" "last.fm-norm" "last-norm"
         "lastfmnorm")
     playlists-lastfm-normalize]
    [else
     playlists-merge-shuffle]))

(define merge-arg (make-parameter ""))

(define output-file (make-parameter null))

(define input-files
  (command-line
   #:once-each
   [("-m" "--method" "--merge-func") mf
    "Merge function"
    (merge-arg mf)]
   [("-o" "--output" "--output-file") of
    "Output file"
    (output-file of)]
   #:args filename
   filename))

;; Seed the random number generator
(random-seed (abs (current-milliseconds)))

(define input-lists
  (map (lambda (path)
         (if (directory-exists? path)
             (directory->playlist path)
             (file->lines path)))
       input-files))

(define output-list
  (apply (merge-func) input-lists))

(define output
  (string-append (string-join output-list "\n") "\n"))

;; Write to file or standard output
(cond
 ((not (null? (output-file)))
  (display-to-file output (output-file) #:exists 'replace))
 (else
  (display output)))
