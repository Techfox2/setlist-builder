# setlist-builder

A Spotify-style web app for phones. Classmates open the link, search any song and add it to one shared queue. The host (you) plays songs from that queue on Spotify.

- **Song catalog:** Apple's free iTunes Search API. It needs no key, covers basically everything on Spotify, and comes with cover art and 30-second previews.
- **Hosting:** one Cloudflare Worker. The free plan is enough. The shared queue lives in a Durable Object, and phones stay updated live over a WebSocket.

## Features

- Search with genre tiles, recent searches, and a 30s preview player
- A "Trending right now" shelf from Apple's charts for your country
- Live queue that updates on every phone instantly, plus a "N here" counter
- Likes (♥) to vote for songs. If someone adds a song that's already queued, it counts as a like instead of a duplicate
- Everyone has to sign up (name, username, password) before they can add or like songs. An optional class code keeps outsiders out
- People can remove their own songs. Filters: All / Added by you / Liked
- Each song has links to open it in Spotify or Apple Music
- **Dashboard** at `/admin`, behind your dashboard password:
  - Live stats: online now, members, active today, queue size, songs added today, played, likes
  - Full queue control and recently played
  - Members list: block or unblock, reset a forgotten password (you get a temporary one to tell them), delete accounts
  - Settings: allow sign-ups, class code, pause requests, explicit filter, queue order, songs per person
  - Activity log of who joined, added and removed what
- **Host mode on your phone** (tap the avatar and enter the same dashboard password):
  - Next song, play now, move to top, move up or down, mark played, add back from history, remove anything
  - Pause requests, block explicit songs (on by default), order by first come or most liked, songs-per-person limit (default 5)
  - Copy the whole list as text, clear the queue or history
- Guards: a basic spam rate limit, limits on wrong password guesses, salted password hashes, and song data always fetched on the server so nobody can inject fake songs

## Run locally

```bash
npm install
echo "ADMIN_PASSWORD=letmein" > .dev.vars
npm run dev            # app: http://localhost:8787  dashboard: /admin
```

## Deploy to Cloudflare

```bash
npx wrangler login
npx wrangler secret put ADMIN_PASSWORD   # pick your dashboard password
npm run deploy
```

Wrangler prints your URL (`https://setlist-builder.<you>.workers.dev`). Share it, or turn it into a QR code for the class.

## Getting songs into Spotify

Right now it's manual: in host mode, tap a song, then **Open in Spotify**, then *Add to queue* (or add it to your Jam or playlist). **Copy song list** gives you the whole queue as text.
