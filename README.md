# Lithium Level Estimator

A static lithium steady-state level estimator for psychiatrists and other psychiatric providers.

## Local Preview

```bash
npm run preview
```

Then open:

```text
http://127.0.0.1:8765/
```

## One-Time GitHub Pages Deployment

1. Create a new empty repository on GitHub.
2. In this folder, connect the repository:

```bash
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

3. In GitHub, open the repository settings.
4. Go to `Pages`.
5. Under `Build and deployment`, choose `GitHub Actions`.
6. The included workflow deploys the site automatically after each push to `main`.

Your first deployment will appear in the repository's `Actions` tab. When it finishes, GitHub will show the live website URL.

## Easy Updates

After editing the site, publish updates with:

```bash
npm run publish -- "Describe what changed"
```

That command checks the JavaScript, checks for accidental non-ASCII characters, commits the changes, and pushes to GitHub. GitHub Pages then redeploys automatically.

## Useful Files

- `index.html`: page content, SEO metadata, and calculator layout
- `styles.css`: visual styling and responsive layout
- `app.js`: calculator logic
- `robots.txt`: crawler access
- `.github/workflows/deploy.yml`: GitHub Pages deployment
- `scripts/publish.sh`: one-command update workflow

## After You Know The Final Website URL

Update the SEO metadata in `index.html` with the final public URL:

- Add a canonical URL.
- Add `og:url`.
- Consider adding a `sitemap.xml`.

## Clinical Notice

This tool is for licensed clinician decision support only. It is not medical advice, not a prescription, and not a substitute for clinical judgment, follow-up lithium levels, toxicity assessment, or local standard of care.
