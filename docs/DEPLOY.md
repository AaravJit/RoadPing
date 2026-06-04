# RoadPing Public Website (GitHub Pages)

The public marketing / support / privacy site is the static HTML in this `docs/`
folder. It is served by **GitHub Pages** from the `main` branch, `/docs` folder.

## Files

| File | Public URL |
| --- | --- |
| `index.html` | https://aaravjit.github.io/RoadPing/ |
| `support.html` | https://aaravjit.github.io/RoadPing/support.html |
| `privacy.html` | https://aaravjit.github.io/RoadPing/privacy.html |
| `styles.css` | shared stylesheet (relative link) |
| `.nojekyll` | tells GitHub Pages to serve files as-is (no Jekyll build) |

All links between pages are **relative** (`index.html`, `support.html`,
`privacy.html`, `styles.css`) so they resolve correctly under the project path
`/RoadPing/`. There are no images or external assets to break.

## One-time GitHub Pages setting

Repo **Settings → Pages**:

- **Source:** Deploy from a branch
- **Branch:** `main`
- **Folder:** `/docs`

Save. The first deploy takes ~1 minute; the URLs above go live after that.

The other `*.md` files in this folder are internal app documentation. They are
unrelated to the website and are simply ignored by it.
