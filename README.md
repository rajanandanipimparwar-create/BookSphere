# BookSphere

Free online library + used-book marketplace. No npm install needed (Node 18+ only).

## Run
    node server.js
Open http://localhost:3000

## What you get
- Thousands of free books (Project Gutenberg via the Gutendex catalog), 16 categories + search
- Reader: highlighter (4 colours + notes), bookmarks, chapters, in-book search, font/theme/width settings,
  read-aloud, dictionary lookup, auto-resume, minutes read, daily streak, yearly goal
- Dashboard: reading / pending (want to read) / finished, pages left per book, all bookmarks & highlights, export highlights
- Accounts (scrypt-hashed passwords). Progress, bookmarks and highlights sync to data/db.json
- Buy & Sell marketplace (login to list a book)
- Works without internet using 3 built-in books (public/books.json)

## Files
- server.js        API + static server (accounts, sync, catalog/text proxy, listings)
- public/          index.html, styles.css, app.js, books.json
- data/            db.json (users, progress) and cache/ (downloaded book texts) are created automatically
