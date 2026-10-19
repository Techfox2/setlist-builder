# setlist-builder

A Spotify-style web app for phones. Classmates open the link, search any song and add it to one shared queue. The host (you) plays songs from that queue on Spotify.

- **Song catalog:** Apple's free iTunes Search API. It needs no key, covers basically everything on Spotify, and comes with cover art and 30-second previews.
- **Hosting:** one Cloudflare Worker. The free plan is enough. The shared queue lives in a Durable Object, and phones stay updated live over a WebSocket.

## Features

- Search with genre tiles, recent searches, and a 30s preview player
- A "Trending right now" shelf from Apple's charts for your country
- Live queue that updates on every phone instantly, plus a "N here" counter
- Likes (♥) to vote for songs. If someone adds a song that's already queued, it counts as a like instead of a duplicate
- People can remove their own songs. Filters: All / Added by you / Liked
- Each song has links to open it in Spotify or Apple Music
- **Host mode** (unlocked with a PIN, from the avatar in the top left):
  - Next song, play now, move to top, move up or down, mark played, add back from history, remove anything
  - Pause requests, block explicit songs (on by default), order by first come or most liked, songs-per-person limit (default 5)
  - Copy the whole list as text, clear the queue or history
- Guards: a basic spam rate limit, names required, and song data always fetched on the server so nobody can inject fake songs

## Run locally

```bash
npm install
echo "HOST_PIN=1234" > .dev.vars
npm run dev            # http://localhost:8787
```

## Deploy to Cloudflare

```bash
npx wrangler login
npx wrangler secret put HOST_PIN     # pick your host PIN
npm run deploy
```

Wrangler prints your URL (`https://setlist-builder.<you>.workers.dev`). Share it, or turn it into a QR code for the class.

## Getting songs into Spotify

Right now it's manual: in host mode, tap a song, then **Open in Spotify**, then *Add to queue* (or add it to your Jam or playlist). **Copy song list** gives you the whole queue as text.
